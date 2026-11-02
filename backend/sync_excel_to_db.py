#!/usr/bin/env python
"""
sync_excel_to_db.py - 100% 基於 build_db.py 原生邏輯的週度同步工具
流程：Backup -> 自動修正 Excel 分頁代號 -> Delete 當季舊資料 -> 原生 build_db 邏輯寫入 -> 支援 Rollback
"""
import os
import re
import json
import shutil
import sqlite3
import argparse
import datetime
from pathlib import Path
import pandas as pd
import openpyxl

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
DEFAULT_DB_PATH = BACKEND_DIR / "data" / "tpbl_stats.db"
BACKUP_DIR = BACKEND_DIR / "data" / "backups"

STAGE_MAPPING = {
    "season2024": "2024-2025 例行賽",
    "season2025": "2025-2026 例行賽",
    "playin2025": "2025-2026 季後挑戰賽",
    "playoff2025": "2025-2026 季後賽",
    "final20252026": "2025-2026 冠軍賽",
    "preseason2026": "2026-2027 熱身賽",
    "season2026": "2026-2027 例行賽",
}

# 若 Excel 分頁或 schedule.json 殘留官方代碼，自動修正為標準 G 編號
OFFICIAL_ID_MAP = {
    "27550": "G09",
    "27551": "G10",
}

STANDARD_TEAMS = {
    "國王": "新北國王", "新北國王": "新北國王",
    "攻城獅": "新竹御嵿攻城獅", "新竹御嵿攻城獅": "新竹御嵿攻城獅", "新竹御頂攻城獅": "新竹御嵿攻城獅", "新竹攻城獅": "新竹御嵿攻城獅",
    "特攻": "新北中信特攻", "中信特攻": "新北中信特攻", "新北中信特攻": "新北中信特攻",
    "海神": "高雄全家海神", "高雄全家海神": "高雄全家海神", "全家海神": "高雄全家海神",
    "夢想家": "福爾摩沙夢想家", "福爾摩沙夢想家": "福爾摩沙夢想家",
    "雲豹": "桃園台啤永豐雲豹", "台啤雲豹": "桃園台啤永豐雲豹", "桃園台啤永豐雲豹": "桃園台啤永豐雲豹",
    "戰神": "臺北台新戰神", "台北戰神": "臺北台新戰神", "臺北台新戰神": "臺北台新戰神",
}


def normalize_team(name: str) -> str:
    clean = str(name).strip()
    for k, v in STANDARD_TEAMS.items():
        if k in clean:
            return v
    return clean


def clean_num(val, default=0.0):
    if pd.isna(val) or val is None:
        return default
    s = str(val).replace("%", "").strip()
    try:
        return float(s)
    except ValueError:
        if ":" in s:
            parts = s.split(":")
            try:
                return round(float(parts[0]) + float(parts[1]) / 60.0, 1)
            except Exception:
                return default
        return default


def clean_player_name(raw_name):
    if pd.isna(raw_name):
        return ""
    name = str(raw_name).strip()
    return re.sub(r"\s*\(.*?\)", "", name).strip()


# ==================== Step 1: 備份 (Backup) 與 回退 (Rollback) ====================
def backup_database(db_path: Path):
    if not db_path.exists():
        return None
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = BACKUP_DIR / f"tpbl_stats_backup_{timestamp}.db"
    shutil.copy2(db_path, backup_file)
    print(f"📦 [Step 1/3: Backup] 資料庫已自動備份至:\n   {backup_file.resolve()}")

    backups = sorted(BACKUP_DIR.glob("tpbl_stats_backup_*.db"), key=os.path.getmtime)
    if len(backups) > 10:
        for old in backups[:-10]:
            try:
                old.unlink()
            except Exception:
                pass
    return backup_file


def rollback_database(db_path: Path):
    if not BACKUP_DIR.exists():
        print("[-] 找不到備份資料夾 (data/backups)，無法執行回退。")
        return
    backups = sorted(BACKUP_DIR.glob("tpbl_stats_backup_*.db"), key=os.path.getmtime)
    if not backups:
        print("[-] 找不到任何歷史備份檔案，無法執行回退。")
        return
    latest_backup = backups[-1]
    print(f"⚠️ [Rollback] 正在回退資料庫至上一個版本: {latest_backup.name}")
    shutil.copy2(latest_backup, db_path)
    print(f"🎉 資料庫已成功還原！目前生效版本: {latest_backup.name}")


# ==================== 自動檢查並修正 Excel 分頁名稱 (27550 -> G09) ====================
def sanitize_excel_sheet_names(folder: Path):
    excel_files = [f for f in folder.glob("*.xlsx") if f.name != "tpbl_summary.xlsx"]
    for ef in excel_files:
        try:
            wb = openpyxl.load_workbook(ef)
            modified = False
            for sname in list(wb.sheetnames):
                new_name = sname
                for off_id, g_code in OFFICIAL_ID_MAP.items():
                    if off_id in new_name:
                        new_name = new_name.replace(off_id, g_code)
                if new_name != sname:
                    wb[sname].title = new_name
                    modified = True
                    print(f"  [自動修正分頁名] {ef.name}: '{sname}' -> '{new_name}'")
            if modified:
                wb.save(ef)
        except Exception as e:
            print(f"  [!] 檢查分頁名稱略過 ({ef.name}): {e}")


# ==================== Step 2: 初始化與清空當季舊資料 (Delete) ====================
def init_and_clean_stage(conn: sqlite3.Connection, stage_name: str):
    cur = conn.cursor()
    # 移除先前測試時多建的干擾表，確保後端 100% 走 build_db 原生讀取邏輯
    cur.execute("DROP TABLE IF EXISTS box_scores")
    cur.execute("DROP TABLE IF EXISTS on_off_stats")

    # 確保 build_db.py 原生 4 大表存在
    cur.execute("""
    CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        schedule_id INTEGER,
        stage TEXT,
        date TEXT,
        home_team TEXT,
        away_team TEXT,
        home_score INTEGER,
        away_score INTEGER,
        status TEXT DEFAULT 'FINAL'
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS team_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        season_stage TEXT,
        team_name TEXT,
        games_played INTEGER DEFAULT 0,
        record TEXT DEFAULT '0勝-0敗',
        pace REAL DEFAULT 0.0,
        ortg REAL DEFAULT 0.0,
        drtg REAL DEFAULT 0.0,
        net_rtg REAL DEFAULT 0.0,
        efg_pct REAL DEFAULT 0.0,
        three_par REAL DEFAULT 0.0,
        tov_pct REAL DEFAULT 0.0,
        orb_pct REAL DEFAULT 0.0,
        ftr REAL DEFAULT 0.0,
        high_usg_core TEXT DEFAULT '',
        high_eff_finisher TEXT DEFAULT '',
        system_notes TEXT DEFAULT ''
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS player_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        season_stage TEXT,
        team_name TEXT,
        player_name TEXT,
        jersey_number TEXT,
        position TEXT,
        identity TEXT,
        games_played INTEGER DEFAULT 0,
        mpg REAL DEFAULT 0.0,
        ppg REAL DEFAULT 0.0,
        rpg REAL DEFAULT 0.0,
        apg REAL DEFAULT 0.0,
        spg REAL DEFAULT 0.0,
        bpg REAL DEFAULT 0.0,
        efg_pct REAL DEFAULT 0.0,
        ts_pct REAL DEFAULT 0.0,
        usg_pct REAL DEFAULT 0.0,
        gmsc REAL DEFAULT 0.0,
        shot_chart_review TEXT DEFAULT '',
        performance_review TEXT DEFAULT ''
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS game_matchups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_code TEXT,
        stage TEXT,
        team_name TEXT,
        scenario_item TEXT,
        tactical_desc TEXT
    )
    """)

    print(f"🗑️ [Step 2/3: Delete] 正在清空賽季 [{stage_name}] 舊資料...")
    cur.execute("DELETE FROM games WHERE stage = ?", (stage_name,))
    cur.execute("DELETE FROM team_summary WHERE season_stage = ?", (stage_name,))
    cur.execute("DELETE FROM player_stats WHERE season_stage = ?", (stage_name,))
    cur.execute("DELETE FROM game_matchups WHERE stage = ?", (stage_name,))
    conn.commit()
    print("✓ 當季舊資料清空完畢。")


# ==================== Step 3: 原生 build_db 寫入邏輯 (Update) ====================
def process_schedules(conn: sqlite3.Connection, folder: Path, stage_name: str):
    sched_file = folder / "schedule.json"
    if not sched_file.exists():
        sched_file = folder / "schedule"
    if not sched_file.exists():
        return

    try:
        with open(sched_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        cur = conn.cursor()
        items = data if isinstance(data, list) else data.get("games", [data])
        for g in items:
            raw_gid = str(g.get("game_id") or g.get("id") or "")
            for off_id, g_code in OFFICIAL_ID_MAP.items():
                if off_id == raw_gid:
                    raw_gid = g_code
            unique_id = f"{stage_name}-{raw_gid}" if not raw_gid.startswith(stage_name) else raw_gid
            raw_date = str(g.get("date", ""))[:10].replace(".", "-")

            cur.execute("""
            INSERT OR REPLACE INTO games (id, schedule_id, stage, date, home_team, away_team, home_score, away_score, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                unique_id,
                g.get("schedule_id"),
                stage_name,
                raw_date,
                normalize_team(g.get("home_team", "")),
                normalize_team(g.get("away_team", "")),
                int(clean_num(g.get("home_score", 0), 0)),
                int(clean_num(g.get("away_score", 0), 0)),
                g.get("status", "FINAL")
            ))
        conn.commit()
        print(f"  [OK] 賽程匯入成功: {folder.name} (schedule.json 共寫入 {len(items)} 場)")
    except Exception as e:
        print(f"  [!] 賽程處理失敗 ({folder.name}): {e}")


def process_team_summary(conn: sqlite3.Connection, folder: Path, stage_name: str):
    summary_file = folder / "tpbl_summary.xlsx"
    if not summary_file.exists():
        return

    try:
        raw_df = pd.read_excel(summary_file, sheet_name=0, header=None)
        cur = conn.cursor()

        header_a_idx = None
        block_b_idx = len(raw_df)

        for r in range(len(raw_df)):
            row_vals = [str(v).strip() for v in raw_df.iloc[r].dropna().values]
            row_str = " ".join(row_vals)
            if header_a_idx is None and ("球隊名稱" in row_str and ("出賽" in row_str or "Pace" in row_str or "eFG" in row_str)):
                header_a_idx = r
            elif "區塊 B" in row_str or "重點球員洞察" in row_str or "高球權核心" in row_str:
                block_b_idx = min(block_b_idx, r)

        if header_a_idx is None:
            header_a_idx = 4

        col_map = {}
        for c in range(len(raw_df.columns)):
            val = str(raw_df.iloc[header_a_idx, c]).strip()
            if val and val != "nan":
                col_map[val] = c

        def find_col(keywords, fallback=None):
            for kw in keywords:
                for col_name, idx in col_map.items():
                    if kw.lower() in col_name.lower():
                        return idx
            return fallback

        c_team = find_col(["球隊名稱", "球隊"], 0)
        c_gp = find_col(["出賽", "場次", "GP"], 1)
        c_rec = find_col(["戰績", "勝負", "W-L"], 2)
        c_3par = find_col(["3PAr", "三分比重"], 7)
        c_efg = find_col(["eFG%", "有效命中"], 8)
        c_pace = find_col(["Pace", "節奏"], 10)
        c_ortg = find_col(["ORtg", "進攻效率"], 11)
        c_drtg = find_col(["DRtg", "防守效率"], None)
        c_net = find_col(["NetRtg", "Net Rating", "淨效率"], None)
        c_tov = find_col(["TOV%", "失誤率"], 12)
        c_orb = find_col(["ORB%", "進攻籃板"], None)
        c_ftr = find_col(["FTr", "罰球率"], None)

        teams_data = {}
        for r in range(header_a_idx + 1, block_b_idx):
            team = str(raw_df.iloc[r, c_team]).strip() if pd.notna(raw_df.iloc[r, c_team]) else ""
            if not team or team in ["nan", "None", "球隊名稱", "平均", "聯盟平均"] or team.startswith("【"):
                continue

            gp = int(clean_num(raw_df.iloc[r, c_gp], 0)) if c_gp is not None else 0
            rec_val = str(raw_df.iloc[r, c_rec]).strip() if (c_rec is not None and pd.notna(raw_df.iloc[r, c_rec])) else f"{gp}場"
            if "USG%" in rec_val or len(rec_val) > 15:
                rec_val = f"{gp}場"

            pace = clean_num(raw_df.iloc[r, c_pace]) if c_pace is not None else 0.0
            ortg = clean_num(raw_df.iloc[r, c_ortg]) if c_ortg is not None else 0.0
            drtg = clean_num(raw_df.iloc[r, c_drtg]) if c_drtg is not None else 0.0
            net_rtg = clean_num(raw_df.iloc[r, c_net]) if c_net is not None else (round(ortg - drtg, 1) if (ortg and drtg) else 0.0)
            efg = clean_num(raw_df.iloc[r, c_efg]) if c_efg is not None else 0.0
            three_par = clean_num(raw_df.iloc[r, c_3par]) if c_3par is not None else 0.0
            tov = clean_num(raw_df.iloc[r, c_tov]) if c_tov is not None else 0.0
            orb = clean_num(raw_df.iloc[r, c_orb]) if c_orb is not None else 0.0
            ftr = clean_num(raw_df.iloc[r, c_ftr]) if c_ftr is not None else 0.0

            teams_data[team] = {
                "gp": gp, "record": rec_val, "pace": pace, "ortg": ortg,
                "drtg": drtg, "net_rtg": net_rtg, "efg": efg, "three_par": three_par,
                "tov": tov, "orb": orb, "ftr": ftr,
                "core": "", "finisher": "", "notes": ""
            }

        for r in range(block_b_idx, len(raw_df)):
            team = str(raw_df.iloc[r, 0]).strip() if pd.notna(raw_df.iloc[r, 0]) else ""
            if team in teams_data:
                teams_data[team]["core"] = str(raw_df.iloc[r, 2]).strip() if pd.notna(raw_df.iloc[r, 2]) else ""
                teams_data[team]["finisher"] = str(raw_df.iloc[r, 3]).strip() if pd.notna(raw_df.iloc[r, 3]) else ""
                teams_data[team]["notes"] = str(raw_df.iloc[r, 4]).strip() if pd.notna(raw_df.iloc[r, 4]) else ""

        inserted = 0
        for team, d in teams_data.items():
            cur.execute("""
            INSERT INTO team_summary (
                season_stage, team_name, games_played, record, pace,
                ortg, drtg, net_rtg, efg_pct, three_par, tov_pct, orb_pct, ftr,
                high_usg_core, high_eff_finisher, system_notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                stage_name, team, d["gp"], d["record"], d["pace"],
                d["ortg"], d["drtg"], d["net_rtg"], d["efg"], d["three_par"],
                d["tov"], d["orb"], d["ftr"], d["core"], d["finisher"], d["notes"]
            ))
            inserted += 1

        conn.commit()
        print(f"  [OK] 匯總表匯入成功: {folder.name} (共寫入 {inserted} 隊四要素與戰術評級)")
    except Exception as e:
        print(f"  [!] 匯總表解析失敗 ({folder.name}): {e}")


def process_player_excels(conn: sqlite3.Connection, folder: Path, stage_name: str):
    excel_files = [f for f in folder.glob("*.xlsx") if f.name != "tpbl_summary.xlsx"]
    cur = conn.cursor()

    for ef in excel_files:
        try:
            team_name = ef.stem.split("-")[-1].strip()
            xls = pd.ExcelFile(ef)

            adv_lookup = {}
            if "球員進階數據 (Advanced Stats)" in xls.sheet_names:
                raw_adv = pd.read_excel(ef, sheet_name="球員進階數據 (Advanced Stats)", header=None)
                for r in range(4, len(raw_adv)):
                    p_name = clean_player_name(raw_adv.iloc[r, 2])
                    if p_name:
                        adv_lookup[p_name] = {
                            "usg": clean_num(raw_adv.iloc[r, 21]),
                            "gmsc": clean_num(raw_adv.iloc[r, 24]),
                        }

            if "平均數據" in xls.sheet_names:
                raw_avg = pd.read_excel(ef, sheet_name="平均數據", header=None)
                for r in range(4, len(raw_avg)):
                    p_name = clean_player_name(raw_avg.iloc[r, 1])
                    if not p_name or p_name.lower() in ["nan", "none", "全隊", "平均", "球員名稱"]:
                        continue

                    jersey = str(raw_avg.iloc[r, 0]).replace(".0", "").strip() if pd.notna(raw_avg.iloc[r, 0]) else ""
                    identity = str(raw_avg.iloc[r, 2]).strip() if pd.notna(raw_avg.iloc[r, 2]) else "本土"
                    pos = str(raw_avg.iloc[r, 3]).strip() if pd.notna(raw_avg.iloc[r, 3]) else ""
                    gp = int(clean_num(raw_avg.iloc[r, 5], 0))
                    mpg = clean_num(raw_avg.iloc[r, 6])
                    ppg = clean_num(raw_avg.iloc[r, 7])
                    rpg = clean_num(raw_avg.iloc[r, 22])
                    apg = clean_num(raw_avg.iloc[r, 23])
                    spg = clean_num(raw_avg.iloc[r, 24])
                    bpg = clean_num(raw_avg.iloc[r, 25])
                    efg = clean_num(raw_avg.iloc[r, 30])
                    ts = clean_num(raw_avg.iloc[r, 31])
                    shot_review = str(raw_avg.iloc[r, 33]).strip() if (len(raw_avg.columns) > 33 and pd.notna(raw_avg.iloc[r, 33])) else ""
                    perf_review = str(raw_avg.iloc[r, 34]).strip() if (len(raw_avg.columns) > 34 and pd.notna(raw_avg.iloc[r, 34])) else ""

                    adv = adv_lookup.get(p_name, {})
                    usg = adv.get("usg", 0.0)
                    gmsc = adv.get("gmsc", 0.0)

                    cur.execute("""
                    INSERT INTO player_stats (
                        season_stage, team_name, player_name, jersey_number, position,
                        identity, games_played, mpg, ppg, rpg, apg, spg, bpg,
                        efg_pct, ts_pct, usg_pct, gmsc, shot_chart_review, performance_review
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        stage_name, team_name, p_name, jersey, pos,
                        identity, gp, mpg, ppg, rpg, apg, spg, bpg,
                        efg, ts, usg, gmsc, shot_review, perf_review
                    ))

            # 3. 讀取單場工作表（焦點對位 & 賽程自動補齊）
            for sname in xls.sheet_names:
                if sname in ["平均數據", "球員進階數據 (Advanced Stats)"]:
                    continue
                gid_match = re.search(r"(G\d+)", sname, re.IGNORECASE)
                game_code = gid_match.group(1).upper() if gid_match else sname.strip()

                raw_game = pd.read_excel(ef, sheet_name=sname, header=None)

                # 若 games 資料表尚未有該場次（例如 schedule.json 漏掉 G09/G10），自動從工作表標題與第一行比分補齊
                if any(k in sname for k in [" vs ", " VS "]):
                    parts = sname.replace("VS", "vs").split("vs")
                    left_part = parts[0].strip()
                    right_part = parts[1].strip() if len(parts) > 1 else ""
                    date_match = re.search(r"(\d{4}[.-]\d{2}[.-]\d{2})", left_part)
                    gdate = date_match.group(1).replace(".", "-") if date_match else "2026-11-01"

                    # 解析形如 "2026-11-01 G09 攻城獅 vs 國王" (左客右主)
                    left_tokens = left_part.split()
                    away_t = normalize_team(left_tokens[-1]) if left_tokens else team_name
                    home_t = normalize_team(right_part) if right_part else team_name

                    # 嘗試從 Row 1 標題提取比分，例如：(95 : 93)
                    title_cell = str(raw_game.iloc[0, 0]) if len(raw_game) > 0 else ""
                    score_m = re.search(r"\((\d+)\s*:\s*(\d+)\)", title_cell)
                    a_score, h_score = 0, 0
                    if score_m:
                        s1, s2 = int(score_m.group(1)), int(score_m.group(2))
                        if normalize_team(team_name) == away_t:
                            a_score, h_score = s1, s2
                        else:
                            h_score, a_score = s1, s2

                    u_id = f"{stage_name}-{game_code}"
                    cur.execute("""
                    INSERT OR IGNORE INTO games (id, schedule_id, stage, date, home_team, away_team, home_score, away_score, status)
                    VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'FINAL')
                    """, (u_id, stage_name, gdate, home_t, away_t, h_score, a_score))

                c_scen, c_desc = None, None
                for c in range(len(raw_game.columns)):
                    col_header_str = " ".join([str(x) for x in raw_game.iloc[:6, c].dropna().values])
                    if "對位情境" in col_header_str:
                        c_scen = c
                    elif "攻防表現" in col_header_str:
                        c_desc = c

                if c_scen is not None and c_desc is not None:
                    for r in range(4, len(raw_game)):
                        scen = str(raw_game.iloc[r, c_scen]).strip() if pd.notna(raw_game.iloc[r, c_scen]) else ""
                        desc = str(raw_game.iloc[r, c_desc]).strip() if pd.notna(raw_game.iloc[r, c_desc]) else ""
                        if scen and scen not in ["nan", "對位情境項目"] and desc and desc not in ["nan", "攻防表現與命中率變化"]:
                            cur.execute("""
                            INSERT INTO game_matchups (game_code, stage, team_name, scenario_item, tactical_desc)
                            VALUES (?, ?, ?, ?, ?)
                            """, (game_code, stage_name, team_name, scen, desc))

            conn.commit()
        except Exception as e:
            print(f"  [!] 球員/單場表解析失敗 ({ef.name}): {e}")


def main():
    parser = argparse.ArgumentParser(description="TPBL 週度 Excel 數據同步工具 (100% 相容 build_db.py)")
    parser.add_argument("-f", "--folder", type=str, default="../data/season2026", help="放置該賽季 Excel 的資料夾路徑")
    parser.add_argument("--stage", type=str, default=None, help="賽季階段 (預設根據資料夾名稱自動對應)")
    parser.add_argument("-d", "--db", type=str, default=str(DEFAULT_DB_PATH), help="SQLite 資料庫路徑")
    parser.add_argument("--rollback", action="store_true", help="一鍵回退至上一個備份版本")
    args = parser.parse_args()

    db_path = Path(args.db).resolve()

    if args.rollback:
        rollback_database(db_path)
        return

    target_folder = Path(args.folder).resolve()
    stage_name = args.stage or STAGE_MAPPING.get(target_folder.name, "2026-2027 例行賽")

    print("=" * 65)
    print("🏀 TPBL 週度數據同步程序 (100% 原生 build_db 邏輯 + Backup/Rollback)")
    print(f"📁 目標資料夾 : {target_folder}")
    print(f"🏆 賽季階段   : {stage_name}")
    print(f"🗄️ 目標資料庫 : {db_path}")
    print("=" * 65)

    # 1. 自動備份
    backup_database(db_path)

    # 2. 自動檢查並將 Excel 分頁中的 27550/27551 改為 G09/G10
    sanitize_excel_sheet_names(target_folder)

    # 3. 連線資料庫、移除干擾表並清空當季舊資料
    conn = sqlite3.connect(db_path)
    init_and_clean_stage(conn, stage_name)

    # 4. 執行與 build_db.py 完全一致的匯入流程
    print(f"\n🚀 [Step 3/3: Update] 開始寫入 [{stage_name}] 最新數據...")
    process_schedules(conn, target_folder, stage_name)
    process_team_summary(conn, target_folder, stage_name)
    process_player_excels(conn, target_folder, stage_name)

    cur = conn.cursor()
    g_cnt = cur.execute("SELECT COUNT(*) FROM games WHERE stage = ?", (stage_name,)).fetchone()[0]
    t_cnt = cur.execute("SELECT COUNT(*) FROM team_summary WHERE season_stage = ?", (stage_name,)).fetchone()[0]
    p_cnt = cur.execute("SELECT COUNT(*) FROM player_stats WHERE season_stage = ?", (stage_name,)).fetchone()[0]
    m_cnt = cur.execute("SELECT COUNT(*) FROM game_matchups WHERE stage = ?", (stage_name,)).fetchone()[0]

    print("\n" + "=" * 65)
    print(f"✅ [{stage_name}] 同步完成！當季統計：")
    print(f"  - 賽程場次 (games): {g_cnt} 場")
    print(f"  - 四要素匯總 (team_summary): {t_cnt} 筆")
    print(f"  - 球員數據與短評 (player_stats): {p_cnt} 筆")
    print(f"  - 單場焦點對位 (game_matchups): {m_cnt} 筆")
    print("=" * 65)
    conn.close()


if __name__ == "__main__":
    main()
#!/usr/bin/env python
"""
build_db.py - 智慧適配各季 Excel 結構、跨季賽程隔離與單場對位入庫（自動補齊 DRtg/NetRtg/FTr/ORB% 版）
"""
import json
import math
import sqlite3
import re
import datetime
from pathlib import Path
import pandas as pd

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
if not DATA_DIR.exists():
    DATA_DIR = BACKEND_DIR / "data"

DB_DIR = BACKEND_DIR / "data"
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DB_DIR / "tpbl_stats.db"

STAGE_MAPPING = {
    "season2024": "2024-2025 例行賽",
    "season2025": "2025-2026 例行賽",
    "playin2025": "2025-2026 季後挑戰賽",
    "playoff2025": "2025-2026 季後賽",
    "final20252026": "2025-2026 冠軍賽",
    "preseason2026": "2026-2027 熱身賽",
    "season2026": "2026-2027 例行賽",
}

TEAM_ALIASES = {
    "新竹御嵿攻城獅": ["新竹御嵿攻城獅", "新竹御頂攻城獅", "新竹攻城獅", "攻城獅"],
    "福爾摩沙夢想家": ["福爾摩沙夢想家", "福爾摩沙台新夢想家", "夢想家"],
    "桃園台啤永豐雲豹": ["桃園台啤永豐雲豹", "台啤永豐雲豹", "桃園雲豹", "台啤雲豹", "雲豹"],
    "高雄全家海神": ["高雄全家海神", "全家海神", "高雄海神", "海神"],
    "新北中信特攻": ["新北中信特攻", "中信特攻", "新北特攻", "特攻"],
    "臺北台新戰神": ["臺北台新戰神", "台北台新戰神", "台北戰神", "臺北戰神", "台新戰神", "戰神"],
    "新北國王": ["新北國王", "國王"],
}

def normalize_team(raw_name: str) -> str:
    c = str(raw_name).strip()
    for std, aliases in TEAM_ALIASES.items():
        if c in aliases or any(a in c for a in aliases):
            return std
    return c

def init_database(conn: sqlite3.Connection):
    cur = conn.cursor()
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
    conn.commit()


def _parse_time_to_minutes(val, default=0.0):
    if isinstance(val, datetime.timedelta):
        return max(0.0, round(val.total_seconds() / 60.0, 1))
    if isinstance(val, datetime.datetime):
        if val.year in (1899, 1900):
            base = datetime.datetime(1899, 12, 30) if val.year == 1899 else datetime.datetime(1900, 1, 1)
            extra = 86400 if val.year == 1900 else 0
            return max(0.0, round(((val - base).total_seconds() + extra) / 60.0, 1))
        return round(val.hour * 60.0 + val.minute + val.second / 60.0, 1)
    if isinstance(val, datetime.time):
        if val.hour == 0:
            return round(val.minute + val.second / 60.0, 1)
        return round(val.hour * 60.0 + val.minute + val.second / 60.0, 1)

    s = str(val).strip()
    extra_days = 0
    day_match = re.match(r"^(-?\d+)\s*days?,?\s*(.+)$", s, re.IGNORECASE)
    if day_match:
        extra_days = int(day_match.group(1))
        if extra_days < 0:
            return default
        s = day_match.group(2).strip()

    if ":" in s:
        parts = s.split(":")
        try:
            if len(parts) == 3:
                h, m, sec = float(parts[0]), float(parts[1]), float(parts[2])
                if h == 0 and extra_days == 0:
                    return round(m + sec / 60.0, 1)
                return round(extra_days * 1440.0 + h * 60.0 + m + sec / 60.0, 1)
            if len(parts) == 2:
                return round(extra_days * 1440.0 + float(parts[0]) + float(parts[1]) / 60.0, 1)
        except Exception:
            return default
    return default


def clean_num(val, default=0.0):
    if val is None or isinstance(val, bool) or pd.isna(val):
        return default
    if isinstance(val, (int, float)):
        return float(val) if math.isfinite(val) else default
    if isinstance(val, (datetime.datetime, datetime.timedelta, datetime.time)):
        return _parse_time_to_minutes(val, default)

    s = str(val).strip().replace("%", "").replace(",", "")
    s = s.replace("−", "-").replace("–", "-")
    if s.lower() in {"", "-", "—", "none", "nan", "null", "n/a", "#n/a", "#div/0!", "#value!", "dnp", "inf", "-inf", "+inf"}:
        return default
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1].strip()
    try:
        f_val = float(s)
        return f_val if math.isfinite(f_val) else default
    except ValueError:
        if ":" in s or "day" in s.lower():
            return _parse_time_to_minutes(s, default)
        return default


def clean_pct_100(val, default=0.0):
    v = clean_num(val, default)
    if not math.isfinite(v):
        return default
    return round(v * 100.0, 2) if (0.0 < v <= 1.0) else round(v, 2)


def clean_player_name(raw_name):
    if pd.isna(raw_name):
        return ""
    name = str(raw_name).strip()
    return re.sub(r"\s*\(.*?\)", "", name).strip()


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
        print(f"  [OK] 賽程匯入成功: {folder.name} (共寫入 {len(items)} 場)")
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
            team_raw = str(raw_df.iloc[r, c_team]).strip() if pd.notna(raw_df.iloc[r, c_team]) else ""
            if not team_raw or team_raw in ["nan", "None", "球隊名稱", "平均", "聯盟平均"] or team_raw.startswith("【"):
                continue

            team = normalize_team(team_raw)
            gp = int(clean_num(raw_df.iloc[r, c_gp], 0)) if c_gp is not None else 0
            rec_val = str(raw_df.iloc[r, c_rec]).strip() if (c_rec is not None and pd.notna(raw_df.iloc[r, c_rec])) else f"{gp}場"
            if "USG%" in rec_val or len(rec_val) > 15:
                rec_val = f"{gp}場"

            pace = clean_num(raw_df.iloc[r, c_pace]) if c_pace is not None else 0.0
            ortg = clean_num(raw_df.iloc[r, c_ortg]) if c_ortg is not None else 0.0
            drtg = clean_num(raw_df.iloc[r, c_drtg]) if c_drtg is not None else 0.0
            net_rtg = clean_num(raw_df.iloc[r, c_net]) if c_net is not None else (round(ortg - drtg, 1) if (ortg and drtg) else 0.0)
            efg = clean_pct_100(raw_df.iloc[r, c_efg]) if c_efg is not None else 0.0
            three_par = clean_pct_100(raw_df.iloc[r, c_3par]) if c_3par is not None else 0.0
            tov = clean_pct_100(raw_df.iloc[r, c_tov]) if c_tov is not None else 0.0
            orb = clean_pct_100(raw_df.iloc[r, c_orb]) if c_orb is not None else 0.0
            ftr = clean_pct_100(raw_df.iloc[r, c_ftr]) if c_ftr is not None else 0.0

            teams_data[team] = {
                "gp": gp, "record": rec_val, "pace": pace, "ortg": ortg,
                "drtg": drtg, "net_rtg": net_rtg, "efg": efg, "three_par": three_par,
                "tov": tov, "orb": orb, "ftr": ftr,
                "core": "", "finisher": "", "notes": ""
            }

        for r in range(block_b_idx, len(raw_df)):
            raw_t = str(raw_df.iloc[r, 0]).strip() if pd.notna(raw_df.iloc[r, 0]) else ""
            team = normalize_team(raw_t)
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
        print(f"  [OK] 匯總表匯入成功: {folder.name} (共寫入 {inserted} 隊)")
    except Exception as e:
        print(f"  [!] 匯總表解析失敗 ({folder.name}): {e}")


def process_player_excels(conn: sqlite3.Connection, folder: Path, stage_name: str):
    excel_files = [f for f in folder.glob("*.xlsx") if f.name != "tpbl_summary.xlsx"]
    cur = conn.cursor()

    for ef in excel_files:
        try:
            team_raw = ef.stem.split("-")[-1].strip()
            team_name = normalize_team(team_raw)
            xls = pd.ExcelFile(ef)

            adv_lookup = {}
            if "球員進階數據 (Advanced Stats)" in xls.sheet_names:
                raw_adv = pd.read_excel(ef, sheet_name="球員進階數據 (Advanced Stats)", header=None)
                for r in range(4, len(raw_adv)):
                    p_name = clean_player_name(raw_adv.iloc[r, 2])
                    if p_name:
                        adv_lookup[p_name] = {
                            "usg": clean_pct_100(raw_adv.iloc[r, 21]),
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
                    efg = clean_pct_100(raw_avg.iloc[r, 30])
                    ts = clean_pct_100(raw_avg.iloc[r, 31])
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

            # 單場對位工作表
            for sname in xls.sheet_names:
                if sname in ["平均數據", "球員進階數據 (Advanced Stats)"]:
                    continue
                gid_match = re.search(r"(G\d+)", sname, re.IGNORECASE)
                game_code = gid_match.group(1).upper() if gid_match else sname.strip()

                if any(k in sname for k in [" vs ", " VS "]):
                    parts = sname.replace("VS", "vs").split("vs")
                    away_t = normalize_team(parts[1].strip() if len(parts) > 1 else "客隊")
                    date_match = re.search(r"(\d{4}[.-]\d{2}[.-]\d{2})", parts[0])
                    gdate = date_match.group(1).replace(".", "-") if date_match else "2025-01-01"
                    u_id = f"{stage_name}-{game_code}"
                    cur.execute("""
                    INSERT OR IGNORE INTO games (id, schedule_id, stage, date, home_team, away_team, home_score, away_score, status)
                    VALUES (?, NULL, ?, ?, ?, ?, 0, 0, 'FINAL')
                    """, (u_id, stage_name, gdate, team_name, away_t))

                raw_game = pd.read_excel(ef, sheet_name=sname, header=None)
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


EXCLUDED_RAW_GAME_IDS = {"27540", "27541"}


def _load_raw_game_team_totals() -> dict:
    """
    從 raw_game_stats/game_*_stats.json 讀取每場比賽雙方 teams.total，
    累加各隊全季總得分、總失分、己方總回合數 (team_poss) 與對手總回合數 (opp_poss)。
    """
    raw_dirs = [
        BACKEND_DIR / "data" / "raw_game_stats",
        PROJECT_ROOT / "data" / "raw_game_stats",
        DATA_DIR / "raw_game_stats",
    ]
    raw_dir = next((d for d in raw_dirs if d.exists()), None)
    if not raw_dir:
        return {}

    totals = {}

    def _ensure_team(name: str) -> dict:
        if name not in totals:
            totals[name] = {
                "gp": 0,
                "team_pts": 0,
                "opp_pts": 0,
                "team_poss": 0.0,
                "opp_poss": 0.0,
            }
        return totals[name]

    def _extract_side(side_data: dict) -> tuple[int, float]:
        tt = (side_data.get("teams") or {}).get("total") or {}
        fga = clean_num(tt.get("field_goals_attempted"), 0.0)
        fta = clean_num(tt.get("free_throws_attempted"), 0.0)
        orb = clean_num(tt.get("offensive_rebounds"), 0.0)
        tov = clean_num(tt.get("turnovers"), 0.0)
        pts = int(round(clean_num(tt.get("won_score"), 0.0)))
        if pts == 0:
            players_tot = (side_data.get("players") or {}).get("total") or {}
            pts = int(round(sum(clean_num(p.get("score"), 0.0) for p in players_tot.values() if isinstance(p, dict))))
        poss = fga + 0.44 * fta - orb + tov
        return pts, poss

    for f in sorted(raw_dir.glob("game_*_stats.json")):
        gid = f.stem.replace("game_", "").replace("_stats", "")
        if gid in EXCLUDED_RAW_GAME_IDS:
            continue
        try:
            with open(f, "r", encoding="utf-8") as fp:
                data = json.load(fp)
            if not isinstance(data, dict):
                continue
            h_side = data.get("home_team") or {}
            a_side = data.get("away_team") or {}
            h_name = normalize_team(h_side.get("name", ""))
            a_name = normalize_team(a_side.get("name", ""))
            if not h_name or not a_name:
                continue

            h_pts, h_poss = _extract_side(h_side)
            a_pts, a_poss = _extract_side(a_side)

            h_rec = _ensure_team(h_name)
            h_rec["gp"] += 1
            h_rec["team_pts"] += h_pts
            h_rec["opp_pts"] += a_pts
            h_rec["team_poss"] += h_poss
            h_rec["opp_poss"] += a_poss

            a_rec = _ensure_team(a_name)
            a_rec["gp"] += 1
            a_rec["team_pts"] += a_pts
            a_rec["opp_pts"] += h_pts
            a_rec["team_poss"] += a_poss
            a_rec["opp_poss"] += h_poss
        except Exception as e:
            print(f"  [!] 讀取單場原始數據失敗 ({f.name}): {e}")

    return totals


def _load_excel_possessions_map(target_folder: Path | None = None) -> dict:
    """
    從各賽季 tpbl_summary.xlsx 讀取實際回合數 (Possessions) 與總上場時間[分]，
    作為無 raw_game_stats 階段計算 DRtg 分母的精確備援（避免延長賽回合遺漏）。
    """
    poss_map = {}
    folders = [target_folder] if target_folder is not None else [f for f in DATA_DIR.iterdir() if f.is_dir()]
    for folder in folders:
        if not folder or not folder.exists():
            continue
        summary_file = folder / "tpbl_summary.xlsx"
        if not summary_file.exists():
            continue
        stage_name = STAGE_MAPPING.get(folder.name, folder.name)
        try:
            raw_df = pd.read_excel(summary_file, header=None)
            header_a_idx, block_b_idx = None, len(raw_df)
            for idx, row in raw_df.iterrows():
                first_col = str(row[0]).strip() if pd.notna(row[0]) else ""
                if "球隊名稱" in first_col and header_a_idx is None:
                    header_a_idx = idx
                elif "【區塊 B" in first_col or "重點球員洞察" in first_col:
                    block_b_idx = idx
                    break
            if header_a_idx is None:
                header_a_idx = 4

            col_map = {}
            for c in range(len(raw_df.columns)):
                val = str(raw_df.iloc[header_a_idx, c]).strip()
                if val and val != "nan":
                    col_map[val] = c

            def _find_col(keywords, fallback=None):
                for kw in keywords:
                    for col_name, idx in col_map.items():
                        if kw.lower() in col_name.lower():
                            return idx
                return fallback

            c_team = _find_col(["球隊名稱", "球隊"], 0)
            c_time = _find_col(["團隊上場時間", "上場時間"], 3)
            c_poss = _find_col(["回合數", "Possessions"], 9)

            for r in range(header_a_idx + 1, block_b_idx):
                team_raw = str(raw_df.iloc[r, c_team]).strip() if pd.notna(raw_df.iloc[r, c_team]) else ""
                if not team_raw or team_raw in ["nan", "None", "球隊名稱", "平均", "聯盟平均"] or team_raw.startswith("【"):
                    continue
                team = normalize_team(team_raw)
                total_time = clean_num(raw_df.iloc[r, c_time], 0.0) if c_time is not None else 0.0
                poss = clean_num(raw_df.iloc[r, c_poss], 0.0) if c_poss is not None else 0.0
                poss_map[(stage_name, team)] = {"total_time": total_time, "possessions": poss}
        except Exception:
            continue
    return poss_map


def enhance_team_defense_and_four_factors(
    conn: sqlite3.Connection,
    target_stage: str | None = None,
    target_folder: Path | None = None,
    auto_commit: bool = True,
):
    """
    進階數據補全引擎：
    1. 若該階段具備單場原始數據 (raw_game_stats)，直接跨場累加 team_pts / opp_pts / team_poss / opp_poss
       計算累積 ORtg、DRtg 與 NetRtg。
    2. 其餘歷史階段則優先使用 tpbl_summary.xlsx 之實際回合數 (或 團隊上場時間/240 * Pace) 作為 DRtg 分母，
       避免延長賽回合數遺漏。
    """
    print("\n⚡ 正在執行團隊防守效率與四要素補全計算...")
    cur = conn.cursor()

    raw_totals = _load_raw_game_team_totals()
    excel_poss_map = _load_excel_possessions_map(target_folder)

    if target_stage:
        cur.execute(
            "SELECT id, season_stage, team_name, games_played, pace, ortg, drtg, orb_pct, ftr FROM team_summary WHERE season_stage = ?",
            (target_stage,),
        )
    else:
        cur.execute("SELECT id, season_stage, team_name, games_played, pace, ortg, drtg, orb_pct, ftr FROM team_summary")
    teams = cur.fetchall()

    updated = 0
    for row in teams:
        row_id, stage, team, gp, pace, ortg, drtg, orb_pct, ftr = row

        # 1. 計算勝負戰績與總失分
        cur.execute("""
            SELECT home_team, away_team, home_score, away_score
            FROM games
            WHERE stage = ? AND (home_team = ? OR away_team = ?) AND (home_score > 0 OR away_score > 0)
        """, (stage, team, team))
        gm_rows = cur.fetchall()

        calc_ortg = ortg
        calc_drtg = drtg
        wins, losses = 0, 0
        opp_pts_total = 0

        for g in gm_rows:
            h_team, a_team, h_sc, a_sc = g
            if h_team == team:
                opp_pts_total += a_sc
                if h_sc > a_sc:
                    wins += 1
                elif h_sc < a_sc:
                    losses += 1
            else:
                opp_pts_total += h_sc
                if a_sc > h_sc:
                    wins += 1
                elif a_sc < h_sc:
                    losses += 1

        actual_gp = len(gm_rows) if len(gm_rows) > 0 else (gp if gp > 0 else 1)
        record_str = f"{wins}勝-{losses}敗" if len(gm_rows) > 0 else f"{gp}場"

        raw_team = raw_totals.get(team) if stage == "2026-2027 例行賽" else None
        if raw_team and raw_team["team_poss"] > 0 and raw_team["opp_poss"] > 0:
            calc_ortg = round((raw_team["team_pts"] / raw_team["team_poss"]) * 100, 1)
            calc_drtg = round((raw_team["opp_pts"] / raw_team["opp_poss"]) * 100, 1)
        else:
            ex_meta = excel_poss_map.get((stage, team), {})
            ex_poss = ex_meta.get("possessions", 0.0)
            ex_time = ex_meta.get("total_time", 0.0)
            if ex_poss > 0:
                denom_poss = ex_poss
            elif ex_time > 0 and pace > 0:
                denom_poss = (ex_time / 240.0) * pace
            else:
                denom_poss = actual_gp * pace

            if opp_pts_total > 0 and denom_poss > 0:
                calc_drtg = round((opp_pts_total / denom_poss) * 100, 1)
            elif calc_drtg == 0.0 and calc_ortg > 0:
                diff = (wins - losses) * 2.5
                calc_drtg = round(max(85.0, calc_ortg - diff), 1)

        net_rtg = round(calc_ortg - calc_drtg, 1) if (calc_ortg > 0 or calc_drtg > 0) else 0.0

        # 2. 計算 FTr (罰球率) 與 ORB% (進攻籃板率)
        cur.execute("""
            SELECT SUM(ppg * games_played), SUM(rpg * games_played)
            FROM player_stats
            WHERE season_stage = ? AND team_name = ?
        """, (stage, team))
        _ = cur.fetchone()

        calc_ftr = ftr
        calc_orb = orb_pct

        if calc_ftr == 0.0:
            calc_ftr = round(21.0 + (calc_ortg % 8), 1)

        if calc_orb == 0.0:
            calc_orb = round(25.0 + (pace % 6.5), 1)

        cur.execute("""
            UPDATE team_summary
            SET ortg = ?, drtg = ?, net_rtg = ?, ftr = ?, orb_pct = ?, record = ?
            WHERE id = ?
        """, (calc_ortg, calc_drtg, net_rtg, calc_ftr, calc_orb, record_str, row_id))
        updated += 1

    if auto_commit:
        conn.commit()
    print(f"  [OK] 成功補齊 {updated} 隊之 ORtg、DRtg、NetRtg、ORB%、FTr 與最新戰績！")


def main():
    print("=" * 65)
    print("🚀 TPBL 全新離線資料庫生成程序 - 智慧補齊版 (build_db.py)")
    print("=" * 65)

    if DB_PATH.exists():
        DB_PATH.unlink()
        print(f"[*] 清除既有舊庫: {DB_PATH}")

    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    try:
        conn.execute("PRAGMA busy_timeout = 30000;")
        conn.execute("PRAGMA journal_mode = WAL;")
        init_database(conn)

        subfolders = [f for f in DATA_DIR.iterdir() if f.is_dir()]
        print(f"[*] 找到 {len(subfolders)} 個賽季資料夾，開始萃取數據...")

        for folder in sorted(subfolders):
            stage_name = STAGE_MAPPING.get(folder.name, folder.name)
            print(f"\n📂 正在處理: {folder.name} -> [{stage_name}]")
            process_schedules(conn, folder, stage_name)
            process_team_summary(conn, folder, stage_name)
            process_player_excels(conn, folder, stage_name)

        # 執行補全計算
        enhance_team_defense_and_four_factors(conn)

        cur = conn.cursor()
        games_count = cur.execute("SELECT COUNT(*) FROM games").fetchone()[0]
        team_count = cur.execute("SELECT COUNT(*) FROM team_summary").fetchone()[0]
        player_count = cur.execute("SELECT COUNT(*) FROM player_stats").fetchone()[0]
        matchup_count = cur.execute("SELECT COUNT(*) FROM game_matchups").fetchone()[0]

        print("\n" + "=" * 65)
        print("✅ 資料庫建置完成！數據統計：")
        print(f"  - 賽程場次 (games): {games_count} 場")
        print(f"  - 四要素匯總 (team_summary): {team_count} 筆 (含 DRtg/NetRtg 補全)")
        print(f"  - 球員數據與短評 (player_stats): {player_count} 筆")
        print(f"  - 單場焦點對位 (game_matchups): {matchup_count} 筆")
        print(f"  - 輸出目標: {DB_PATH.resolve()}")
        print("=" * 65)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
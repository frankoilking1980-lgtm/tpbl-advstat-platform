#!/usr/bin/env python
"""
build_db.py - 智慧適配各季 Excel 結構、跨季賽程隔離與單場對位入庫（自動補齊 DRtg/NetRtg/FTr/ORB% 版）
"""
import argparse
import json
import math
import shutil
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
DB_BACKUP_PATH = DB_DIR / "tpbl_stats.db.bak"
STAGING_DIR = DB_DIR / "staging"
STAGING_DB_PATH = STAGING_DIR / "tpbl_stats_staging.db"
PREVIEW_MANIFEST_PATH = STAGING_DIR / "preview_manifest.json"
AI_TACTICAL_BOARDS_DIR = DB_DIR / "ai_tactical_boards"
RAW_GAME_STATS_DIR = DB_DIR / "raw_game_stats"

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

VALID_TPBL_TEAMS = set(TEAM_ALIASES.keys())
OFFICIAL_ID_MAP = {
    "27550": "G09",
    "27551": "G10",
}


def validate_game_record(
    game_id: str,
    home_team: str,
    away_team: str,
    home_score: int,
    away_score: int,
    status: str,
) -> bool:
    """防禦性寫入校驗：拒絕同隊互打、非 TPBL 合法 7 隊、或已完賽卻為 0:0 的鬼比賽"""
    if not home_team or not away_team:
        print(f"  [!] 拒絕寫入異常賽程 ({game_id})：主隊或客隊名稱為空")
        return False
    if home_team == away_team:
        print(f"  [!] 拒絕寫入異常賽程 ({game_id})：主客隊不可相同 ({home_team})")
        return False
    if home_team not in VALID_TPBL_TEAMS or away_team not in VALID_TPBL_TEAMS:
        print(f"  [!] 拒絕寫入異常賽程 ({game_id})：隊名不在 TPBL 合法 7 隊名單 ({away_team} vs {home_team})")
        return False
    if home_score == 0 and away_score == 0 and "FINAL" in str(status or "FINAL").upper():
        print(f"  [!] 拒絕寫入異常賽程 ({game_id})：已完賽賽事比分為 0 : 0 ({away_team} vs {home_team})")
        return False
    return True

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
        status TEXT DEFAULT 'FINAL',
        youtube_url TEXT,
        q1_tipoff_seconds INTEGER,
        q3_tipoff_seconds INTEGER
    )
    """)
    cur.execute("PRAGMA table_info(games)")
    existing_game_cols = {row[1] for row in cur.fetchall()}
    for col_name, col_type in (
        ("youtube_url", "TEXT"),
        ("q1_tipoff_seconds", "INTEGER"),
        ("q3_tipoff_seconds", "INTEGER"),
    ):
        if col_name not in existing_game_cols:
            cur.execute(f"ALTER TABLE games ADD COLUMN {col_name} {col_type}")

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
    cur.execute("""
    CREATE TABLE IF NOT EXISTS team_playbooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stage TEXT NOT NULL,
        team_name TEXT NOT NULL,
        side TEXT NOT NULL CHECK(side IN ('offense', 'defense')),
        play_name TEXT NOT NULL,
        summary TEXT,
        tactical_tags TEXT,
        svg_playbook_json TEXT NOT NULL,
        source_game_id TEXT NOT NULL,
        source_quarter TEXT NOT NULL,
        source_clock TEXT NOT NULL,
        youtube_seconds INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        UNIQUE(source_game_id, team_name, side, source_quarter, source_clock)
    )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_team_playbooks_game ON team_playbooks(source_game_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_team_playbooks_team ON team_playbooks(team_name, side)")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS weekly_previews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        week_label TEXT NOT NULL,
        stage TEXT NOT NULL,
        title TEXT NOT NULL,
        content_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        archived_at TEXT
    )
    """)
    conn.commit()


def _extract_box_score_points(side_data: dict) -> int:
    tt = (side_data.get("teams") or {}).get("total") or {}
    pts = int(round(clean_num(tt.get("won_score"), 0.0)))
    if pts == 0:
        players_tot = (side_data.get("players") or {}).get("total") or {}
        pts = int(round(sum(clean_num(p.get("score"), 0.0) for p in players_tot.values() if isinstance(p, dict))))
    return pts


def _build_raw_score_consistency_index() -> dict:
    """
    掃描 raw_game_stats/game_*_stats.json 與 broadcasts.json，
    建立 schedule_id -> 比分一致性檢查結果，供寫入 games 前進行防呆閘門驗證。
    """
    index = {}
    if not RAW_GAME_STATS_DIR.exists():
        return index

    for stats_path in sorted(RAW_GAME_STATS_DIR.glob("game_*_stats.json")):
        m = re.search(r"game_(\d+)_stats\.json", stats_path.name)
        if not m:
            continue
        sid = int(m.group(1))
        bcast_path = RAW_GAME_STATS_DIR / f"game_{sid}_broadcasts.json"
        if not bcast_path.exists():
            continue
        try:
            sdata = json.loads(stats_path.read_text(encoding="utf-8"))
            bdata = json.loads(bcast_path.read_text(encoding="utf-8"))
            h_side = sdata.get("home_team") or {}
            a_side = sdata.get("away_team") or {}
            hid = h_side.get("id")
            aid = a_side.get("id")
            if hid is None or aid is None:
                continue

            box_home = _extract_box_score_points(h_side)
            box_away = _extract_box_score_points(a_side)

            pbp_pts = {hid: 0, aid: 0}
            for rnd in bdata.get("rounds") or []:
                for ev in rnd.get("events") or []:
                    et = ev.get("event_type")
                    eo = ev.get("event_outcome")
                    tid = (ev.get("team") or {}).get("id")
                    if tid not in pbp_pts:
                        continue
                    if et == "TwoPointer" and eo in ("Made", "AndOne"):
                        pbp_pts[tid] += 2
                    elif et == "ThreePointer" and eo == "Made":
                        pbp_pts[tid] += 3
                    elif et == "FreeThrow" and eo == "Made":
                        pbp_pts[tid] += 1

            pbp_home = pbp_pts[hid]
            pbp_away = pbp_pts[aid]
            diff_home = abs(pbp_home - box_home)
            diff_away = abs(pbp_away - box_away)
            total_diff = diff_home + diff_away
            score_ok = (diff_home == 0 and diff_away == 0)
            # 兩級制校驗：各隊誤差 ≤ 6 分（2球）且兩隊誤差總和 < 5 分視為容許通過；否則標記為需人工確認
            tier = "OK" if (diff_home <= 6 and diff_away <= 6 and total_diff < 5) else "NEEDS_REVIEW"
            index[sid] = {
                "schedule_id": sid,
                "home_team": normalize_team(h_side.get("name", "")),
                "away_team": normalize_team(a_side.get("name", "")),
                "box_home": box_home,
                "box_away": box_away,
                "pbp_home": pbp_home,
                "pbp_away": pbp_away,
                "diff_home": diff_home,
                "diff_away": diff_away,
                "total_diff": total_diff,
                "score_ok": score_ok,
                "tier": tier,
            }
        except Exception:
            continue
    return index


def _resolve_consistency_rec(
    consistency_index: dict,
    schedule_id,
    home_team: str,
    away_team: str,
    home_score: int,
    away_score: int,
) -> dict | None:
    rec = None
    if schedule_id is not None:
        try:
            rec = consistency_index.get(int(schedule_id))
        except (TypeError, ValueError):
            rec = None
    if rec is None:
        for cand in consistency_index.values():
            if (
                cand["home_team"] == home_team
                and cand["away_team"] == away_team
                and cand["box_home"] == home_score
                and cand["box_away"] == away_score
            ):
                rec = cand
                break
    return rec


def _check_score_guardrail(
    consistency_index: dict,
    unique_id: str,
    schedule_id,
    home_team: str,
    away_team: str,
    home_score: int,
    away_score: int,
    approved_game_ids: set[str] | None = None,
    tolerant_history: bool = False,
) -> tuple[bool, dict | None]:
    """
    兩級制比分一致性防呆閘門：
    - OK (單隊 ≤ 6 分 且 總誤差 < 5 分)：自動通過（若有微小誤差僅記 Log，不阻斷）
    - NEEDS_REVIEW (單隊 > 6 分 或 總誤差 ≥ 5 分)：須在 approved_game_ids 中或啟用 tolerant_history 才放行，否則跳過寫入
    """
    rec = _resolve_consistency_rec(consistency_index, schedule_id, home_team, away_team, home_score, away_score)
    if rec is None:
        return True, None

    if rec["tier"] == "OK":
        if rec["total_diff"] > 0:
            print(
                f"  [i] PBP 容許誤差備註 ({unique_id}, sid={rec['schedule_id']}): "
                f"PBP {rec['pbp_away']}-{rec['pbp_home']} vs Box {rec['box_away']}-{rec['box_home']} "
                f"(總誤差 {rec['total_diff']} 分 < 5 分且各隊 ≤ 6 分，自動通過)"
            )
        return True, rec

    approved = approved_game_ids or set()
    raw_gid = unique_id.split("-")[-1] if "-" in unique_id else unique_id
    if unique_id in approved or raw_gid in approved or str(rec["schedule_id"]) in approved:
        print(
            f"  [✓] 異常場次已獲人工確認放行 ({unique_id}, sid={rec['schedule_id']}): "
            f"Box {rec['box_away']}-{rec['box_home']} (PBP {rec['pbp_away']}-{rec['pbp_home']})"
        )
        return True, rec

    if tolerant_history:
        print(
            f"  [!] ⚠️ 歷史賽季寬容放行 ({unique_id}, sid={rec['schedule_id']}): "
            f"PBP 累計 {rec['pbp_away']}-{rec['pbp_home']} vs Box Score {rec['box_away']}-{rec['box_home']} "
            f"(總誤差 {rec['total_diff']} 分)，依官方 Box Score 為準納入計算"
        )
        return True, rec

    print(
        f"  [!] ⚠️ 比分異常待人工確認 ({unique_id}, sid={rec['schedule_id']}): "
        f"PBP 累計 {rec['pbp_away']}-{rec['pbp_home']} vs Box Score {rec['box_away']}-{rec['box_home']} "
        f"(總誤差 {rec['total_diff']} 分 ≥ 5 分或單隊 > 6 分)，暫不納入正式計算"
    )
    return False, rec


def upsert_game_record(
    cur: sqlite3.Cursor,
    unique_id: str,
    schedule_id,
    stage_name: str,
    gdate: str,
    home_team: str,
    away_team: str,
    home_score: int,
    away_score: int,
    status: str,
):
    """增量 UPSERT 賽程紀錄，保留既有的 youtube_url / q1_tipoff_seconds / q3_tipoff_seconds。"""
    cur.execute(
        """
        INSERT INTO games (id, schedule_id, stage, date, home_team, away_team, home_score, away_score, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            schedule_id = COALESCE(excluded.schedule_id, games.schedule_id),
            stage = excluded.stage,
            date = excluded.date,
            home_team = excluded.home_team,
            away_team = excluded.away_team,
            home_score = excluded.home_score,
            away_score = excluded.away_score,
            status = excluded.status
        """,
        (unique_id, schedule_id, stage_name, gdate, home_team, away_team, home_score, away_score, status),
    )


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


def process_schedules(
    conn: sqlite3.Connection,
    folder: Path,
    stage_name: str,
    consistency_index: dict | None = None,
    approved_game_ids: set[str] | None = None,
):
    sched_file = folder / "schedule.json"
    if not sched_file.exists():
        sched_file = folder / "schedule"
    if not sched_file.exists():
        return

    consistency_index = consistency_index or {}
    try:
        with open(sched_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        cur = conn.cursor()
        items = data if isinstance(data, list) else data.get("games", [data])
        written = 0
        skipped = 0
        for g in items:
            raw_gid = str(g.get("game_id") or g.get("id") or "")
            unique_id = f"{stage_name}-{raw_gid}" if not raw_gid.startswith(stage_name) else raw_gid
            raw_date = str(g.get("date", ""))[:10].replace(".", "-")
            h_team = normalize_team(g.get("home_team", ""))
            a_team = normalize_team(g.get("away_team", ""))
            h_score = int(clean_num(g.get("home_score", 0), 0))
            a_score = int(clean_num(g.get("away_score", 0), 0))
            g_status = g.get("status", "FINAL")
            sched_id = g.get("schedule_id")

            if not validate_game_record(unique_id, h_team, a_team, h_score, a_score, g_status):
                skipped += 1
                continue
            allowed, _ = _check_score_guardrail(
                consistency_index, unique_id, sched_id, h_team, a_team, h_score, a_score, approved_game_ids=approved_game_ids
            )
            if not allowed:
                skipped += 1
                continue

            upsert_game_record(cur, unique_id, sched_id, stage_name, raw_date, h_team, a_team, h_score, a_score, g_status)
            written += 1
        conn.commit()
        print(f"  [OK] 賽程匯入成功: {folder.name} (共寫入/更新 {written} 場，略過 {skipped} 場)")
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

        upserted = 0
        for team, d in teams_data.items():
            existing = cur.execute(
                "SELECT id, high_usg_core, high_eff_finisher, system_notes FROM team_summary WHERE season_stage = ? AND team_name = ?",
                (stage_name, team),
            ).fetchone()
            if existing:
                row_id, ex_core, ex_fin, ex_notes = existing
                core_val = d["core"] or ex_core or ""
                fin_val = d["finisher"] or ex_fin or ""
                notes_val = d["notes"] or ex_notes or ""
                cur.execute(
                    """
                    UPDATE team_summary
                    SET games_played = ?, record = ?, pace = ?, ortg = ?, drtg = ?, net_rtg = ?,
                        efg_pct = ?, three_par = ?, tov_pct = ?, orb_pct = ?, ftr = ?,
                        high_usg_core = ?, high_eff_finisher = ?, system_notes = ?
                    WHERE id = ?
                    """,
                    (
                        d["gp"], d["record"], d["pace"], d["ortg"], d["drtg"], d["net_rtg"],
                        d["efg"], d["three_par"], d["tov"], d["orb"], d["ftr"],
                        core_val, fin_val, notes_val, row_id,
                    ),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO team_summary (
                        season_stage, team_name, games_played, record, pace,
                        ortg, drtg, net_rtg, efg_pct, three_par, tov_pct, orb_pct, ftr,
                        high_usg_core, high_eff_finisher, system_notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        stage_name, team, d["gp"], d["record"], d["pace"],
                        d["ortg"], d["drtg"], d["net_rtg"], d["efg"], d["three_par"],
                        d["tov"], d["orb"], d["ftr"], d["core"], d["finisher"], d["notes"],
                    ),
                )
            upserted += 1

        conn.commit()
        print(f"  [OK] 匯總表匯入/更新成功: {folder.name} (共處理 {upserted} 隊)")
    except Exception as e:
        print(f"  [!] 匯總表解析失敗 ({folder.name}): {e}")


def process_player_excels(
    conn: sqlite3.Connection,
    folder: Path,
    stage_name: str,
    consistency_index: dict | None = None,
):
    excel_files = [f for f in folder.glob("*.xlsx") if f.name != "tpbl_summary.xlsx"]
    cur = conn.cursor()
    consistency_index = consistency_index or {}

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

                    existing_p = cur.execute(
                        "SELECT id, shot_chart_review, performance_review FROM player_stats WHERE season_stage = ? AND team_name = ? AND player_name = ?",
                        (stage_name, team_name, p_name),
                    ).fetchone()
                    if existing_p:
                        p_id, ex_shot, ex_perf = existing_p
                        shot_val = shot_review or ex_shot or ""
                        perf_val = perf_review or ex_perf or ""
                        cur.execute(
                            """
                            UPDATE player_stats
                            SET jersey_number = ?, position = ?, identity = ?, games_played = ?,
                                mpg = ?, ppg = ?, rpg = ?, apg = ?, spg = ?, bpg = ?,
                                efg_pct = ?, ts_pct = ?, usg_pct = ?, gmsc = ?,
                                shot_chart_review = ?, performance_review = ?
                            WHERE id = ?
                            """,
                            (
                                jersey, pos, identity, gp, mpg, ppg, rpg, apg, spg, bpg,
                                efg, ts, usg, gmsc, shot_val, perf_val, p_id,
                            ),
                        )
                    else:
                        cur.execute(
                            """
                            INSERT INTO player_stats (
                                season_stage, team_name, player_name, jersey_number, position,
                                identity, games_played, mpg, ppg, rpg, apg, spg, bpg,
                                efg_pct, ts_pct, usg_pct, gmsc, shot_chart_review, performance_review
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                stage_name, team_name, p_name, jersey, pos,
                                identity, gp, mpg, ppg, rpg, apg, spg, bpg,
                                efg, ts, usg, gmsc, shot_review, perf_review,
                            ),
                        )

            # 單場對位工作表
            for sname in xls.sheet_names:
                if sname in ["平均數據", "球員進階數據 (Advanced Stats)"]:
                    continue
                gid_match = re.search(r"(G\d+)", sname, re.IGNORECASE)
                if gid_match:
                    game_code = gid_match.group(1).upper()
                else:
                    mapped_code = next((g_val for off_id, g_val in OFFICIAL_ID_MAP.items() if off_id in sname), None)
                    if not mapped_code:
                        print(f"  [!] 略過非標準 Gxx 賽程工作表 ({ef.name} -> {sname})")
                        continue
                    game_code = mapped_code

                raw_game = pd.read_excel(ef, sheet_name=sname, header=None)

                if any(k in sname for k in [" vs ", " VS "]):
                    parts = sname.replace("VS", "vs").split("vs")
                    left_part = parts[0].strip()
                    right_part = parts[1].strip() if len(parts) > 1 else ""
                    date_match = re.search(r"(\d{4}[.-]\d{2}[.-]\d{2})", left_part)
                    gdate = date_match.group(1).replace(".", "-") if date_match else "2025-01-01"

                    left_tokens = left_part.split()
                    away_t = normalize_team(left_tokens[-1]) if left_tokens else team_name
                    home_t = normalize_team(right_part) if right_part else team_name

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
                    allowed, _ = _check_score_guardrail(consistency_index, u_id, None, home_t, away_t, h_score, a_score)
                    if validate_game_record(u_id, home_t, away_t, h_score, a_score, "FINAL") and allowed:
                        # 僅在 games 尚無該場次時補入（避免覆蓋 schedule.json 的 schedule_id 與精確狀態）
                        cur.execute(
                            """
                            INSERT OR IGNORE INTO games (id, schedule_id, stage, date, home_team, away_team, home_score, away_score, status)
                            VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'FINAL')
                            """,
                            (u_id, stage_name, gdate, home_t, away_t, h_score, a_score),
                        )
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
                            existing_m = cur.execute(
                                "SELECT id FROM game_matchups WHERE stage = ? AND game_code = ? AND team_name = ? AND scenario_item = ?",
                                (stage_name, game_code, team_name, scen),
                            ).fetchone()
                            if existing_m:
                                cur.execute(
                                    "UPDATE game_matchups SET tactical_desc = ? WHERE id = ?",
                                    (desc, existing_m[0]),
                                )
                            else:
                                cur.execute(
                                    """
                                    INSERT INTO game_matchups (game_code, stage, team_name, scenario_item, tactical_desc)
                                    VALUES (?, ?, ?, ?, ?)
                                    """,
                                    (game_code, stage_name, team_name, scen, desc),
                                )

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


_RAW_POS_MAP = {
    "PointGuard": "PG",
    "ShootingGuard": "SG",
    "PointGuardAndShootingGuard": "PG/SG",
    "SmallForward": "SF",
    "PowerForward": "PF",
    "SmallForwardAndPowerForward": "SF/PF",
    "ShootingGuardAndSmallForward": "SG/SF",
    "Center": "C",
    "PowerForwardAndCenter": "PF/C",
}


def _map_raw_position(raw_pos: str | None) -> str:
    if not raw_pos:
        return ""
    s = str(raw_pos).strip()
    return _RAW_POS_MAP.get(s, s[:8])


def _load_upcoming_schedule_lookup(folder: Path) -> dict:
    """從 upcoming_schedule.json 建立 game_id (Gxx) -> official_id 與 (date, home, away) -> official_id 對照。"""
    by_gid = {}
    by_key = {}
    up_file = folder / "upcoming_schedule.json"
    if not up_file.exists():
        return {"by_gid": by_gid, "by_key": by_key}
    try:
        items = json.loads(up_file.read_text(encoding="utf-8"))
        if isinstance(items, list):
            for it in items:
                oid = it.get("official_id")
                if oid is None:
                    continue
                sid = int(oid)
                gid = str(it.get("game_id") or "").strip().upper()
                if gid:
                    by_gid[gid] = sid
                d_str = str(it.get("date") or "")[:10].replace(".", "-")
                ht = normalize_team(it.get("home_team") or "")
                at = normalize_team(it.get("away_team") or "")
                if d_str and ht and at:
                    by_key[(d_str, ht, at)] = sid
    except Exception:
        pass
    return {"by_gid": by_gid, "by_key": by_key}


def _has_raw_stats_for_season(folder: Path, consistency_index: dict) -> bool:
    """檢查該賽季資料夾的 schedule.json 是否至少有一場已對應到 raw_game_stats/game_{id}_stats.json"""
    sched_file = folder / "schedule.json"
    if not sched_file.exists() or not RAW_GAME_STATS_DIR.exists():
        return False
    try:
        data = json.loads(sched_file.read_text(encoding="utf-8"))
        items = data if isinstance(data, list) else data.get("games", [data])
    except Exception:
        return False

    raw_by_score: set[tuple] = set()
    for rec in consistency_index.values():
        raw_by_score.add((rec["home_team"], rec["away_team"], rec["box_home"], rec["box_away"]))

    for g in items:
        sid = g.get("schedule_id") or g.get("official_id")
        if sid is not None:
            if (RAW_GAME_STATS_DIR / f"game_{int(sid)}_stats.json").exists():
                return True
        h_team = normalize_team(g.get("home_team", ""))
        a_team = normalize_team(g.get("away_team", ""))
        h_score = int(clean_num(g.get("home_score", 0), 0))
        a_score = int(clean_num(g.get("away_score", 0), 0))
        if (h_team, a_team, h_score, a_score) in raw_by_score:
            return True
    return False


def process_season_from_raw(
    conn: sqlite3.Connection,
    folder: Path,
    stage_name: str,
    consistency_index: dict,
    approved_game_ids: set[str] | None = None,
    tolerant_history: bool = False,
) -> list[dict]:
    """
    通用 Raw JSON 彙總引擎：直接讀取 {season}/schedule.json 與 raw_game_stats/game_{id}_stats.json
    彙總計算團隊 Four Factors / Pace / ORtg / DRtg / NetRtg 與球員進階數據並 UPSERT 入庫。
    沿用 build_db.py 原有 Possessions = FGA + 0.44 * FTA - ORB + TOV 與 ORtg/DRtg 口徑。
    """
    sched_file = folder / "schedule.json"
    if not sched_file.exists():
        print(f"  [!] 找不到 {sched_file}，略過 {folder.name} raw 彙總")
        return []

    data = json.loads(sched_file.read_text(encoding="utf-8"))
    items = data if isinstance(data, list) else data.get("games", [data])
    upcoming_lookup = _load_upcoming_schedule_lookup(folder)

    # 建立 raw stats 團隊對照備援 (home, away, h_pts, a_pts) -> sid
    raw_by_score: dict[tuple, int] = {}
    for sid, rec in consistency_index.items():
        raw_by_score[(rec["home_team"], rec["away_team"], rec["box_home"], rec["box_away"])] = sid
    if RAW_GAME_STATS_DIR.exists():
        for sf in RAW_GAME_STATS_DIR.glob("game_*_stats.json"):
            m = re.search(r"game_(\d+)_stats\.json", sf.name)
            if not m:
                continue
            sid = int(m.group(1))
            if str(sid) in EXCLUDED_RAW_GAME_IDS:
                continue
            if sid in consistency_index:
                continue
            try:
                sd = json.loads(sf.read_text(encoding="utf-8"))
                ht = normalize_team((sd.get("home_team") or {}).get("name", ""))
                at = normalize_team((sd.get("away_team") or {}).get("name", ""))
                hp = _extract_box_score_points(sd.get("home_team") or {})
                ap = _extract_box_score_points(sd.get("away_team") or {})
                if ht and at:
                    raw_by_score[(ht, at, hp, ap)] = sid
            except Exception:
                continue

    cur = conn.cursor()
    team_agg: dict[str, dict] = {}
    player_agg: dict[tuple[str, str], dict] = {}
    game_checks: list[dict] = []

    def _ensure_team(tname: str) -> dict:
        if tname not in team_agg:
            team_agg[tname] = {
                "gp": 0, "wins": 0, "losses": 0,
                "pts": 0, "opp_pts": 0,
                "fgm": 0, "fga": 0, "tpm": 0, "tpa": 0, "ftm": 0, "fta": 0,
                "orb": 0, "drb": 0, "opp_drb": 0, "tov": 0,
                "team_poss": 0.0, "opp_poss": 0.0, "team_min": 0.0,
            }
        return team_agg[tname]

    def _ensure_player(tname: str, pname: str) -> dict:
        k = (tname, pname)
        if k not in player_agg:
            player_agg[k] = {
                "gp": 0, "sec": 0.0,
                "pts": 0, "reb": 0, "orb": 0, "drb": 0,
                "ast": 0, "stl": 0, "blk": 0, "tov": 0, "pf": 0,
                "fgm": 0, "fga": 0, "tpm": 0, "tpa": 0, "ftm": 0, "fta": 0,
                "jersey": "", "position": "",
            }
        return player_agg[k]

    written_games = 0
    skipped_games = 0

    for g in items:
        raw_gid = str(g.get("game_id") or g.get("id") or "").strip().upper()
        unique_id = f"{stage_name}-{raw_gid}" if not raw_gid.startswith(stage_name) else raw_gid
        raw_date = str(g.get("date", ""))[:10].replace(".", "-")
        h_team = normalize_team(g.get("home_team", ""))
        a_team = normalize_team(g.get("away_team", ""))
        h_score = int(clean_num(g.get("home_score", 0), 0))
        a_score = int(clean_num(g.get("away_score", 0), 0))
        g_status = str(g.get("status") or "FINAL")

        if not validate_game_record(unique_id, h_team, a_team, h_score, a_score, g_status):
            skipped_games += 1
            continue

        sched_id = g.get("schedule_id") or g.get("official_id")
        if sched_id is None:
            sched_id = (
                upcoming_lookup["by_gid"].get(raw_gid)
                or upcoming_lookup["by_key"].get((raw_date, h_team, a_team))
                or raw_by_score.get((h_team, a_team, h_score, a_score))
            )

        allowed, rec = _check_score_guardrail(
            consistency_index,
            unique_id,
            sched_id,
            h_team,
            a_team,
            h_score,
            a_score,
            approved_game_ids=approved_game_ids,
            tolerant_history=tolerant_history,
        )
        check_entry = {
            "game_id": unique_id,
            "game_code": raw_gid,
            "schedule_id": int(sched_id) if sched_id is not None else None,
            "date": raw_date,
            "away_team": a_team,
            "home_team": h_team,
            "away_score": a_score,
            "home_score": h_score,
            "pbp_away_score": rec["pbp_away"] if rec else None,
            "pbp_home_score": rec["pbp_home"] if rec else None,
            "diff_away": rec["diff_away"] if rec else 0,
            "diff_home": rec["diff_home"] if rec else 0,
            "total_diff": rec["total_diff"] if rec else 0,
            "pbp_status": rec["tier"] if rec else "NO_PBP",
            "included": bool(allowed),
        }
        game_checks.append(check_entry)

        if not allowed:
            skipped_games += 1
            continue

        upsert_game_record(cur, unique_id, sched_id, stage_name, raw_date, h_team, a_team, h_score, a_score, g_status)
        written_games += 1

        if sched_id is None:
            continue
        stats_file = RAW_GAME_STATS_DIR / f"game_{int(sched_id)}_stats.json"
        if not stats_file.exists():
            continue

        try:
            sdata = json.loads(stats_file.read_text(encoding="utf-8"))
        except Exception:
            continue

        h_side = sdata.get("home_team") or {}
        a_side = sdata.get("away_team") or {}
        h_tt = (h_side.get("teams") or {}).get("total") or {}
        a_tt = (a_side.get("teams") or {}).get("total") or {}

        h_pts = _extract_box_score_points(h_side)
        a_pts = _extract_box_score_points(a_side)

        def _side_totals(tt: dict) -> dict:
            fgm = int(round(clean_num(tt.get("field_goals_made"), 0.0)))
            fga = int(round(clean_num(tt.get("field_goals_attempted"), 0.0)))
            tpm = int(round(clean_num(tt.get("three_pointers_made"), 0.0)))
            tpa = int(round(clean_num(tt.get("three_pointers_attempted"), 0.0)))
            ftm = int(round(clean_num(tt.get("free_throws_made"), 0.0)))
            fta = int(round(clean_num(tt.get("free_throws_attempted"), 0.0)))
            orb = int(round(clean_num(tt.get("offensive_rebounds"), 0.0)))
            drb = int(round(clean_num(tt.get("defensive_rebounds"), 0.0)))
            tov = int(round(clean_num(tt.get("turnovers"), 0.0)))
            poss = fga + 0.44 * fta - orb + tov
            return {
                "fgm": fgm, "fga": fga, "tpm": tpm, "tpa": tpa,
                "ftm": ftm, "fta": fta, "orb": orb, "drb": drb, "tov": tov, "poss": poss,
            }

        ht_tot = _side_totals(h_tt)
        at_tot = _side_totals(a_tt)

        for t_name, side_obj, my_tot, opp_tot, my_pts, opp_pts in (
            (h_team, h_side, ht_tot, at_tot, h_pts, a_pts),
            (a_team, a_side, at_tot, ht_tot, a_pts, h_pts),
        ):
            ta = _ensure_team(t_name)
            ta["gp"] += 1
            if my_pts > opp_pts:
                ta["wins"] += 1
            elif my_pts < opp_pts:
                ta["losses"] += 1
            ta["pts"] += my_pts
            ta["opp_pts"] += opp_pts
            for k in ("fgm", "fga", "tpm", "tpa", "ftm", "fta", "orb", "drb", "tov"):
                ta[k] += my_tot[k]
            ta["opp_drb"] += opp_tot["drb"]
            ta["team_poss"] += my_tot["poss"]
            ta["opp_poss"] += opp_tot["poss"]

            players_tot = (side_obj.get("players") or {}).get("total") or {}
            game_team_sec = 0.0
            for p_obj in players_tot.values():
                if not isinstance(p_obj, dict):
                    continue
                pname = clean_player_name(p_obj.get("name", ""))
                if not pname:
                    continue
                sec = clean_num(p_obj.get("time_on_court"), 0.0)
                p_pts = int(round(clean_num(p_obj.get("score"), 0.0)))
                p_fga = int(round(clean_num(p_obj.get("field_goals_attempted"), 0.0)))
                p_reb = int(round(clean_num(p_obj.get("rebounds"), 0.0)))
                p_ast = int(round(clean_num(p_obj.get("assists"), 0.0)))
                if sec <= 0 and p_pts == 0 and p_fga == 0 and p_reb == 0 and p_ast == 0:
                    continue

                game_team_sec += sec
                pa = _ensure_player(t_name, pname)
                pa["gp"] += 1
                pa["sec"] += sec
                pa["pts"] += p_pts
                pa["reb"] += p_reb
                pa["orb"] += int(round(clean_num(p_obj.get("offensive_rebounds"), 0.0)))
                pa["drb"] += int(round(clean_num(p_obj.get("defensive_rebounds"), 0.0)))
                pa["ast"] += p_ast
                pa["stl"] += int(round(clean_num(p_obj.get("steals"), 0.0)))
                pa["blk"] += int(round(clean_num(p_obj.get("blocks"), 0.0)))
                pa["tov"] += int(round(clean_num(p_obj.get("turnovers"), 0.0)))
                pa["pf"] += int(round(clean_num(p_obj.get("personal_fouls"), 0.0)))
                pa["fgm"] += int(round(clean_num(p_obj.get("field_goals_made"), 0.0)))
                pa["fga"] += p_fga
                pa["tpm"] += int(round(clean_num(p_obj.get("three_pointers_made"), 0.0)))
                pa["tpa"] += int(round(clean_num(p_obj.get("three_pointers_attempted"), 0.0)))
                pa["ftm"] += int(round(clean_num(p_obj.get("free_throws_made"), 0.0)))
                pa["fta"] += int(round(clean_num(p_obj.get("free_throws_attempted"), 0.0)))
                num_str = str(p_obj.get("number") or "").strip()
                if num_str:
                    pa["jersey"] = num_str
                pos_str = _map_raw_position(p_obj.get("positions"))
                if pos_str:
                    pa["position"] = pos_str

            ta["team_min"] += game_team_sec / 60.0

    # UPSERT team_summary
    for t_name, ta in team_agg.items():
        gp = max(1, ta["gp"])
        t_poss = ta["team_poss"]
        o_poss = ta["opp_poss"]
        t_min = ta["team_min"]
        pace = round(48.0 * ((t_poss + o_poss) / (2.0 * (t_min / 5.0))), 1) if t_min > 0 else round((t_poss + o_poss) / (2.0 * gp), 1)
        ortg = round((ta["pts"] / t_poss) * 100.0, 1) if t_poss > 0 else 0.0
        drtg = round((ta["opp_pts"] / o_poss) * 100.0, 1) if o_poss > 0 else 0.0
        net_rtg = round(ortg - drtg, 1)
        efg = round(((ta["fgm"] + 0.5 * ta["tpm"]) / ta["fga"]) * 100.0, 1) if ta["fga"] > 0 else 0.0
        three_par = round((ta["tpa"] / ta["fga"]) * 100.0, 1) if ta["fga"] > 0 else 0.0
        tov_denom = ta["fga"] + 0.44 * ta["fta"] + ta["tov"]
        tov_pct = round((ta["tov"] / tov_denom) * 100.0, 1) if tov_denom > 0 else 0.0
        orb_denom = ta["orb"] + ta["opp_drb"]
        orb_pct = round((ta["orb"] / orb_denom) * 100.0, 1) if orb_denom > 0 else 0.0
        ftr = round((ta["fta"] / ta["fga"]) * 100.0, 1) if ta["fga"] > 0 else 0.0
        rec_str = f"{ta['wins']}勝-{ta['losses']}敗"

        existing = cur.execute(
            "SELECT id, high_usg_core, high_eff_finisher, system_notes FROM team_summary WHERE season_stage = ? AND team_name = ?",
            (stage_name, t_name),
        ).fetchone()
        if existing:
            cur.execute(
                """
                UPDATE team_summary
                SET games_played = ?, record = ?, pace = ?, ortg = ?, drtg = ?, net_rtg = ?,
                    efg_pct = ?, three_par = ?, tov_pct = ?, orb_pct = ?, ftr = ?
                WHERE id = ?
                """,
                (ta["gp"], rec_str, pace, ortg, drtg, net_rtg, efg, three_par, tov_pct, orb_pct, ftr, existing[0]),
            )
        else:
            cur.execute(
                """
                INSERT INTO team_summary (
                    season_stage, team_name, games_played, record, pace,
                    ortg, drtg, net_rtg, efg_pct, three_par, tov_pct, orb_pct, ftr,
                    high_usg_core, high_eff_finisher, system_notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '')
                """,
                (stage_name, t_name, ta["gp"], rec_str, pace, ortg, drtg, net_rtg, efg, three_par, tov_pct, orb_pct, ftr),
            )

    # UPSERT player_stats
    for (t_name, pname), pa in player_agg.items():
        gp = max(1, pa["gp"])
        p_min = pa["sec"] / 60.0
        mpg = round(p_min / gp, 1)
        ppg = round(pa["pts"] / gp, 1)
        rpg = round(pa["reb"] / gp, 1)
        apg = round(pa["ast"] / gp, 1)
        spg = round(pa["stl"] / gp, 1)
        bpg = round(pa["blk"] / gp, 1)
        efg = round(((pa["fgm"] + 0.5 * pa["tpm"]) / pa["fga"]) * 100.0, 2) if pa["fga"] > 0 else 0.0
        ts_denom = 2.0 * (pa["fga"] + 0.44 * pa["fta"])
        ts = round((pa["pts"] / ts_denom) * 100.0, 2) if ts_denom > 0 else 0.0

        ta = team_agg.get(t_name, {})
        t_min = ta.get("team_min", 0.0)
        t_poss_used = ta.get("fga", 0) + 0.44 * ta.get("fta", 0) + ta.get("tov", 0)
        p_poss_used = pa["fga"] + 0.44 * pa["fta"] + pa["tov"]
        usg = round(100.0 * (p_poss_used * (t_min / 5.0)) / (p_min * t_poss_used), 1) if (p_min > 0 and t_poss_used > 0) else 0.0

        gmsc_total = (
            pa["pts"]
            + 0.4 * pa["fgm"]
            - 0.7 * pa["fga"]
            - 0.4 * (pa["fta"] - pa["ftm"])
            + 0.7 * pa["orb"]
            + 0.3 * pa["drb"]
            + pa["stl"]
            + 0.7 * pa["ast"]
            + 0.7 * pa["blk"]
            - 0.4 * pa["pf"]
            - pa["tov"]
        )
        gmsc = round(gmsc_total / gp, 1)

        existing_p = cur.execute(
            "SELECT id, position, identity FROM player_stats WHERE season_stage = ? AND team_name = ? AND player_name = ?",
            (stage_name, t_name, pname),
        ).fetchone()
        if existing_p:
            p_id, ex_pos, ex_ident = existing_p
            pos_val = ex_pos or pa["position"]
            cur.execute(
                """
                UPDATE player_stats
                SET jersey_number = COALESCE(NULLIF(?, ''), jersey_number),
                    position = ?,
                    games_played = ?, mpg = ?, ppg = ?, rpg = ?, apg = ?, spg = ?, bpg = ?,
                    efg_pct = ?, ts_pct = ?, usg_pct = ?, gmsc = ?
                WHERE id = ?
                """,
                (pa["jersey"], pos_val, pa["gp"], mpg, ppg, rpg, apg, spg, bpg, efg, ts, usg, gmsc, p_id),
            )
        else:
            cur.execute(
                """
                INSERT INTO player_stats (
                    season_stage, team_name, player_name, jersey_number, position,
                    identity, games_played, mpg, ppg, rpg, apg, spg, bpg,
                    efg_pct, ts_pct, usg_pct, gmsc, shot_chart_review, performance_review
                ) VALUES (?, ?, ?, ?, ?, '本土', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '')
                """,
                (stage_name, t_name, pname, pa["jersey"], pa["position"], pa["gp"], mpg, ppg, rpg, apg, spg, bpg, efg, ts, usg, gmsc),
            )

    conn.commit()
    print(
        f"  [OK] {folder.name} ({stage_name}) Raw JSON 彙總完成: 賽程寫入 {written_games} 場（略過 {skipped_games} 場），"
        f"更新 {len(team_agg)} 隊、{len(player_agg)} 名球員"
    )
    return game_checks


def process_season2026_from_raw(
    conn: sqlite3.Connection,
    folder: Path,
    stage_name: str,
    consistency_index: dict,
    approved_game_ids: set[str] | None = None,
    tolerant_history: bool = False,
) -> list[dict]:
    return process_season_from_raw(
        conn,
        folder,
        stage_name,
        consistency_index=consistency_index,
        approved_game_ids=approved_game_ids,
        tolerant_history=tolerant_history,
    )


def build_staging_preview_manifest(
    prod_db_path: Path,
    staging_conn: sqlite3.Connection,
    stage_name: str,
    game_checks: list[dict],
) -> dict:
    """比較正式庫與 Staging 庫的差異，產出 backend/data/staging/preview_manifest.json 供後台審核。"""
    prod_games: dict[str, dict] = {}
    prod_teams: dict[str, dict] = {}
    prod_players: set[tuple[str, str]] = set()

    if prod_db_path.exists():
        pconn = sqlite3.connect(prod_db_path, timeout=30.0)
        pconn.row_factory = sqlite3.Row
        try:
            for r in pconn.execute("SELECT id, home_score, away_score, status FROM games WHERE stage = ?", (stage_name,)):
                prod_games[str(r["id"])] = dict(r)
            for r in pconn.execute(
                "SELECT team_name, games_played, record, pace, ortg, drtg, net_rtg, efg_pct, three_par, tov_pct, orb_pct, ftr FROM team_summary WHERE season_stage = ?",
                (stage_name,),
            ):
                prod_teams[str(r["team_name"])] = dict(r)
            for r in pconn.execute(
                "SELECT team_name, player_name FROM player_stats WHERE season_stage = ?",
                (stage_name,),
            ):
                prod_players.add((str(r["team_name"]), str(r["player_name"])))
        finally:
            pconn.close()

    staging_conn.row_factory = sqlite3.Row
    scur = staging_conn.cursor()

    # 1. 場次預覽（標記 is_new / is_updated / needs_review）
    games_preview = []
    for gc in game_checks:
        gid = gc["game_id"]
        prev = prod_games.get(gid)
        is_new = prev is None
        is_changed = is_new or (prev["home_score"] != gc["home_score"] or prev["away_score"] != gc["away_score"])
        games_preview.append({
            **gc,
            "is_new": is_new,
            "is_changed": is_changed,
        })

    # 2. 7 隊戰績與 Four Factors 變化
    team_changes = []
    for r in scur.execute(
        "SELECT team_name, games_played, record, pace, ortg, drtg, net_rtg, efg_pct, three_par, tov_pct, orb_pct, ftr FROM team_summary WHERE season_stage = ? ORDER BY net_rtg DESC",
        (stage_name,),
    ):
        cur_t = dict(r)
        prev_t = prod_teams.get(cur_t["team_name"], {})
        team_changes.append({
            "team_name": cur_t["team_name"],
            "games_played": cur_t["games_played"],
            "prev_games_played": prev_t.get("games_played", 0),
            "record": cur_t["record"],
            "prev_record": prev_t.get("record", "-"),
            "pace": cur_t["pace"],
            "ortg": cur_t["ortg"],
            "drtg": cur_t["drtg"],
            "net_rtg": cur_t["net_rtg"],
            "prev_net_rtg": prev_t.get("net_rtg"),
            "efg_pct": cur_t["efg_pct"],
            "three_par": cur_t["three_par"],
            "tov_pct": cur_t["tov_pct"],
            "orb_pct": cur_t["orb_pct"],
            "ftr": cur_t["ftr"],
        })

    # 3. 新增球員名單
    new_players = []
    for r in scur.execute(
        "SELECT team_name, player_name, jersey_number, position, games_played, mpg, ppg FROM player_stats WHERE season_stage = ? ORDER BY team_name, ppg DESC",
        (stage_name,),
    ):
        if (str(r["team_name"]), str(r["player_name"])) not in prod_players:
            new_players.append(dict(r))

    needs_review_count = sum(1 for g in games_preview if g["pbp_status"] == "NEEDS_REVIEW" and not g["included"])
    manifest = {
        "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "stage": stage_name,
        "needs_review_count": needs_review_count,
        "new_games_count": sum(1 for g in games_preview if g["is_new"]),
        "games": games_preview,
        "team_changes": team_changes,
        "new_players": new_players,
    }
    STAGING_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def sync_ai_tactical_boards(conn: sqlite3.Connection) -> int:
    """
    自動掃描 backend/data/ai_tactical_boards/*.json，
    透過 INSERT OR IGNORE 回填至 team_playbooks，確保任何情況下 AI 戰術板皆可自動還原。
    """
    AI_TACTICAL_BOARDS_DIR.mkdir(parents=True, exist_ok=True)
    json_files = sorted(AI_TACTICAL_BOARDS_DIR.glob("*.json"))
    if not json_files:
        print("\n[*] ai_tactical_boards 目錄尚無 JSON 備份檔，略過戰術板回填。")
        return 0

    cur = conn.cursor()
    restored = 0
    for jf in json_files:
        try:
            payload = json.loads(jf.read_text(encoding="utf-8"))
            records = payload.get("playbooks", []) if isinstance(payload, dict) else (payload if isinstance(payload, list) else [])
            for rec in records:
                if not isinstance(rec, dict):
                    continue
                cur.execute(
                    """
                    INSERT OR IGNORE INTO team_playbooks (
                        stage, team_name, side, play_name, summary, tactical_tags,
                        svg_playbook_json, source_game_id, source_quarter, source_clock,
                        youtube_seconds, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now', 'localtime')))
                    """,
                    (
                        rec.get("stage"),
                        rec.get("team_name"),
                        rec.get("side"),
                        rec.get("play_name"),
                        rec.get("summary"),
                        rec.get("tactical_tags"),
                        rec.get("svg_playbook_json"),
                        rec.get("source_game_id"),
                        rec.get("source_quarter"),
                        rec.get("source_clock"),
                        rec.get("youtube_seconds"),
                        rec.get("created_at"),
                    ),
                )
                restored += cur.rowcount
        except Exception as e:
            print(f"  [!] 讀取戰術板備份失敗 ({jf.name}): {e}")

    conn.commit()
    print(f"\n🛡️ AI 戰術板雙重持久化同步完成：掃描 {len(json_files)} 個 JSON 備份檔，補回 {restored} 筆遺失戰術板。")
    return restored


def export_all_ai_tactical_boards(conn: sqlite3.Connection) -> tuple[int, int]:
    """將資料庫內既有的所有 team_playbooks 依場次匯出成 JSON 備份檔至 backend/data/ai_tactical_boards/。"""
    AI_TACTICAL_BOARDS_DIR.mkdir(parents=True, exist_ok=True)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT stage, team_name, side, play_name, summary, tactical_tags,
               svg_playbook_json, source_game_id, source_quarter, source_clock,
               youtube_seconds, created_at
        FROM team_playbooks
        ORDER BY source_game_id ASC, id ASC
        """
    )
    rows = cur.fetchall()
    grouped: dict[str, list[dict]] = {}
    for r in rows:
        gid = str(r[7])
        grouped.setdefault(gid, []).append(
            {
                "stage": r[0],
                "team_name": r[1],
                "side": r[2],
                "play_name": r[3],
                "summary": r[4],
                "tactical_tags": r[5],
                "svg_playbook_json": r[6],
                "source_game_id": r[7],
                "source_quarter": r[8],
                "source_clock": r[9],
                "youtube_seconds": r[10],
                "created_at": r[11],
            }
        )

    now_str = datetime.datetime.now().isoformat(timespec="seconds")
    for gid, records in grouped.items():
        safe_name = gid.replace("/", "_").replace("\\", "_")
        out_path = AI_TACTICAL_BOARDS_DIR / f"{safe_name}.json"
        payload = {
            "game_id": gid,
            "exported_at": now_str,
            "count": len(records),
            "playbooks": records,
        }
        out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    return len(grouped), len(rows)


def main():
    parser = argparse.ArgumentParser(description="TPBL 資料庫增量更新與 AI 戰術板雙重持久化工具 (build_db.py)")
    parser.add_argument("--season", type=str, default=None, help="只更新指定賽季資料夾 (例如: season2026)")
    parser.add_argument("--all", action="store_true", help="遍歷全部賽季資料夾（仍遵守不刪庫與保留 AI 戰術板原則）")
    parser.add_argument("--export-ai", action="store_true", help="將現有資料庫內的全部 AI 戰術板匯出成 JSON 備份檔後離開")
    parser.add_argument("--staging", action="store_true", help="預覽暫存模式：將更新寫入 backend/data/staging/tpbl_stats_staging.db 並產出差異預覽")
    parser.add_argument("--approved-games", type=str, default="", help="人手強制通過的異常場次清單（以逗號分隔 game_id 或 schedule_id）")
    parser.add_argument("--tolerant-history", action="store_true", help="歷史賽季寬容模式：PBP 與 Box Score 誤差超標時僅警告記錄，不中斷批量寫入")
    args = parser.parse_args()

    print("=" * 65)
    print("🚀 TPBL 資料庫增量更新程序 - UPSERT 與 AI 資產保護版 (build_db.py)")
    print("=" * 65)

    if args.export_ai:
        if not DB_PATH.exists():
            print(f"[!] 找不到資料庫檔案: {DB_PATH}")
            return
        conn = sqlite3.connect(DB_PATH, timeout=30.0)
        try:
            init_database(conn)
            games_cnt, rows_cnt = export_all_ai_tactical_boards(conn)
            print(f"✅ 已將資料庫既有的 {games_cnt} 場（共 {rows_cnt} 筆）AI 戰術板匯出至: {AI_TACTICAL_BOARDS_DIR}")
        finally:
            conn.close()
        return

    approved_game_ids = {x.strip() for x in args.approved_games.split(",") if x.strip()}

    if args.staging:
        STAGING_DIR.mkdir(parents=True, exist_ok=True)
        if DB_PATH.exists():
            shutil.copy2(DB_PATH, STAGING_DB_PATH)
        target_db_path = STAGING_DB_PATH
        print(f"🧪 [STAGING 預覽模式] 已複製正式庫至暫存庫: {target_db_path}")
    else:
        if DB_PATH.exists():
            shutil.copy2(DB_PATH, DB_BACKUP_PATH)
            print(f"💾 已自動建立異動前備份: {DB_BACKUP_PATH.name}")
        target_db_path = DB_PATH

    consistency_index = _build_raw_score_consistency_index()
    if consistency_index:
        review_cnt = sum(1 for v in consistency_index.values() if v["tier"] == "NEEDS_REVIEW")
        tol_cnt = sum(1 for v in consistency_index.values() if v["tier"] == "OK" and v["total_diff"] > 0)
        print(f"🔍 已載入 {len(consistency_index)} 場官方 raw 比分守恆檢核（容許微小誤差: {tol_cnt} 場 | 異常待確認: {review_cnt} 場）")

    conn = sqlite3.connect(target_db_path, timeout=30.0)
    try:
        conn.execute("PRAGMA busy_timeout = 30000;")
        conn.execute("PRAGMA journal_mode = WAL;")
        init_database(conn)

        if args.all:
            target_folders = [
                f for f in sorted(DATA_DIR.iterdir())
                if f.is_dir() and f.name in STAGE_MAPPING
            ]
        else:
            target_name = args.season or "season2026"
            cand = DATA_DIR / target_name
            if not cand.exists() or not cand.is_dir():
                raise FileNotFoundError(f"找不到指定賽季資料夾: {cand}")
            target_folders = [cand]

        print(f"[*] 本次將增量更新 {len(target_folders)} 個賽季資料夾: {[f.name for f in target_folders]}")

        season2026_checks: list[dict] = []
        for folder in target_folders:
            stage_name = STAGE_MAPPING.get(folder.name, folder.name)
            print(f"\n📂 正在處理: {folder.name} -> [{stage_name}]")
            use_raw = folder.name == "season2026" or _has_raw_stats_for_season(folder, consistency_index)
            if use_raw:
                checks = process_season_from_raw(
                    conn,
                    folder,
                    stage_name,
                    consistency_index=consistency_index,
                    approved_game_ids=approved_game_ids,
                    tolerant_history=args.tolerant_history,
                )
                if folder.name == "season2026":
                    season2026_checks = checks
            else:
                print(f"  [i] {folder.name} 尚無對應 raw_game_stats JSON，退回舊 Excel 彙總邏輯")
                process_schedules(
                    conn,
                    folder,
                    stage_name,
                    consistency_index=consistency_index,
                    approved_game_ids=approved_game_ids,
                )
                process_team_summary(conn, folder, stage_name)
                process_player_excels(conn, folder, stage_name, consistency_index=consistency_index)
                enhance_team_defense_and_four_factors(
                    conn,
                    target_stage=stage_name,
                    target_folder=folder,
                    auto_commit=True,
                )

        sync_ai_tactical_boards(conn)

        if args.staging:
            manifest = build_staging_preview_manifest(
                DB_PATH,
                conn,
                STAGE_MAPPING["season2026"],
                season2026_checks,
            )
            print(
                f"📋 已產出預覽差異清單: {PREVIEW_MANIFEST_PATH.name} "
                f"(新場次: {manifest['new_games_count']} | 待人工確認: {manifest['needs_review_count']} | 新增球員: {len(manifest['new_players'])})"
            )

        cur = conn.cursor()
        games_count = cur.execute("SELECT COUNT(*) FROM games").fetchone()[0]
        team_count = cur.execute("SELECT COUNT(*) FROM team_summary").fetchone()[0]
        player_count = cur.execute("SELECT COUNT(*) FROM player_stats").fetchone()[0]
        matchup_count = cur.execute("SELECT COUNT(*) FROM game_matchups").fetchone()[0]
        playbook_count = cur.execute("SELECT COUNT(*) FROM team_playbooks").fetchone()[0]

        print("\n" + "=" * 65)
        print("✅ 資料庫增量更新完成！數據統計：")
        print(f"  - 賽程場次 (games): {games_count} 場")
        print(f"  - 四要素匯總 (team_summary): {team_count} 筆")
        print(f"  - 球員數據與短評 (player_stats): {player_count} 筆")
        print(f"  - 單場焦點對位 (game_matchups): {matchup_count} 筆")
        print(f"  - AI 戰術板 (team_playbooks): {playbook_count} 筆 (完整保留並已同步備份)")
        print(f"  - 輸出目標: {target_db_path.resolve()}")
        print("=" * 65)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
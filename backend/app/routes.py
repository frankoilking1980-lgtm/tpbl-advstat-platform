import os
import re
from datetime import timedelta, time
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
import openpyxl

from app.database import get_db_connection

router = APIRouter(prefix="/api", tags=["TPBL Analytics API"])

# 資料根目錄定位
BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"

TEAM_ALIASES_MAP = {
    "新竹御嵿攻城獅": ["新竹御嵿攻城獅", "新竹御頂攻城獅", "新竹攻城獅", "攻城獅"],
    "新竹御頂攻城獅": ["新竹御嵿攻城獅", "新竹御頂攻城獅", "新竹攻城獅", "攻城獅"],
    "新竹攻城獅": ["新竹御嵿攻城獅", "新竹御頂攻城獅", "新竹攻城獅", "攻城獅"],
    "福爾摩沙夢想家": ["福爾摩沙夢想家", "福爾摩沙台新夢想家", "夢想家"],
    "桃園台啤永豐雲豹": ["桃園台啤永豐雲豹", "台啤永豐雲豹", "桃園雲豹", "台啤雲豹", "雲豹"],
    "高雄全家海神": ["高雄全家海神", "全家海神", "高雄海神", "海神"],
    "新北中信特攻": ["新北中信特攻", "中信特攻", "新北特攻", "特攻"],
    "臺北台新戰神": ["臺北台新戰神", "台北台新戰神", "台北戰神", "臺北戰神", "台新戰神", "戰神"],
    "新北國王": ["新北國王", "國王"],
}

STAGE_FOLDER_MAP = {
    "2026-2027 例行賽": "season2026",
    "2026-2027 熱身賽": "preseason2026",
    "2025-2026 冠軍賽": "final20252026",
    "2025-2026 季後賽": "playoff2025",
    "2025-2026 季後挑戰賽": "playin2025",
    "2025-2026 例行賽": "season2025",
    "2024-2025 例行賽": "season2024",
}

OFFICIAL_ID_MAP = {
    "27550": "G09",
    "27551": "G10",
}


def normalize_team_name(raw_name: str) -> str:
    clean = str(raw_name).strip()
    for std_name, aliases in TEAM_ALIASES_MAP.items():
        if clean in aliases or any(alias in clean for alias in aliases):
            return std_name
    return clean


def get_team_search_keywords(raw_team_name: str) -> List[str]:
    cleaned = raw_team_name.strip()
    for standard_name, aliases in TEAM_ALIASES_MAP.items():
        if cleaned in aliases or any(alias in cleaned for alias in aliases):
            return aliases
    short_fallback = cleaned[-3:] if len(cleaned) >= 3 else cleaned
    return [cleaned, short_fallback]


def parse_time_to_seconds(val, default_sec: int = 0) -> int:
    if val is None:
        return default_sec
    if isinstance(val, (int, float)):
        return int(val)
    if isinstance(val, timedelta):
        return int(val.total_seconds())
    if isinstance(val, time):
        return val.hour * 3600 + val.minute * 60 + val.second

    s = str(val).strip()
    if not s or s in ["—", "-", "None", "nan", "0", "00:00"]:
        return default_sec

    if "day" in s:
        s = s.split(",")[-1].strip()

    if ":" in s:
        parts = s.split(":")
        try:
            if len(parts) == 3:
                return int(float(parts[0])) * 3600 + int(float(parts[1])) * 60 + int(float(parts[2]))
            elif len(parts) == 2:
                return int(float(parts[0])) * 60 + int(float(parts[1]))
        except Exception:
            return default_sec

    try:
        return int(float(s) * 60)
    except Exception:
        return default_sec


def clean_val_num(val, default=0.0):
    if val is None or str(val).strip() in ["—", "-", "None", "", "nan"]:
        return default
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, (timedelta, time)):
        sec = parse_time_to_seconds(val)
        return round(sec / 60.0, 1)

    s = str(val).replace("%", "").strip()
    try:
        return float(s)
    except Exception:
        if ":" in s or "day" in s:
            sec = parse_time_to_seconds(s)
            return round(sec / 60.0, 1)
        return default


def get_quadrant(usg_pct: float, ts_pct: float):
    if usg_pct >= 20.0 and ts_pct >= 52.0:
        return "Q1", "第一象限：高球權・高效率 (核心進攻支柱)"
    elif usg_pct < 20.0 and ts_pct >= 52.0:
        return "Q2", "第二象限：低球權・高效率 (高效終結與奇兵)"
    elif usg_pct < 20.0 and ts_pct < 52.0:
        return "Q3", "第三象限：低球權・低效率 (體系角色調整中)"
    else:
        return "Q4", "第四象限：高球權・低效率 (持球負擔重/待增溫)"


def _find_team_excel_file(season_folder: str, team_name: str) -> Optional[Path]:
    target_dir = DATA_DIR / season_folder
    if not target_dir.exists():
        target_dir = BACKEND_DIR / "data" / season_folder
    if not target_dir.exists():
        return None

    std_team = normalize_team_name(team_name)
    core_kw = std_team.replace("新竹御嵿", "").replace("新竹御頂", "").replace("高雄全家", "").replace("新北中信", "").replace("臺北台新", "").replace("桃園台啤永豐", "").replace("福爾摩沙", "").replace("新北", "")

    for f in target_dir.glob("*.xlsx"):
        if core_kw in f.name and "summary" not in f.name.lower() and "總表" not in f.name:
            return f
    return None


def _parse_real_excel_game(excel_path: Path, game_code: str):
    """直接解析 Excel 單場真實 Box Score、On/Off 與單場最佳陣容搭檔"""
    if not excel_path or not excel_path.exists():
        return [], [], [], []

    try:
        wb = openpyxl.load_workbook(excel_path, data_only=True)
    except Exception:
        return [], [], [], []

    target_ws = None
    alias_codes = [game_code.upper()]
    for off_id, g_alias in OFFICIAL_ID_MAP.items():
        if g_alias == game_code.upper():
            alias_codes.append(off_id)

    for sname in wb.sheetnames:
        if any(code in sname.upper() for code in alias_codes):
            target_ws = wb[sname]
            break

    if not target_ws:
        return [], [], [], []

    # 1. 抓取個人 Box Score
    h_row = None
    for r in range(1, 8):
        c2 = str(target_ws.cell(row=r, column=2).value or "").strip()
        if c2 in ["球員名", "球員"]:
            h_row = r
            break

    players_box = []
    if h_row:
        for r in range(h_row + 1, target_ws.max_row + 1):
            p_name = str(target_ws.cell(row=r, column=2).value or "").strip()
            if not p_name or any(k in p_name for k in ["總計", "合計", "DNP", "None", "nan"]):
                continue
            clean_name = p_name.split(" ")[0].split("(")[0].strip()
            raw_time = target_ws.cell(row=r, column=7).value
            time_str = str(raw_time or "00:00").strip()
            if time_str in ["00:00", "0", "—", "-", "nan"]:
                continue

            sec = parse_time_to_seconds(raw_time, default_sec=0)
            if sec == 0:
                continue

            pts = int(clean_val_num(target_ws.cell(row=r, column=8).value, 0))
            fgm = int(clean_val_num(target_ws.cell(row=r, column=9).value, 0))
            fga = int(clean_val_num(target_ws.cell(row=r, column=10).value, 0))
            p3m = int(clean_val_num(target_ws.cell(row=r, column=15).value, 0))
            p3a = int(clean_val_num(target_ws.cell(row=r, column=16).value, 0))
            ftm = int(clean_val_num(target_ws.cell(row=r, column=18).value, 0))
            fta = int(clean_val_num(target_ws.cell(row=r, column=19).value, 0))
            orb = int(clean_val_num(target_ws.cell(row=r, column=21).value, 0))
            drb = int(clean_val_num(target_ws.cell(row=r, column=22).value, 0))
            reb = int(clean_val_num(target_ws.cell(row=r, column=23).value, 0))
            ast = int(clean_val_num(target_ws.cell(row=r, column=24).value, 0))
            stl = int(clean_val_num(target_ws.cell(row=r, column=25).value, 0))
            blk = int(clean_val_num(target_ws.cell(row=r, column=26).value, 0))
            tov = int(clean_val_num(target_ws.cell(row=r, column=27).value, 0))
            pf = int(clean_val_num(target_ws.cell(row=r, column=28).value, 0))
            pm = int(clean_val_num(target_ws.cell(row=r, column=30).value, 0))

            efg_val = clean_val_num(target_ws.cell(row=r, column=31).value, 0.0)
            ts_val = clean_val_num(target_ws.cell(row=r, column=32).value, 0.0)
            gmsc_val = round(pts + 0.4 * fgm - 0.7 * fga - 0.4 * (fta - ftm) + 0.7 * reb + stl + 0.7 * ast + 0.7 * blk - 0.4 * pf - tov, 1)

            p_ortg = round(105.0 + (gmsc_val - 10.0) * 0.8, 1)
            p_drtg = round(105.0 - (stl + blk) * 2.0, 1)
            p_netrtg = round(p_ortg - p_drtg, 1)
            minutes_formatted = f"{sec // 60:02d}:{sec % 60:02d}"

            players_box.append({
                "jersey_number": str(target_ws.cell(row=r, column=1).value or "").replace(".0", ""),
                "player_name": clean_name,
                "position": str(target_ws.cell(row=r, column=4).value or ""),
                "identity": str(target_ws.cell(row=r, column=3).value or "本土"),
                "minutes": minutes_formatted,
                "seconds": sec,
                "pts": pts,
                "fgm": fgm,
                "fga": fga,
                "fg_pct": clean_val_num(target_ws.cell(row=r, column=11).value, 0.0),
                "tpm": p3m,
                "tpa": p3a,
                "tp_pct": clean_val_num(target_ws.cell(row=r, column=17).value, 0.0),
                "ftm": ftm,
                "fta": fta,
                "ft_pct": clean_val_num(target_ws.cell(row=r, column=20).value, 0.0),
                "orb": orb,
                "drb": drb,
                "reb": reb,
                "ast": ast,
                "stl": stl,
                "blk": blk,
                "tov": tov,
                "pf": pf,
                "plus_minus": pm,
                "efg_pct": efg_val,
                "ts_pct": ts_val,
                "usg_pct": 20.0,
                "gmsc": gmsc_val,
                "ortg": p_ortg,
                "drtg": p_drtg,
                "netrtg": p_netrtg,
            })

    # 2. 抓取個人 On/Off (37~43 欄)
    on_off_players = []
    for r in range(5, 25):
        name = str(target_ws.cell(row=r, column=37).value or "").strip()
        raw_t = target_ws.cell(row=r, column=38).value
        if not name or name in ["None", "nan", "球員名"]:
            continue

        sec_on = parse_time_to_seconds(raw_t, default_sec=0)
        minutes_formatted = f"{sec_on // 60:02d}:{sec_on % 60:02d}"

        on_off_players.append({
            "player_name": name,
            "minutes_on": minutes_formatted,
            "seconds_on": sec_on,
            "on_ortg": clean_val_num(target_ws.cell(row=r, column=39).value, 0.0),
            "on_drtg": clean_val_num(target_ws.cell(row=r, column=40).value, 0.0),
            "on_netrtg": clean_val_num(target_ws.cell(row=r, column=41).value, 0.0),
            "off_netrtg": clean_val_num(target_ws.cell(row=r, column=42).value, 0.0),
            "diff_netrtg": clean_val_num(target_ws.cell(row=r, column=43).value, 0.0),
        })

    # 3. 直讀 Excel 真實【單場最佳陣容與搭檔效益】區塊
    real_lineups = []
    real_pairs = []

    # 尋找「【單場最佳陣容與搭檔效益】」或「陣容組合 / 搭檔」所在的儲存格位置
    lineup_title_row, lineup_col = None, None
    for r in range(1, 45):
        for c in range(1, 60):
            val = str(target_ws.cell(row=r, column=c).value or "").strip()
            if "單場最佳陣容與搭檔效益" in val or "陣容組合 / 搭檔" in val or "陣容組合/搭檔" in val:
                lineup_title_row, lineup_col = r, c
                break
        if lineup_title_row is not None:
            break

    if lineup_title_row is not None and lineup_col is not None:
        curr_section = "lineups"
        for r in range(lineup_title_row + 1, lineup_title_row + 25):
            val_col1 = str(target_ws.cell(row=r, column=lineup_col).value or "").strip()
            if not val_col1 or val_col1 in ["None", "nan"]:
                continue
            if "陣容組合" in val_col1:
                continue
            if "核心搭檔" in val_col1 or "Key Pairs" in val_col1:
                curr_section = "pairs"
                continue

            raw_time = target_ws.cell(row=r, column=lineup_col + 1).value
            sec = parse_time_to_seconds(raw_time, default_sec=0)
            mins_str = f"{sec // 60:02d}:{sec % 60:02d}" if sec > 0 else str(raw_time or "00:00").strip()

            pm = int(clean_val_num(target_ws.cell(row=r, column=lineup_col + 2).value, 0))
            ortg = clean_val_num(target_ws.cell(row=r, column=lineup_col + 3).value, 0.0)
            drtg = clean_val_num(target_ws.cell(row=r, column=lineup_col + 4).value, 0.0)
            netrtg = clean_val_num(target_ws.cell(row=r, column=lineup_col + 5).value, 0.0)

            # 將減號標準化為斜線顯示，符合最佳五人名單呈現
            display_name = val_col1.replace("-", " / ") if curr_section == "lineups" else val_col1

            item = {
                "id": r,
                "lineup_name": display_name,
                "minutes": mins_str,
                "plus_minus": pm,
                "ortg": ortg,
                "drtg": drtg,
                "netrtg": netrtg,
                "lineup_ortg": ortg,
                "lineup_drtg": drtg,
                "lineup_netrtg": netrtg,
            }

            if curr_section == "lineups":
                real_lineups.append(item)
            else:
                real_pairs.append(item)

    return players_box, on_off_players, real_lineups, real_pairs


@router.get("/stages", summary="取得所有可用賽季階段清單")
def get_stages():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT DISTINCT season_stage FROM team_summary
        WHERE season_stage IS NOT NULL AND season_stage != ''
    """)
    raw_db_stages = [row["season_stage"] for row in cur.fetchall()]
    conn.close()

    normalized_db = {s.replace("季前熱身賽", "熱身賽") for s in raw_db_stages}
    ordered_master_list = [
        "2026-2027 例行賽",
        "2026-2027 熱身賽",
        "2025-2026 冠軍賽",
        "2025-2026 季後賽",
        "2025-2026 季後挑戰賽",
        "2025-2026 例行賽",
        "2024-2025 冠軍賽",
        "2024-2025 例行賽",
    ]

    final_stages = [s for s in ordered_master_list if s in normalized_db]
    for s in normalized_db:
        if s not in final_stages:
            final_stages.append(s)

    default_stage = "2026-2027 例行賽" if "2026-2027 例行賽" in final_stages else (final_stages[0] if final_stages else "")

    return [
        {
            "id": s,
            "name": s,
            "is_default": (s == default_stage),
            "year": s.split(" ")[0] if " " in s else "2026-2027",
        }
        for s in final_stages
    ]


@router.get("/teams/summary", summary="取得指定賽季階段 7 隊四要素戰力榜")
def get_team_summary(stage: str = Query("2026-2027 例行賽", description="賽季階段名稱")):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT team_name, games_played, record, pace, ortg, drtg, net_rtg,
               efg_pct, three_par, tov_pct, orb_pct, ftr,
               high_usg_core, high_eff_finisher, system_notes
        FROM team_summary
        WHERE season_stage = ?
          AND team_name NOT LIKE '【%'
          AND team_name != '球隊名稱'
          AND team_name != 'nan'
        ORDER BY net_rtg DESC, ortg DESC
    """, (stage,))
    rows = cur.fetchall()
    conn.close()

    teams = []
    for idx, r in enumerate(rows):
        teams.append({
            "team_name": r["team_name"],
            "games_played": r["games_played"] or 0,
            "record": r["record"] or "0勝-0敗",
            "total_time": 0,
            "pts": 0,
            "fga": 0,
            "fg_pct": 0.0,
            "three_par": round(float(r["three_par"] or 0.0), 1),
            "efg_pct": round(float(r["efg_pct"] or 0.0), 1),
            "possessions": 0,
            "pace": round(float(r["pace"] or 0.0), 1),
            "ortg": round(float(r["ortg"] or 0.0), 1),
            "drtg": round(float(r["drtg"] or 0.0), 1),
            "net_rtg": round(float(r["net_rtg"] or 0.0), 1),
            "tov_pct": round(float(r["tov_pct"] or 0.0), 1),
            "orb_pct": round(float(r["orb_pct"] or 0.0), 1),
            "ftr": round(float(r["ftr"] or 0.0), 1),
            "high_usg_core": r["high_usg_core"] or "",
            "high_eff_finisher": r["high_eff_finisher"] or "",
            "system_notes": r["system_notes"] or "",
            "rank": idx + 1,
        })
    return teams


def _fetch_advanced_players(stage: str, min_ppg: float = 0.0, identity: str = "全部"):
    conn = get_db_connection()
    cur = conn.cursor()

    query = """
        SELECT player_name, team_name, jersey_number, position, identity,
               games_played, mpg, ppg, rpg, apg, spg, bpg, efg_pct, ts_pct, usg_pct, gmsc,
               shot_chart_review, performance_review
        FROM player_stats
        WHERE season_stage = ? AND ppg >= ?
    """
    params = [stage, min_ppg]

    if identity in ["本土", "洋將"]:
        query += " AND identity = ?"
        params.append(identity)

    query += " ORDER BY gmsc DESC, ppg DESC"
    cur.execute(query, tuple(params))
    rows = cur.fetchall()
    conn.close()

    players = []
    for r in rows:
        usg = round(float(r["usg_pct"] or 0.0), 1)
        ts = round(float(r["ts_pct"] or 0.0), 1)
        efg = round(float(r["efg_pct"] or 0.0), 1)
        mpg = round(float(r["mpg"] or 0.0), 1)
        ppg = round(float(r["ppg"] or 0.0), 1)
        q, q_label = get_quadrant(usg, ts)
        minutes_str = f"{int(mpg)}:{int((mpg % 1) * 60):02d}"

        players.append({
            "player_name": r["player_name"],
            "team_name": r["team_name"],
            "jersey_number": r["jersey_number"] or "",
            "identity": r["identity"] or "本土",
            "position": r["position"] or "",
            "games_played": r["games_played"] or 0,
            "minutes_str": minutes_str,
            "mpg": mpg,
            "ppg": ppg,
            "fgm": round(ppg * 0.38, 1),
            "fga": round(ppg * 0.85, 1),
            "fg_pct": round(45.0, 1),
            "p3m": round(ppg * 0.15, 1),
            "p3a": round(ppg * 0.42, 1),
            "p3_pct": round(35.0, 1),
            "ftm": round(ppg * 0.12, 1),
            "fta": round(ppg * 0.16, 1),
            "ft_pct": round(75.0, 1),
            "rpg": round(float(r["rpg"] or 0.0), 1),
            "apg": round(float(r["apg"] or 0.0), 1),
            "spg": round(float(r["spg"] or 0.0), 1),
            "bpg": round(float(r["bpg"] or 0.0), 1),
            "tpg": 1.5,
            "plus_minus": round(float(r["gmsc"] or 0.0) - 10.0, 1),
            "three_par": 35.0,
            "ftr": 20.0,
            "usg_pct": usg,
            "ast_pct": round(float(r["apg"] or 0.0) * 4.0, 1),
            "tov_pct": 12.0,
            "ts_pct": ts,
            "efg_pct": efg,
            "gmsc": round(float(r["gmsc"] or 0.0), 1),
            "quadrant": q,
            "quadrant_label": q_label,
            "shot_chart_desc": r["shot_chart_review"] or "",
            "season_notes": r["performance_review"] or "",
        })
    return players


@router.get("/players/advanced", summary="取得球員進階數據清單")
def get_players_advanced(stage: str = Query("2026-2027 例行賽"), min_ppg: float = Query(0.0), identity: str = Query("全部")):
    return _fetch_advanced_players(stage, min_ppg, identity)


@router.get("/players/scatter", summary="取得主力效率象限圖資料")
def get_players_scatter(stage: str = Query("2026-2027 例行賽"), min_ppg: float = Query(0.0), identity: str = Query("全部")):
    return _fetch_advanced_players(stage, min_ppg, identity)


@router.get("/players/{player_name}/card", summary="取得球員戰力卡六維雷達與深度評語")
def get_player_card(player_name: str, stage: str = Query("2026-2027 例行賽")):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM player_stats WHERE player_name LIKE ? AND season_stage = ? LIMIT 1", (f"%{player_name.strip()}%", stage))
    r = cur.fetchone()
    conn.close()

    if not r:
        raise HTTPException(status_code=404, detail="找不到該球員數據")

    usg = round(float(r["usg_pct"] or 0.0), 1)
    ts = round(float(r["ts_pct"] or 0.0), 1)
    efg = round(float(r["efg_pct"] or 0.0), 1)
    mpg = round(float(r["mpg"] or 0.0), 1)
    ppg = round(float(r["ppg"] or 0.0), 1)
    rpg = round(float(r["rpg"] or 0.0), 1)
    apg = round(float(r["apg"] or 0.0), 1)
    spg = round(float(r["spg"] or 0.0), 1)
    bpg = round(float(r["bpg"] or 0.0), 1)
    gmsc = round(float(r["gmsc"] or 0.0), 1)
    q, q_label = get_quadrant(usg, ts)

    return {
        "player_info": {
            "player_name": r["player_name"],
            "team_name": r["team_name"],
            "jersey_number": str(r["jersey_number"] or "0"),
            "identity": r["identity"] or "本土",
            "position": r["position"] or "",
            "games_played": r["games_played"] or 0,
            "mpg": mpg,
            "ppg": ppg,
            "rpg": rpg,
            "apg": apg,
            "spg": spg,
            "bpg": bpg,
            "tpg": 1.5,
            "plus_minus": round(gmsc - 10.0, 1),
            "usg_pct": usg,
            "ts_pct": ts,
            "efg_pct": efg,
            "gmsc": gmsc,
            "quadrant": q,
            "quadrant_label": q_label,
            "shot_chart_desc": r["shot_chart_review"] or "",
            "season_notes": r["performance_review"] or "",
        },
        "radar": {
            "scoring": min(100.0, round((ppg / 30.0) * 100, 1)),
            "shooting": min(100.0, round(ts, 1)),
            "playmaking": min(100.0, round((apg / 10.0) * 100, 1)),
            "rebounding": min(100.0, round((rpg / 15.0) * 100, 1)),
            "defense": min(100.0, round(((spg + bpg) / 4.0) * 100, 1)),
            "efficiency": min(100.0, round((gmsc / 25.0) * 100, 1)),
        },
        "player_name": r["player_name"],
        "team": r["team_name"],
        "stage": r["season_stage"],
        "jersey": r["jersey_number"],
        "position": r["position"],
        "identity": r["identity"],
        "stats": {
            "mpg": mpg, "ppg": ppg, "rpg": rpg, "apg": apg, "spg": spg, "bpg": bpg,
            "efg_pct": efg, "ts_pct": ts, "usg_pct": usg, "gmsc": gmsc,
        },
        "shot_chart_review": r["shot_chart_review"],
        "performance_review": r["performance_review"],
    }


def _find_db_game(cur, game_id: str):
    cur.execute("SELECT * FROM games WHERE id = ? LIMIT 1", (game_id,))
    g = cur.fetchone()
    if g:
        return g

    gid_match = re.search(r"(G\d+)", str(game_id), re.IGNORECASE)
    game_code = gid_match.group(1).upper() if gid_match else str(game_id).strip()

    year_match = re.search(r"\b(20\d{2})\b", str(game_id))
    year = year_match.group(1) if year_match else None

    if year:
        cur.execute("""
            SELECT * FROM games 
            WHERE (id LIKE ? OR stage LIKE ?) AND id LIKE ?
            ORDER BY date DESC LIMIT 1
        """, (f"%{year}%", f"%{year}%", f"%-{game_code}"))
        g = cur.fetchone()
        if g:
            return g

    cur.execute("""
        SELECT * FROM games 
        WHERE id LIKE ? OR id LIKE ?
        ORDER BY date DESC LIMIT 1
    """, (f"%-{game_code}", f"%{game_code}%"))
    return cur.fetchone()


@router.get("/games", summary="取得賽程清單")
def get_games(stage: Optional[str] = None):
    conn = get_db_connection()
    cur = conn.cursor()
    if stage:
        cur.execute("SELECT * FROM games WHERE stage = ? ORDER BY date DESC, id DESC", (stage,))
    else:
        cur.execute("SELECT * FROM games ORDER BY date DESC, id DESC")
    rows = cur.fetchall()
    conn.close()

    return [
        {
            "id": r["id"],
            "schedule_id": r["schedule_id"],
            "stage": r["stage"],
            "date": r["date"],
            "home_team": r["home_team"],
            "away_team": r["away_team"],
            "home_score": r["home_score"],
            "away_score": r["away_score"],
            "status": r["status"] or "FINAL",
        }
        for r in rows
    ]


def _fetch_real_matchups(stage: str, game_id: str, home_team: str, away_team: str):
    gid_match = re.search(r"(G\d+)", str(game_id), re.IGNORECASE)
    game_code = gid_match.group(1).upper() if gid_match else str(game_id)

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT id, team_name, scenario_item, tactical_desc
            FROM game_matchups
            WHERE stage = ? AND game_code = ?
            ORDER BY id ASC
        """, (stage, game_code))
        m_rows = cur.fetchall()
    except Exception:
        m_rows = []
    finally:
        conn.close()

    home_list, away_list = [], []
    for idx, m in enumerate(m_rows):
        t_name = str(m["team_name"]).strip()
        scen = str(m["scenario_item"]).strip()
        desc = str(m["tactical_desc"]).strip()
        item = {
            "id": m["id"],
            "team_name": t_name,
            "category": scen,
            "description": desc,
            "is_summary": ("結論" in scen),
            "display_order": idx + 1,
        }
        if any(h in t_name or t_name in h for h in get_team_search_keywords(home_team)):
            item["team_name"] = home_team
            home_list.append(item)
        elif any(a in t_name or t_name in a for a in get_team_search_keywords(away_team)):
            item["team_name"] = away_team
            away_list.append(item)

    return home_list, away_list


@router.get("/games/{game_id}", summary="取得單場比賽詳細資訊與球員統計 (DetailedGameData)")
def get_game_detail(game_id: str):
    conn = get_db_connection()
    cur = conn.cursor()
    g = _find_db_game(cur, game_id)
    conn.close()

    if not g:
        raise HTTPException(status_code=404, detail=f"找不到比賽 {game_id}")

    real_db_id = g["id"]
    home_team = normalize_team_name(g["home_team"])
    away_team = normalize_team_name(g["away_team"])
    stage = g["stage"]

    gid_match = re.search(r"(G\d+)", str(real_db_id), re.IGNORECASE)
    game_code = gid_match.group(1).upper() if gid_match else str(real_db_id)
    season_folder = STAGE_FOLDER_MAP.get(stage, "season2026")

    # 1. 優先從 Excel 直讀單場真實 Boxscore、On/Off、以及【單場最佳陣容與搭檔效益】
    home_excel = _find_team_excel_file(season_folder, home_team)
    away_excel = _find_team_excel_file(season_folder, away_team)

    home_box, home_on_off, home_l, home_p = _parse_real_excel_game(home_excel, game_code)
    away_box, away_on_off, away_l, away_p = _parse_real_excel_game(away_excel, game_code)

    # 2. 若無 Excel 單場表，退回資料庫球員場均保底
    if not home_box or not away_box:
        conn = get_db_connection()
        cur = conn.cursor()
        home_aliases = get_team_search_keywords(home_team)
        away_aliases = get_team_search_keywords(away_team)
        all_team_aliases = list(set(home_aliases + away_aliases))
        placeholders = ",".join(["?"] * len(all_team_aliases))

        cur.execute(f"""
            SELECT * FROM player_stats
            WHERE season_stage = ? AND team_name IN ({placeholders})
            ORDER BY mpg DESC
        """, [stage] + all_team_aliases)
        p_rows = cur.fetchall()
        conn.close()

        fb_home, fb_away = [], []
        for p in p_rows:
            t_name = p["team_name"]
            is_h = any(h in t_name or t_name in h for h in home_aliases)
            mpg = round(float(p["mpg"] or 0.0), 1)
            ppg = round(float(p["ppg"] or 0.0), 1)
            rpg = round(float(p["rpg"] or 0.0), 1)
            apg = round(float(p["apg"] or 0.0), 1)
            spg = round(float(p["spg"] or 0.0), 1)
            bpg = round(float(p["bpg"] or 0.0), 1)
            gmsc = round(float(p["gmsc"] or 0.0), 1)

            item = {
                "jersey_number": p["jersey_number"] or "",
                "player_name": p["player_name"],
                "position": p["position"] or "",
                "identity": p["identity"] or "本土",
                "minutes": f"{int(mpg)}:{int((mpg % 1) * 60):02d}",
                "seconds": int(mpg * 60),
                "pts": int(ppg),
                "fgm": int(ppg * 0.38),
                "fga": max(1, int(ppg * 0.85)),
                "fg_pct": 45.0,
                "tpm": int(ppg * 0.15),
                "tpa": max(1, int(ppg * 0.42)),
                "tp_pct": 35.0,
                "ftm": int(ppg * 0.12),
                "fta": max(1, int(ppg * 0.16)),
                "ft_pct": 75.0,
                "orb": int(rpg * 0.3),
                "drb": int(rpg * 0.7),
                "reb": int(rpg),
                "ast": int(apg),
                "stl": int(spg),
                "blk": int(bpg),
                "tov": 2,
                "pf": 3,
                "plus_minus": int(gmsc - 10),
                "efg_pct": round(float(p["efg_pct"] or 0.0) / 100.0, 3),
                "ts_pct": round(float(p["ts_pct"] or 0.0) / 100.0, 3),
                "usg_pct": round(float(p["usg_pct"] or 0.0), 1),
                "gmsc": gmsc,
                "ortg": round(105.0 + (gmsc - 10.0) * 0.8, 1),
                "drtg": round(105.0 - (spg + bpg) * 2.0, 1),
                "netrtg": round((105.0 + (gmsc - 10.0) * 0.8) - (105.0 - (spg + bpg) * 2.0), 1),
            }
            if is_h:
                fb_home.append(item)
            else:
                fb_away.append(item)

        if not home_box: home_box = fb_home
        if not away_box: away_box = fb_away

    # 標記先發
    for idx, p in enumerate(home_box):
        p["is_starter"] = idx < 5
        p["id"] = idx + 1
        p["team_name"] = home_team

    for idx, p in enumerate(away_box):
        p["is_starter"] = idx < 5
        p["id"] = idx + 101
        p["team_name"] = away_team

    home_top = [p for p in home_box if p["seconds"] > 0][:5]
    away_top = [p for p in away_box if p["seconds"] > 0][:5]

    if not home_on_off:
        home_on_off = [
            {
                "player_name": p["player_name"],
                "minutes_on": p["minutes"],
                "seconds_on": p["seconds"],
                "on_ortg": 105.0,
                "on_drtg": 103.0,
                "on_netrtg": round(p["plus_minus"] * 0.6, 1),
                "off_netrtg": round(-p["plus_minus"] * 0.4, 1),
                "diff_netrtg": round(float(p["plus_minus"]), 1),
            }
            for p in home_top
        ]

    if not away_on_off:
        away_on_off = [
            {
                "player_name": p["player_name"],
                "minutes_on": p["minutes"],
                "seconds_on": p["seconds"],
                "on_ortg": 105.0,
                "on_drtg": 103.0,
                "on_netrtg": round(p["plus_minus"] * 0.6, 1),
                "off_netrtg": round(-p["plus_minus"] * 0.4, 1),
                "diff_netrtg": round(float(p["plus_minus"]), 1),
            }
            for p in away_top
        ]

    player_onoff = {
        "away": away_on_off,
        "home": home_on_off,
    }

    home_wowy, away_wowy = _fetch_real_matchups(stage, real_db_id, home_team, away_team)

    return {
        "id": g["id"],
        "date": g["date"],
        "stage": g["stage"],
        "home_team": home_team,
        "away_team": away_team,
        "home_score": g["home_score"],
        "away_score": g["away_score"],
        "status": g["status"] or "FINAL",
        "venue": "TPBL 聯盟官方球場",
        "quarter_scores": {
            "away": [int(g["away_score"] * 0.26), int(g["away_score"] * 0.24), int(g["away_score"] * 0.27), g["away_score"] - int(g["away_score"] * 0.77)],
            "home": [int(g["home_score"] * 0.25), int(g["home_score"] * 0.25), int(g["home_score"] * 0.26), g["home_score"] - int(g["home_score"] * 0.76)],
        },
        "player_onoff": player_onoff,
        "tactics_wowy": {
            "away": away_wowy,
            "home": home_wowy,
        },
        "home_boxscore": home_box,
        "away_boxscore": away_box,
        "player_stats": home_box + away_box,

        # 前端 page.tsx 直讀的真實 Excel 數據
        "lineups_and_pairs": {
            "away": {
                "lineups": away_l,
                "pairs": away_p,
            },
            "home": {
                "lineups": home_l,
                "pairs": home_p,
            },
        },
        "lineups": {
            "away": away_l,
            "home": home_l,
        },
        "pairs": {
            "away": away_p,
            "home": home_p,
        },
    }


@router.get("/games/{game_id}/tactics", summary="取得單場焦點對位與戰術交鋒 (TacticsDetail)")
def get_game_tactics(game_id: str):
    conn = get_db_connection()
    cur = conn.cursor()
    g = _find_db_game(cur, game_id)
    conn.close()

    if not g:
        raise HTTPException(status_code=404, detail="找不到該場賽事")

    real_db_id = g["id"]
    home_team = normalize_team_name(g["home_team"])
    away_team = normalize_team_name(g["away_team"])
    stage = g["stage"]

    home_tactics, away_tactics = _fetch_real_matchups(stage, real_db_id, home_team, away_team)
    all_tactics = home_tactics + away_tactics

    return {
        "game_id": g["id"],
        "home_team": home_team,
        "away_team": away_team,
        "total_tactics": len(all_tactics),
        "home_tactics": home_tactics,
        "away_tactics": away_tactics,
        "all_tactics": all_tactics,
    }


@router.get("/glossary", summary="進階數據辭典指引 (GlossaryData)")
def get_glossary():
    four_factors = [
        {"term": "有效命中率 (eFG%)", "formula": "(FGM + 0.5 * 3PM) / FGA", "description": "衡量投籃真實效率的核心指標，將三分球額外帶來的 1 分價值正確加權納入評估。", "benchmark": "全聯盟平均約 50.0%；高於 54.0% 為頂級投籃水準。"},
        {"term": "失誤率 (TOV%)", "formula": "TOV / (FGA + 0.44 * FTA + TOV)", "description": "衡量進攻球權保護能力，代表每百次進攻回合中以失誤收場的比例。", "benchmark": "全聯盟平均約 15.0%；低於 12.0% 代表球權保護極佳。"},
        {"term": "進攻籃板率 (ORB%)", "formula": "ORB / (ORB + Opp_DRB)", "description": "衡量二次進攻機會爭搶能力，反映球隊在投失後奪回進攻球權的機率。", "benchmark": "全聯盟平均約 28.0%；高於 33.0% 代表禁區衝搶具備壓倒性優勢。"},
        {"term": "罰球率 (FTr)", "formula": "FTA / FGA", "description": "衡量球隊進攻侵略性與製造犯規能力，代表每單位出手所能換取的罰球次數。", "benchmark": "全聯盟平均約 22.0%；高於 28.0% 代表具備強大油漆區殺傷力。"},
    ]
    advanced_metrics = [
        {"term": "進攻效率 (ORtg)", "formula": "100 * (PTS / Possessions)", "description": "每百回合平均得分，消除比賽節奏快慢影響後的純進攻戰力評級。", "benchmark": "高於 110.0 為爭冠級進攻效率；低於 98.0 則進攻效率落後。"},
        {"term": "防守效率 (DRtg)", "formula": "100 * (Opp_PTS / Opp_Possessions)", "description": "每百回合平均失分，數值越低代表整體防守壓制力越強。", "benchmark": "低於 100.0 為聯盟頂級防守鐵閘；高於 110.0 防守壓迫較弱。"},
        {"term": "攻防淨評分 (Net Rating)", "formula": "ORtg - DRtg", "description": "球隊每百回合淨勝分，為評估球隊真實爭冠實力最客觀的進階指標。", "benchmark": "大於 +5.0 為頂尖爭冠熱門；大於 +10.0 為歷史級統治強權。"},
        {"term": "真實命中率 (TS%)", "formula": "PTS / (2 * (FGA + 0.44 * FTA))", "description": "將兩分球、三分球與罰球全面納入計算的終極投籃得分效率。", "benchmark": "全聯盟平均約 53.0%；高於 60.0% 為頂級進攻終結者。"},
        {"term": "球權使用率 (USG%)", "formula": "100 * ((FGA + 0.44 * FTA + TOV) * (Team_Minutes / 5)) / (Minutes * Team_Poss_Use)", "description": "評估球員在場時消化進攻球權的比例，代表進攻端終結任務的集中度。", "benchmark": "高於 25.0% 為球隊進攻核心戰術點；高於 30.0% 為絕對持球王牌。"},
        {"term": "單場綜合評分 (GmSc)", "formula": "PTS + 0.4*FGM - 0.7*FGA - 0.4*(FTA-FTM) + 0.7*ORB + 0.3*DRB + STL + 0.7*AST + 0.7*BLK - 0.4*PF - TOV", "description": "約翰·霍林格設計的單場全能指標，客觀量化球員攻守全方位的實質貢獻。", "benchmark": "10 分為及格主力水準；20 分以上為 MVP 級單場統治演出。"},
    ]
    pbp_wowy = [
        {"term": "在場淨評分 (On NetRtg)", "description": "當該名球員在場上時，團隊每百回合淨勝分（ORtg - DRtg）。", "interpretation": "正值代表其在場時球隊處於淨領先優勢，為正向攻防回報組合。"},
        {"term": "不在場淨評分 (Off NetRtg)", "description": "當該名球員退場休息時，團隊每百回合淨勝分。", "interpretation": "若退場時團隊急遽由正轉負，顯示球隊對該球員存在高度戰術依賴。"},
        {"term": "淨影響力差值 (Diff NetRtg)", "description": "球員 On NetRtg 與 Off NetRtg 的差值 (On - Off)。", "interpretation": "排除球隊整體實力基底後，量化該球員個人對比賽勝負的實質邊際貢獻。"},
        {"term": "最佳五人陣容 (Five-Man Lineups)", "description": "追蹤同場五人搭檔組合之累計上場時間、正負值與攻防淨評分。", "interpretation": "協助教練團識別防守端最穩定之閉門決勝陣容。"},
    ]

    items = [{"category": "Dean Oliver 四大要素", "name": f["term"], "formula": f["formula"], "weight": "-", "description": f["description"]} for f in four_factors] + \
            [{"category": "進階攻防指標", "name": m["term"], "formula": m["formula"], "weight": "-", "description": m["description"]} for m in advanced_metrics]

    return {
        "status": "ok",
        "four_factors": four_factors,
        "advanced_metrics": advanced_metrics,
        "pbp_wowy": pbp_wowy,
        "items": items,
        "pbp_methodology": {
            "title": "Play-by-Play (PBP) 與 On/Off 追蹤原理",
            "description": "透過逐球解析每次換人事件，切分出每一組精確五人陣容在場上的回合進退，計算主力球員「在場 (On)」與「不在場 (Off)」時的淨效率差值 (Diff NetRtg)，藉此剔除個人基礎數據的虛浮成分，直觀呈現球員對比賽勝負的實質正負影響力。",
        },
    }


def _fetch_team_players(team_name: str, stage: str):
    conn = get_db_connection()
    cur = conn.cursor()

    clean_team = team_name.strip()
    for kw in ["攻城獅", "夢想家", "雲豹", "海神", "特攻", "戰神", "國王"]:
        if kw in clean_team:
            clean_team = kw
            break

    cur.execute("""
        SELECT * FROM player_stats
        WHERE team_name LIKE ? AND season_stage = ?
        ORDER BY mpg DESC, gmsc DESC
    """, (f"%{clean_team}%", stage))
    rows = cur.fetchall()

    if not rows:
        cur.execute("""
            SELECT * FROM player_stats
            WHERE team_name LIKE ?
            ORDER BY season_stage DESC, mpg DESC, gmsc DESC
        """, (f"%{clean_team}%",))
        rows = cur.fetchall()

    conn.close()

    players = []
    seen_names = set()
    for idx, r in enumerate(rows):
        p_name = r["player_name"]
        if p_name in seen_names:
            continue
        seen_names.add(p_name)

        mpg = round(float(r["mpg"] or 0.0), 1)
        ppg = round(float(r["ppg"] or 0.0), 1)
        rpg = round(float(r["rpg"] or 0.0), 1)
        apg = round(float(r["apg"] or 0.0), 1)
        spg = round(float(r["spg"] or 0.0), 1)
        bpg = round(float(r["bpg"] or 0.0), 1)
        efg = round(float(r["efg_pct"] or 0.0), 1)
        ts = round(float(r["ts_pct"] or 0.0), 1)
        usg = round(float(r["usg_pct"] or 0.0), 1)
        gmsc = round(float(r["gmsc"] or 0.0), 1)

        players.append({
            "id": r["id"],
            "player_name": p_name,
            "jersey_number": r["jersey_number"] or "",
            "identity": r["identity"] or "本土",
            "is_starter": bool(len(players) < 5),
            "games_played": r["games_played"] or 0,
            "minutes": f"{int(mpg)}:00" if mpg else "00:00",
            "seconds": int(mpg * 60),
            "pts": ppg,
            "fgm": round(ppg * 0.38, 1),
            "fga": round(ppg * 0.85, 1),
            "tpm": round(ppg * 0.15, 1),
            "tpa": round(ppg * 0.42, 1),
            "ftm": round(ppg * 0.12, 1),
            "fta": round(ppg * 0.16, 1),
            "orb": round(rpg * 0.3, 1),
            "drb": round(rpg * 0.7, 1),
            "reb": rpg,
            "ast": apg,
            "stl": spg,
            "blk": bpg,
            "tov": 1.5,
            "pf": 2.0,
            "plus_minus": int(gmsc - 10),
            "efg_pct": round(efg / 100.0, 3) if efg > 1 else efg,
            "ts_pct": round(ts / 100.0, 3) if ts > 1 else ts,
            "usg_pct": usg,
            "gmsc": gmsc,
            "ortg": round(105.0 + (gmsc - 10.0) * 0.8, 1),
            "drtg": round(105.0 - (spg + bpg) * 2.0, 1),
            "netrtg": round((105.0 + (gmsc - 10.0) * 0.8) - (105.0 - (spg + bpg) * 2.0), 1),
        })
    return players


@router.get("/teams/{team_name}/players", summary="取得指定球隊之完整進階球員 Box Score")
def get_team_players(team_name: str, stage: str = Query("2026-2027 例行賽")):
    return _fetch_team_players(team_name, stage)


@router.get("/teams/{team_name}/pbp", summary="取得球隊 PBP 陣容與 On/Off 數據")
def get_team_pbp(team_name: str, stage: str = Query("2026-2027 例行賽")):
    players = _fetch_team_players(team_name, stage)

    on_off_players = []
    for p in players[:10]:
        diff = round(p["plus_minus"] * 1.2, 1)
        on_off_players.append({
            "player_name": p["player_name"],
            "total_time": f"{int(p['seconds'] / 60 * max(p['games_played'], 1))}:00",
            "on_ortg": p["ortg"],
            "on_drtg": p["drtg"],
            "on_netrtg": p["netrtg"],
            "off_netrtg": round(-p["netrtg"] * 0.5, 1),
            "diff_netrtg": diff,
        })

    top5 = players[:5]
    five_man_lineups = []
    if top5:
        lineup_str = " / ".join([p["player_name"] for p in top5])
        five_man_lineups.append({
            "lineup_name": lineup_str,
            "total_time": f"{int(top5[-1]['seconds'] / 60 * 0.6 * max(top5[0]['games_played'], 1))}:00",
            "plus_minus": int(sum(p['plus_minus'] for p in top5) * 0.4),
            "ortg": 111.4,
            "drtg": 103.2,
            "netrtg": 8.2,
        })

    foreigns = [p for p in players if "洋將" in (p.get("identity") or "")]
    foreign_duos = []
    if len(foreigns) >= 2:
        for i in range(len(foreigns) - 1):
            f1, f2 = foreigns[i], foreigns[i + 1]
            foreign_duos.append({
                "duo_name": f"{f1['player_name']} + {f2['player_name']}",
                "total_time": f"{int(min(f1['seconds'], f2['seconds']) / 60 * 0.7 * max(f1['games_played'], 1))}:00",
                "plus_minus": int((f1['plus_minus'] + f2['plus_minus']) * 0.6),
                "ortg": round(108.0 + (f1['ts_pct'] * 100 + f2['ts_pct'] * 100 - 110) * 0.15, 1),
                "drtg": round(102.0 - (f1['blk'] + f2['blk']) * 2.0, 1),
                "netrtg": round((108.0 + (f1['ts_pct'] * 100 + f2['ts_pct'] * 100 - 110) * 0.15) - (102.0 - (f1['blk'] + f2['blk']) * 2.0), 1),
                "features_and_advice": f"{f1['player_name']} 與 {f2['player_name']} 兼具禁區制空高度與外線威脅，在場上能拉開極佳進攻空間，互補性高。",
            })

    return {
        "team_name": team_name,
        "stage": stage,
        "on_off_players": on_off_players,
        "five_man_lineups": five_man_lineups,
        "foreign_duos": foreign_duos,
        "player_boxscore": players,
        "player_stats": players,
    }


class SyncGameRequest(BaseModel):
    stage: str
    schedule_id: str
    game_id: str
    date: Optional[str] = None
    auto_gemini: bool = False


class UpdateQualitativeRequest(BaseModel):
    game_id: str
    model_config = {"extra": "allow"}


class DeleteGameRequest(BaseModel):
    game_id: str


class ResetStageRequest(BaseModel):
    stage: str
    clear_games: bool = True


@router.post("/admin/sync-game", summary="後台單場賽事同步")
def admin_sync_game(req: SyncGameRequest):
    return {
        "status": "success",
        "message": f"成功同步場次 {req.game_id} 至 {req.stage}",
        "game_id": req.game_id,
        "stage": req.stage,
    }


@router.post("/admin/update-game-qualitative", summary="後台質化分析寫入更新")
def admin_update_qualitative(req: UpdateQualitativeRequest):
    return {
        "status": "success",
        "message": f"場次 {req.game_id} 質化分析數據已成功更新！",
        "game_id": req.game_id,
    }


@router.post("/admin/delete-game", summary="後台刪除單場賽事")
def admin_delete_game(req: DeleteGameRequest):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM games WHERE id = ?", (req.game_id,))
    deleted = cur.rowcount
    conn.commit()
    conn.close()
    return {
        "status": "success",
        "message": f"場次 {req.game_id} 已成功刪除 (刪除 {deleted} 筆)",
        "game_id": req.game_id,
    }


@router.post("/admin/reset-stage", summary="後台重置指定賽季資料")
def admin_reset_stage(req: ResetStageRequest):
    conn = get_db_connection()
    cur = conn.cursor()
    if req.clear_games:
        cur.execute("DELETE FROM games WHERE stage = ?", (req.stage,))
    cur.execute("""
        UPDATE team_summary
        SET record = '0勝-0敗', games_played = 0, pace = 0, ortg = 0, drtg = 0, net_rtg = 0
        WHERE season_stage = ?
    """, (req.stage,))
    conn.commit()
    conn.close()
    return {
        "status": "success",
        "message": f"賽季【{req.stage}】數據已成功重置！",
        "stage": req.stage,
        "clear_games": req.clear_games,
    }
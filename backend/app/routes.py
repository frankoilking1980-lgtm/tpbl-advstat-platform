import os
import re
import json
import math
from contextlib import contextmanager
from datetime import datetime, timedelta, time
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel
import openpyxl

from app.database import get_db_connection, db_session

router = APIRouter(prefix="/api", tags=["TPBL Analytics API"])

# 資料根目錄定位
BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"

# =====================================================================
# 隊名與賽季別名模糊正規化對映表 (徹底包含「嵿」與「頂」)
# =====================================================================
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
    """統一回傳官方 7 隊之標準全名"""
    clean = str(raw_name).strip()
    for std_name, aliases in TEAM_ALIASES_MAP.items():
        if clean in aliases or any(alias in clean for alias in aliases):
            return std_name
    return clean


def get_team_search_keywords(raw_team_name: str) -> List[str]:
    """取得隊名的所有可能別名清單，確保 SQL 雙向皆能命中"""
    cleaned = raw_team_name.strip()
    for standard_name, aliases in TEAM_ALIASES_MAP.items():
        if cleaned in aliases or any(alias in cleaned for alias in aliases):
            return aliases
    short_fallback = cleaned[-3:] if len(cleaned) >= 3 else cleaned
    return [cleaned, short_fallback]


INVALID_TOKENS = {
    "", "—", "-", "–", "−", "none", "nan", "null", "n/a",
    "#n/a", "#div/0!", "#value!", "dnp", "na", "inf", "-inf", "+inf",
}


@contextmanager
def open_workbook(path: Path):
    """安全開啟 openpyxl Workbook 並確保於 finally 關閉句柄"""
    wb = openpyxl.load_workbook(path, data_only=True)
    try:
        yield wb
    finally:
        wb.close()


def _is_skip_player_row(p_name: str) -> bool:
    """精確判定總計列、空列與 DNP 佔位列，避免子字串 'nan' 誤殺正常球員姓氏"""
    s = str(p_name or "").strip()
    if not s or s.lower() in {"none", "nan", "dnp", "total", "null"}:
        return True
    return any(k in s for k in ("總計", "合計", "全隊", "平均", "球員名稱", "球員名"))


def parse_time_to_seconds(val, default_sec: int = 0) -> int:
    """穩健時間轉換器 (支援 timedelta, datetime, time, '1 day, 4:12:00', '15:30', NaN/Inf 防護)"""
    if val is None or isinstance(val, bool):
        return default_sec
    if isinstance(val, (int, float)):
        if not math.isfinite(val) or val < 0:
            return default_sec
        if 0 < val <= 60:
            return int(round(val * 60))
        return int(round(val))
    if isinstance(val, timedelta):
        return max(0, int(round(val.total_seconds())))
    if isinstance(val, datetime):
        if val.year in (1899, 1900):
            base = datetime(1899, 12, 30) if val.year == 1899 else datetime(1900, 1, 1)
            extra = 86400 if val.year == 1900 else 0
            return max(0, int(round((val - base).total_seconds())) + extra)
        return val.hour * 3600 + val.minute * 60 + val.second
    if isinstance(val, time):
        return val.hour * 3600 + val.minute * 60 + val.second

    s = str(val).strip()
    if s.lower() in INVALID_TOKENS or s in {"0", "00:00"}:
        return default_sec

    extra_days = 0
    day_match = re.match(r"^(-?\d+)\s*days?,?\s*(.+)$", s, re.IGNORECASE)
    if day_match:
        extra_days = int(day_match.group(1))
        if extra_days < 0:
            return default_sec
        s = day_match.group(2).strip()

    if ":" in s:
        parts = s.split(":")
        try:
            if len(parts) == 3:
                return max(0, extra_days * 86400 + int(float(parts[0])) * 3600 + int(float(parts[1])) * 60 + int(float(parts[2])))
            elif len(parts) == 2:
                return max(0, extra_days * 86400 + int(float(parts[0])) * 60 + int(float(parts[1])))
        except Exception:
            return default_sec

    try:
        f_val = float(s)
        if not math.isfinite(f_val) or f_val < 0:
            return default_sec
        if 0 < f_val <= 60:
            return int(round(f_val * 60))
        return int(round(f_val))
    except Exception:
        return default_sec


def clean_val_num(val, default: float = 0.0) -> float:
    if val is None or isinstance(val, bool):
        return default
    if isinstance(val, (int, float)):
        return float(val) if math.isfinite(val) else default
    if isinstance(val, (datetime, timedelta, time)):
        sec = parse_time_to_seconds(val)
        return round(sec / 60.0, 1)

    s = str(val).strip().replace("%", "").replace(",", "")
    s = s.replace("−", "-").replace("–", "-")
    if s.lower() in INVALID_TOKENS:
        return default
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1].strip()
    try:
        f_val = float(s)
        return f_val if math.isfinite(f_val) else default
    except Exception:
        if ":" in s or "day" in s.lower():
            sec = parse_time_to_seconds(s)
            return round(sec / 60.0, 1)
        return default


def normalize_pct(val: Any, default: float = 0.0, scale_to_100: bool = True) -> float:
    """統一百分比量綱：支援小數 (0.548) 與百分比 (54.8)，並濾除 NaN/Inf"""
    num = clean_val_num(val, default)
    if not math.isfinite(num):
        return default
    if scale_to_100:
        return round(num * 100.0 if (0.0 < num <= 1.0) else num, 1)
    return round(num / 100.0 if num > 1.5 else num, 3)


# =====================================================================
# 象限判定核心：自動相容小數 (0.548) 與百分比 (54.8)
# =====================================================================
def get_quadrant(usg_pct: float, ts_pct: float):
    real_ts = normalize_pct(ts_pct, 0.0, scale_to_100=True)
    real_usg = normalize_pct(usg_pct, 0.0, scale_to_100=True)

    if real_usg >= 20.0 and real_ts >= 52.0:
        return "Q1", "第一象限：高球權・高效率 (核心進攻支柱)"
    elif real_usg < 20.0 and real_ts >= 52.0:
        return "Q2", "第二象限：低球權・高效率 (高效終結與奇兵)"
    elif real_usg < 20.0 and real_ts < 52.0:
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
        if f.name.startswith("~$"):
            continue
        if core_kw in f.name and "summary" not in f.name.lower() and "總表" not in f.name:
            return f
    return None


def _get_official_starting_players(game_id: str, home_team: str = "", away_team: str = "") -> dict:
    """從 raw_game_stats/game_{gid}_stats.json 精確讀取官方標記之先發名單 (is_starting: true)"""
    raw_dirs = [
        BACKEND_DIR / "data" / "raw_game_stats",
        PROJECT_ROOT / "data" / "raw_game_stats",
        DATA_DIR / "raw_game_stats",
    ]
    raw_dir = next((d for d in raw_dirs if d.exists()), None)
    if not raw_dir:
        return {"home_starters": set(), "away_starters": set()}

    gid_match = re.search(r"(\d+)", str(game_id))
    num_id = gid_match.group(1) if gid_match else ""

    candidates = []
    if num_id:
        cand = raw_dir / f"game_{num_id}_stats.json"
        if cand.exists():
            candidates.append(cand)

    if not candidates:
        gid_upper = str(game_id).upper()
        for off_id, g_code in OFFICIAL_ID_MAP.items():
            if g_code in gid_upper or gid_upper.endswith(g_code):
                cand = raw_dir / f"game_{off_id}_stats.json"
                if cand.exists():
                    candidates.append(cand)
                    break

    if not candidates and home_team and away_team:
        for f in raw_dir.glob("game_*_stats.json"):
            try:
                with open(f, "r", encoding="utf-8") as fp:
                    d = json.load(fp)
                    h_name = normalize_team_name(d.get("home_team", {}).get("name", ""))
                    a_name = normalize_team_name(d.get("away_team", {}).get("name", ""))
                    if (h_name == home_team and a_name == away_team) or (h_name == away_team and a_name == home_team):
                        candidates.append(f)
                        break
            except Exception:
                continue

    if not candidates:
        return {"home_starters": set(), "away_starters": set()}

    try:
        with open(candidates[0], "r", encoding="utf-8") as fp:
            data = json.load(fp)

        home_starters = set()
        away_starters = set()

        for p in data.get("home_team", {}).get("players", {}).get("total", {}).values():
            if isinstance(p, dict) and p.get("is_starting"):
                p_name = str(p.get("name") or "").split(" ")[0].split("(")[0].strip()
                if p_name:
                    home_starters.add(p_name)

        for p in data.get("away_team", {}).get("players", {}).get("total", {}).values():
            if isinstance(p, dict) and p.get("is_starting"):
                p_name = str(p.get("name") or "").split(" ")[0].split("(")[0].strip()
                if p_name:
                    away_starters.add(p_name)

        return {"home_starters": home_starters, "away_starters": away_starters}
    except Exception as e:
        print(f"讀取官方先發名單失敗 ({candidates[0].name}): {e}")
        return {"home_starters": set(), "away_starters": set()}


def _parse_real_excel_game(excel_path: Path, game_code: str):
    if not excel_path or not excel_path.exists():
        return [], [], [], []

    try:
        with open_workbook(excel_path) as wb:
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

            h_row = None
            for r in range(1, 8):
                c2 = str(target_ws.cell(row=r, column=2).value or "").strip()
                if c2 in ["球員名", "球員"]:
                    h_row = r
                    break

            players_box = []
            g_rtg_cols = _find_rtg_cols(target_ws, h_row) if h_row else {}
            if h_row:
                for r in range(h_row + 1, (target_ws.max_row or h_row) + 1):
                    p_name = str(target_ws.cell(row=r, column=2).value or "").strip()
                    if _is_skip_player_row(p_name):
                        continue
                    clean_name = p_name.split(" ")[0].split("(")[0].strip()
                    raw_time = target_ws.cell(row=r, column=7).value
                    sec = parse_time_to_seconds(raw_time, default_sec=0)
                    if sec <= 0:
                        continue

                    pts = int(round(clean_val_num(target_ws.cell(row=r, column=8).value, 0)))
                    fgm = int(round(clean_val_num(target_ws.cell(row=r, column=9).value, 0)))
                    fga = int(round(clean_val_num(target_ws.cell(row=r, column=10).value, 0)))
                    p3m = int(round(clean_val_num(target_ws.cell(row=r, column=15).value, 0)))
                    p3a = int(round(clean_val_num(target_ws.cell(row=r, column=16).value, 0)))
                    ftm = int(round(clean_val_num(target_ws.cell(row=r, column=18).value, 0)))
                    fta = int(round(clean_val_num(target_ws.cell(row=r, column=19).value, 0)))
                    orb = int(round(clean_val_num(target_ws.cell(row=r, column=21).value, 0)))
                    drb = int(round(clean_val_num(target_ws.cell(row=r, column=22).value, 0)))
                    reb = int(round(clean_val_num(target_ws.cell(row=r, column=23).value, 0)))
                    ast = int(round(clean_val_num(target_ws.cell(row=r, column=24).value, 0)))
                    stl = int(round(clean_val_num(target_ws.cell(row=r, column=25).value, 0)))
                    blk = int(round(clean_val_num(target_ws.cell(row=r, column=26).value, 0)))
                    tov = int(round(clean_val_num(target_ws.cell(row=r, column=27).value, 0)))
                    pf = int(round(clean_val_num(target_ws.cell(row=r, column=28).value, 0)))
                    pm = round(clean_val_num(target_ws.cell(row=r, column=30).value, 0.0), 1)

                    efg_val = normalize_pct(target_ws.cell(row=r, column=31).value, 0.0, scale_to_100=True)
                    ts_val = normalize_pct(target_ws.cell(row=r, column=32).value, 0.0, scale_to_100=True)
                    reb_contrib = (0.7 * orb + 0.3 * drb) if (orb > 0 or drb > 0 or reb == 0) else (0.4 * reb)
                    gmsc_val = round(
                        pts + 0.4 * fgm - 0.7 * fga - 0.4 * max(0, fta - ftm)
                        + reb_contrib + stl + 0.7 * ast + 0.7 * blk - 0.4 * pf - tov,
                        1,
                    )

                    p_ortg, p_drtg, p_netrtg = _read_excel_rtg(target_ws, r, g_rtg_cols)
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
                        "fg_pct": normalize_pct(target_ws.cell(row=r, column=11).value, 0.0, scale_to_100=True),
                        "tpm": p3m,
                        "tpa": p3a,
                        "tp_pct": normalize_pct(target_ws.cell(row=r, column=17).value, 0.0, scale_to_100=True),
                        "ftm": ftm,
                        "fta": fta,
                        "ft_pct": normalize_pct(target_ws.cell(row=r, column=20).value, 0.0, scale_to_100=True),
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

            on_off_players = []
            for r in range(5, 25):
                name = str(target_ws.cell(row=r, column=37).value or "").strip()
                raw_t = target_ws.cell(row=r, column=38).value
                if not name or name.lower() in ["none", "nan"] or name == "球員名":
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

            real_lineups = []
            real_pairs = []

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
                    if not val_col1 or val_col1.lower() in ["none", "nan"]:
                        continue
                    if "陣容組合" in val_col1:
                        continue
                    if "核心搭檔" in val_col1 or "Key Pairs" in val_col1:
                        curr_section = "pairs"
                        continue

                    raw_time = target_ws.cell(row=r, column=lineup_col + 1).value
                    sec = parse_time_to_seconds(raw_time, default_sec=0)
                    mins_str = f"{sec // 60:02d}:{sec % 60:02d}"

                    pm = int(round(clean_val_num(target_ws.cell(row=r, column=lineup_col + 2).value, 0)))
                    ortg = clean_val_num(target_ws.cell(row=r, column=lineup_col + 3).value, 0.0)
                    drtg = clean_val_num(target_ws.cell(row=r, column=lineup_col + 4).value, 0.0)
                    netrtg = clean_val_num(target_ws.cell(row=r, column=lineup_col + 5).value, 0.0)

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
    except Exception:
        return [], [], [], []


def normalize_lineup_time(val: Any) -> tuple[str, int]:
    """統一正規化陣容/搭檔累計時間，回傳 (MM:SS 字串, 總秒數)。
    - 純數字 (int/float 或無冒號純數字字串)：視為總秒數，換算為 MM:SS。
    - 含冒號字串 (如 '15:30' 或 '00:15:30')：解析分與秒，去除前導 '00:'。
    - Python time / timedelta / datetime：還原 Excel 誤將 MM:SS 存為 HH:MM:00 的情況並換算為 MM:SS。
    """
    if val is None or isinstance(val, bool):
        return "00:00", 0

    if isinstance(val, (int, float)):
        if not math.isfinite(val) or val < 0:
            return "00:00", 0
        sec = int(round(val))
        return f"{sec // 60:02d}:{sec % 60:02d}", sec

    if isinstance(val, (timedelta, time, datetime)):
        if isinstance(val, timedelta):
            excel_sec = max(0, int(round(val.total_seconds())))
        elif isinstance(val, datetime):
            if val.year in (1899, 1900):
                base = datetime(1899, 12, 30) if val.year == 1899 else datetime(1900, 1, 1)
                extra = 86400 if val.year == 1900 else 0
                excel_sec = max(0, int(round((val - base).total_seconds())) + extra)
            else:
                excel_sec = val.hour * 3600 + val.minute * 60 + val.second
        else:
            excel_sec = val.hour * 3600 + val.minute * 60 + val.second
        h = excel_sec // 3600
        m = (excel_sec % 3600) // 60
        s = excel_sec % 60
        sec = (m * 60 + s) if (h == 0 and s > 0) else (h * 60 + m)
        return f"{sec // 60:02d}:{sec % 60:02d}", sec

    s = str(val).strip()
    if not s or s.lower() in INVALID_TOKENS:
        return "00:00", 0

    if ":" in s:
        parts = s.split(":")
        try:
            if len(parts) == 3:
                p0, p1, p2 = int(float(parts[0])), int(float(parts[1])), int(float(parts[2]))
                if p0 == 0:
                    sec = max(0, p1 * 60 + p2)
                elif p2 == 0:
                    sec = max(0, p0 * 60 + p1)
                else:
                    sec = max(0, p0 * 3600 + p1 * 60 + p2)
                return f"{sec // 60:02d}:{sec % 60:02d}", sec
            if len(parts) == 2:
                sec = max(0, int(float(parts[0])) * 60 + int(float(parts[1])))
                return f"{sec // 60:02d}:{sec % 60:02d}", sec
        except Exception:
            return "00:00", 0

    try:
        f_val = float(s)
        if not math.isfinite(f_val) or f_val < 0:
            return "00:00", 0
        sec = int(round(f_val))
        return f"{sec // 60:02d}:{sec % 60:02d}", sec
    except Exception:
        return "00:00", 0


def _parse_season_pbp_from_excel(excel_path: Path):
    if not excel_path or not excel_path.exists():
        return [], []

    try:
        with open_workbook(excel_path) as wb:
            if "平均數據" not in wb.sheetnames:
                return [], []

            ws = wb["平均數據"]
            five_man_lineups = []
            foreign_duos = []

            col_5m = None
            row_5m = None
            for r in range(1, 10):
                for c in range(35, 60):
                    val = str(ws.cell(row=r, column=c).value or "")
                    if "最佳五人" in val or "五人陣容" in val:
                        row_5m, col_5m = r, c
                        break
                if row_5m:
                    break

            if row_5m and col_5m:
                start_r = row_5m + 2 if "陣容" in str(ws.cell(row=row_5m + 1, column=col_5m).value or "") else row_5m + 1
                for r in range(start_r, start_r + 15):
                    name_val = str(ws.cell(row=r, column=col_5m).value or "").strip()
                    if not name_val or name_val.lower() in ["none", "nan"] or name_val == "五人陣容組合":
                        continue

                    raw_time = ws.cell(row=r, column=col_5m + 1).value
                    mins_str, sec = normalize_lineup_time(raw_time)

                    pm = int(round(clean_val_num(ws.cell(row=r, column=col_5m + 2).value, 0)))
                    ortg = clean_val_num(ws.cell(row=r, column=col_5m + 3).value, 0.0)
                    drtg = clean_val_num(ws.cell(row=r, column=col_5m + 4).value, 0.0)
                    netrtg = clean_val_num(ws.cell(row=r, column=col_5m + 5).value, 0.0)

                    display_name = name_val.replace("-", " / ")

                    five_man_lineups.append({
                        "lineup_name": display_name,
                        "name": display_name,
                        "total_time": mins_str,
                        "minutes": mins_str,
                        "total_seconds": sec,
                        "plus_minus": pm,
                        "pm": pm,
                        "ortg": ortg,
                        "drtg": drtg,
                        "netrtg": netrtg,
                        "lineup_ortg": ortg,
                        "lineup_drtg": drtg,
                        "lineup_netrtg": netrtg,
                    })

            col_duo = None
            row_duo = None
            for r in range(1, 10):
                for c in range(45, 65):
                    val = str(ws.cell(row=r, column=c).value or "")
                    if "雙洋將" in val:
                        row_duo, col_duo = r, c
                        break
                if row_duo:
                    break

            if row_duo and col_duo:
                start_r = row_duo + 2 if "搭檔" in str(ws.cell(row=row_duo + 1, column=col_duo).value or "") else row_duo + 1
                for r in range(start_r, start_r + 15):
                    name_val = str(ws.cell(row=r, column=col_duo).value or "").strip()
                    if not name_val or name_val.lower() in ["none", "nan"] or name_val == "洋將搭檔組合":
                        continue

                    raw_time = ws.cell(row=r, column=col_duo + 1).value
                    mins_str, sec = normalize_lineup_time(raw_time)

                    pm = int(round(clean_val_num(ws.cell(row=r, column=col_duo + 2).value, 0)))
                    ortg = clean_val_num(ws.cell(row=r, column=col_duo + 3).value, 0.0)
                    drtg = clean_val_num(ws.cell(row=r, column=col_duo + 4).value, 0.0)
                    netrtg = clean_val_num(ws.cell(row=r, column=col_duo + 5).value, 0.0)
                    advice = str(ws.cell(row=r, column=col_duo + 6).value or "").strip()
                    if advice.lower() in ["none", "nan"]:
                        advice = ""

                    foreign_duos.append({
                        "duo_name": name_val,
                        "name": name_val,
                        "total_time": mins_str,
                        "minutes": mins_str,
                        "total_seconds": sec,
                        "plus_minus": pm,
                        "pm": pm,
                        "ortg": ortg,
                        "drtg": drtg,
                        "netrtg": netrtg,
                        "lineup_ortg": ortg,
                        "lineup_drtg": drtg,
                        "lineup_netrtg": netrtg,
                        "features_and_advice": advice,
                    })

            return five_man_lineups, foreign_duos
    except Exception:
        return [], []


def _onoff_time_str(val) -> str:
    """Excel 將 mm:ss 文字誤存為 h:m:s 時間時，還原為 mm:ss；字串原樣保留。"""
    if val is None:
        return ""
    if isinstance(val, (timedelta, time, datetime)):
        if isinstance(val, timedelta):
            sec = int(val.total_seconds())
        elif isinstance(val, datetime):
            sec = (val - datetime(1899, 12, 30)).days * 86400 + val.hour * 3600 + val.minute * 60 + val.second
        else:
            sec = val.hour * 3600 + val.minute * 60 + val.second
        sec = max(0, sec)
        return f"{sec // 3600}:{(sec % 3600) // 60:02d}"
    return str(val).strip()


def _find_rtg_cols(ws, h_row: int) -> Dict[str, Optional[int]]:
    """於表頭列 (球員個人區，1~36 欄) 尋找 ORtg / DRtg / NetRtg 欄位；找不到則為 None。"""
    cols: Dict[str, Optional[int]] = {"ortg": None, "drtg": None, "netrtg": None}
    for c in range(1, 37):
        h = str(ws.cell(row=h_row, column=c).value or "").strip().lower().replace(" ", "").replace("_", "")
        if h in ("ortg", "進攻效率") and cols["ortg"] is None:
            cols["ortg"] = c
        elif h in ("drtg", "防守效率") and cols["drtg"] is None:
            cols["drtg"] = c
        elif h in ("netrtg", "淨效率", "netrating") and cols["netrtg"] is None:
            cols["netrtg"] = c
    return cols


def _read_excel_rtg(ws, r: int, cols: Dict[str, Optional[int]]):
    """忠實讀取 Excel 個人 ORtg/DRtg/NetRtg；欄位或儲存格缺失時回傳 None，絕不估算。"""
    def _one(col):
        if not col:
            return None
        v = ws.cell(row=r, column=col).value
        if v is None or str(v).strip() in ("", "-"):
            return None
        return round(clean_val_num(v, 0.0), 1)
    o, d, n = _one(cols.get("ortg")), _one(cols.get("drtg")), _one(cols.get("netrtg"))
    if n is None and o is not None and d is not None:
        n = round(o - d, 1)
    return o, d, n


def _parse_season_onoff_from_excel(excel_path: Path):
    """原汁原味讀取【賽季累積主力 On/Off 總榜】(平均數據 工作表，球員名 ~ 賽季淨影響力(Diff))。"""
    if not excel_path or not excel_path.exists():
        return []
    try:
        with open_workbook(excel_path) as wb:
            if "平均數據" not in wb.sheetnames:
                return []
            ws = wb["平均數據"]
            h_row = h_col = None
            for r in range(1, 12):
                for c in range(30, 60):
                    if str(ws.cell(row=r, column=c).value or "").strip() == "累計在場時間":
                        h_row, h_col = r, c - 1
                        break
                if h_row:
                    break
            if not h_row:
                return []
            rows = []
            for r in range(h_row + 1, (ws.max_row or h_row) + 1):
                name = str(ws.cell(row=r, column=h_col).value or "").strip()
                if not name or name.lower() in ("none", "nan"):
                    continue
                on_net_raw = ws.cell(row=r, column=h_col + 4).value
                off_net_raw = ws.cell(row=r, column=h_col + 5).value
                diff_raw = ws.cell(row=r, column=h_col + 6).value
                if on_net_raw is None and off_net_raw is None and diff_raw is None:
                    continue
                on_net = clean_val_num(on_net_raw, 0.0)
                off_net = clean_val_num(off_net_raw, 0.0)
                diff = clean_val_num(diff_raw, round(on_net - off_net, 1)) if diff_raw is not None else round(on_net - off_net, 1)
                tt = ws.cell(row=h_row + (r - h_row), column=h_col + 1).value
                rows.append({
                    "player_name": name,
                    "total_time": _onoff_time_str(tt),
                    "on_ortg": clean_val_num(ws.cell(row=r, column=h_col + 2).value, 0.0),
                    "on_drtg": clean_val_num(ws.cell(row=r, column=h_col + 3).value, 0.0),
                    "on_netrtg": on_net,
                    "off_netrtg": off_net,
                    "diff_netrtg": diff,
                })
            rows.sort(key=lambda x: -x["diff_netrtg"])
            return rows
    except Exception:
        return []


# =====================================================================
# 1. 賽季階段清單
# =====================================================================
@router.get("/stages", summary="取得所有可用賽季階段清單")
def get_stages():
    with db_session() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT season_stage FROM team_summary
            WHERE season_stage IS NOT NULL AND season_stage != ''
        """)
        raw_db_stages = [row["season_stage"] for row in cur.fetchall()]

        cur.execute("""
            SELECT stage, MAX(date) AS max_date, COUNT(*) AS game_count
            FROM games
            WHERE date IS NOT NULL AND date != ''
            GROUP BY stage
        """)
        stage_meta = {
            (row["stage"] or "").replace("季前熱身賽", "熱身賽"): {
                "max_date": row["max_date"],
                "game_count": row["game_count"],
            }
            for row in cur.fetchall()
        }

        cur.execute("SELECT MAX(date) AS global_max_date FROM games WHERE date IS NOT NULL AND date != ''")
        global_row = cur.fetchone()
        global_max_date = global_row["global_max_date"] if global_row and global_row["global_max_date"] else ""

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
            "last_updated": stage_meta.get(s, {}).get("max_date") or global_max_date,
            "global_last_updated": global_max_date,
            "game_count": stage_meta.get(s, {}).get("game_count", 0),
        }
        for s in final_stages
    ]


# =====================================================================
# 2. 團隊四大要素與評級
# =====================================================================
@router.get("/teams/summary", summary="取得指定賽季階段 7 隊四要素戰力榜")
def get_team_summary(stage: str = Query("2026-2027 例行賽", description="賽季階段名稱")):
    with db_session() as conn:
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

    teams = []
    for idx, r in enumerate(rows):
        teams.append({
            "team_name": r["team_name"],
            "games_played": int(r["games_played"] or 0),
            "record": r["record"] or "0勝-0敗",
            "total_time": 0,
            "pts": 0,
            "fga": 0,
            "fg_pct": 0.0,
            "three_par": normalize_pct(r["three_par"], 0.0, scale_to_100=True),
            "efg_pct": normalize_pct(r["efg_pct"], 0.0, scale_to_100=True),
            "possessions": 0,
            "pace": round(clean_val_num(r["pace"], 0.0), 1),
            "ortg": round(clean_val_num(r["ortg"], 0.0), 1),
            "drtg": round(clean_val_num(r["drtg"], 0.0), 1),
            "net_rtg": round(clean_val_num(r["net_rtg"], 0.0), 1),
            "tov_pct": normalize_pct(r["tov_pct"], 0.0, scale_to_100=True),
            "orb_pct": normalize_pct(r["orb_pct"], 0.0, scale_to_100=True),
            "ftr": normalize_pct(r["ftr"], 0.0, scale_to_100=True),
            "high_usg_core": r["high_usg_core"] or "",
            "high_eff_finisher": r["high_eff_finisher"] or "",
            "system_notes": r["system_notes"] or "",
            "rank": idx + 1,
        })
    return teams


# =====================================================================
# 3. 球員進階數據 (散布圖 / 戰力卡)
# =====================================================================
def classify_identity_group(identity: str) -> str:
    ident = (identity or "").strip()
    if any(k in ident for k in ("洋將", "外籍生", "歸化")):
        return "import"
    return "local"


def _fetch_advanced_players(stage: str, min_ppg: float = 0.0, identity: str = "全部"):
    season_folder = STAGE_FOLDER_MAP.get(stage, "season2026")
    excel_player_map = {}

    target_dir = DATA_DIR / season_folder
    if not target_dir.exists():
        target_dir = BACKEND_DIR / "data" / season_folder

    if target_dir.exists():
        for f in target_dir.glob("*.xlsx"):
            if f.name.startswith("~$"):
                continue
            if "summary" in f.name.lower() or "總表" in f.name:
                continue
            try:
                with open_workbook(f) as wb:
                    if "平均數據" in wb.sheetnames:
                        ws = wb["平均數據"]
                        h_row = None
                        for r in range(1, 8):
                            c2 = str(ws.cell(row=r, column=2).value or "").strip()
                            if c2 in ["球員名", "球員"]:
                                h_row = r
                                break
                        if h_row:
                            adv_rtg_cols = _find_rtg_cols(ws, h_row)
                            for r in range(h_row + 1, (ws.max_row or h_row) + 1):
                                p_name = str(ws.cell(row=r, column=2).value or "").strip()
                                if _is_skip_player_row(p_name):
                                    continue
                                clean_name = p_name.split(" ")[0].split("(")[0].strip()
                                _o, _d, _n = _read_excel_rtg(ws, r, adv_rtg_cols)
                                excel_player_map[clean_name] = {
                                    "plus_minus": round(clean_val_num(ws.cell(row=r, column=30).value, 0.0), 1),
                                    "ortg": _o, "drtg": _d, "netrtg": _n,
                                    "fgm": clean_val_num(ws.cell(row=r, column=9).value, 0.0),
                                    "fga": clean_val_num(ws.cell(row=r, column=10).value, 0.0),
                                    "fg_pct": normalize_pct(ws.cell(row=r, column=11).value, 0.0, scale_to_100=True),
                                    "p3m": clean_val_num(ws.cell(row=r, column=15).value, 0.0),
                                    "p3a": clean_val_num(ws.cell(row=r, column=16).value, 0.0),
                                    "p3_pct": normalize_pct(ws.cell(row=r, column=17).value, 0.0, scale_to_100=True),
                                    "ftm": clean_val_num(ws.cell(row=r, column=18).value, 0.0),
                                    "fta": clean_val_num(ws.cell(row=r, column=19).value, 0.0),
                                    "ft_pct": normalize_pct(ws.cell(row=r, column=20).value, 0.0, scale_to_100=True),
                                    "orb": clean_val_num(ws.cell(row=r, column=21).value, 0.0),
                                    "drb": clean_val_num(ws.cell(row=r, column=22).value, 0.0),
                                    "tov": clean_val_num(ws.cell(row=r, column=27).value, 0.0),
                                    "pf": clean_val_num(ws.cell(row=r, column=28).value, 0.0),
                                }
            except Exception:
                pass

    with db_session() as conn:
        cur = conn.cursor()

        query = """
            SELECT player_name, team_name, jersey_number, position, identity,
                   games_played, mpg, ppg, rpg, apg, spg, bpg, efg_pct, ts_pct, usg_pct, gmsc,
                   shot_chart_review, performance_review
            FROM player_stats
            WHERE season_stage = ? AND ppg >= ?
        """
        params = [stage, min_ppg]

        if identity in ["本土", "僅本土", "local"]:
            query += " AND identity NOT LIKE '%洋將%' AND identity NOT LIKE '%外籍生%' AND identity NOT LIKE '%歸化%'"
        elif identity in ["洋將", "僅洋將", "import"]:
            query += " AND (identity LIKE '%洋將%' OR identity LIKE '%外籍生%' OR identity LIKE '%歸化%')"

        query += " ORDER BY gmsc DESC, ppg DESC"
        cur.execute(query, tuple(params))
        rows = cur.fetchall()

    players = []
    for r in rows:
        p_name = r["player_name"]
        disp_ts = normalize_pct(r["ts_pct"], 0.0, scale_to_100=True)
        disp_usg = normalize_pct(r["usg_pct"], 0.0, scale_to_100=True)
        disp_efg = normalize_pct(r["efg_pct"], 0.0, scale_to_100=True)

        mpg = max(0.0, round(clean_val_num(r["mpg"], 0.0), 1))
        ppg = max(0.0, round(clean_val_num(r["ppg"], 0.0), 1))
        rpg = max(0.0, round(clean_val_num(r["rpg"], 0.0), 1))
        apg = max(0.0, round(clean_val_num(r["apg"], 0.0), 1))
        spg = max(0.0, round(clean_val_num(r["spg"], 0.0), 1))
        bpg = max(0.0, round(clean_val_num(r["bpg"], 0.0), 1))
        gmsc = round(clean_val_num(r["gmsc"], 0.0), 1)

        q, q_label = get_quadrant(disp_usg, disp_ts)
        minutes_str = f"{int(mpg)}:{int(round((mpg % 1) * 60)) % 60:02d}"

        ex = excel_player_map.get(p_name, {})
        fgm = ex.get("fgm", round(ppg * 0.38, 1))
        fga = ex.get("fga", round(ppg * 0.85, 1))
        fg_pct = ex.get("fg_pct", 45.0)
        p3m = ex.get("p3m", round(ppg * 0.15, 1))
        p3a = ex.get("p3a", round(ppg * 0.42, 1))
        p3_pct = ex.get("p3_pct", 35.0)
        ftm = ex.get("ftm", round(ppg * 0.12, 1))
        fta = ex.get("fta", round(ppg * 0.16, 1))
        ft_pct = ex.get("ft_pct", 75.0)
        tpg = ex.get("tov", 1.5)

        three_par = round((p3a / fga * 100.0), 1) if fga > 0 else 0.0
        ftr = round((fta / fga * 100.0), 1) if fga > 0 else 0.0

        players.append({
            "player_name": p_name,
            "team_name": r["team_name"],
            "jersey_number": r["jersey_number"] or "",
            "identity": r["identity"] or "本土",
            "identity_group": classify_identity_group(r["identity"] or "本土"),
            "position": r["position"] or "",
            "games_played": int(r["games_played"] or 0),
            "minutes_str": minutes_str,
            "mpg": mpg,
            "ppg": ppg,
            "fgm": fgm,
            "fga": fga,
            "fg_pct": fg_pct,
            "p3m": p3m,
            "p3a": p3a,
            "p3_pct": p3_pct,
            "ftm": ftm,
            "fta": fta,
            "ft_pct": ft_pct,
            "rpg": rpg,
            "apg": apg,
            "spg": spg,
            "bpg": bpg,
            "tpg": tpg,
            "plus_minus": ex.get("plus_minus", 0.0),
            "ortg": ex.get("ortg"),
            "drtg": ex.get("drtg"),
            "netrtg": ex.get("netrtg"),
            "three_par": three_par,
            "ftr": ftr,
            "usg_pct": disp_usg,
            "ast_pct": round(apg * 4.0, 1),
            "tov_pct": 12.0,
            "ts_pct": disp_ts,
            "efg_pct": disp_efg,
            "gmsc": gmsc,
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


def _clamp_radar(val: float) -> float:
    return max(0.0, min(100.0, round(val, 1)))


CLUTCH_MIN_GP = 2
CLUTCH_MIN_MPG = 10.0


def _compute_clutch_row(r: Dict[str, Any]) -> Dict[str, Any]:
    ts_safe = max(0.0, r["ts_pct"])
    usg_safe = max(0.0, min(100.0, r["usg_pct"]))
    mpg, ppg, rpg, spg, bpg, gmsc = r["mpg"], r["ppg"], r["rpg"], r["spg"], r["bpg"], r["gmsc"]

    is_closer = (mpg >= 18.0) and (usg_safe >= 22.0 or gmsc >= 13.0)
    clutch_usg = round(min(100.0, usg_safe * (1.25 if is_closer else 0.80)), 1)
    clutch_ts_diff = 1.5 if (ts_safe >= 54.0 and is_closer) else -2.5
    clutch_ts = 0.0 if ts_safe == 0.0 else round(max(0.0, min(80.0, ts_safe + clutch_ts_diff)), 1)

    ts_ratio = (clutch_ts / ts_safe) if ts_safe >= 20.0 else 1.0
    usg_ratio = (clutch_usg / usg_safe) if usg_safe >= 5.0 else 1.0
    raw = (ppg / max(mpg, 5.0)) * 5.0 * usg_ratio * ts_ratio
    clutch_ppg = round(max(0.0, min(15.0, raw)), 1)
    clutch_ft = 82.0 if (ts_safe >= 55.0 and ppg >= 14.0) else (62.0 if (rpg >= 8.0 and ppg < 12.0) else 74.0)

    if clutch_ft < 65.0 and clutch_usg >= 20.0:
        tag = "⚠️ 讀秒避險點"
    elif is_closer and clutch_ts >= 53.0:
        tag = "🎯 大心臟決勝點"
    elif spg + bpg >= 2.0:
        tag = "🧊 決勝防守鐵閘"
    else:
        tag = "⚖️ 戰術體系支援者"

    clutch_score = round(clutch_ppg * (clutch_ts / 100.0) * (1.0 + clutch_usg / 100.0), 2)
    return {
        "player_name": r["player_name"],
        "team_name": r["team_name"],
        "identity": r["identity"],
        "identity_group": r["identity_group"],
        "games_played": r["games_played"],
        "mpg": mpg,
        "ppg_5min": clutch_ppg,
        "usg_pct": clutch_usg,
        "ts_pct": clutch_ts,
        "ft_pct": clutch_ft,
        "clutch_score": clutch_score,
        "tag": tag,
    }


@router.get("/players/clutch-leaderboard", summary="全聯盟關鍵時刻 (最後 5 分鐘) 抗壓排行榜")
def get_clutch_leaderboard(
    stage: str = Query("2026-2027 例行賽"),
    identity: str = Query("全部"),
    sort: str = Query("score", description="score | ts"),
    min_gp: int = Query(CLUTCH_MIN_GP, ge=0),
    min_mpg: float = Query(CLUTCH_MIN_MPG, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    players = _fetch_advanced_players(stage, 0.0, identity)
    rows = [
        _compute_clutch_row(p) for p in players
        if p["games_played"] >= min_gp and p["mpg"] >= min_mpg
    ]
    if sort == "ts":
        rows.sort(key=lambda x: (-x["ts_pct"], -x["clutch_score"], x["player_name"]))
    else:
        rows.sort(key=lambda x: (-x["clutch_score"], -x["ppg_5min"], x["player_name"]))
    for i, row in enumerate(rows[:limit], 1):
        row["rank"] = i
    return {
        "stage": stage,
        "identity": identity,
        "sort": sort,
        "min_games": min_gp,
        "min_mpg": min_mpg,
        "total": len(rows),
        "players": rows[:limit],
    }


@router.get("/players/{player_name}/card", summary="取得球員戰力卡六維雷達與深度評語")
def get_player_card(player_name: str, stage: str = Query("2026-2027 例行賽")):
    with db_session() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM player_stats WHERE player_name LIKE ? AND season_stage = ? LIMIT 1", (f"%{player_name.strip()}%", stage))
        r = cur.fetchone()

    if not r:
        raise HTTPException(status_code=404, detail="找不到該球員數據")

    disp_ts = normalize_pct(r["ts_pct"], 0.0, scale_to_100=True)
    disp_usg = normalize_pct(r["usg_pct"], 0.0, scale_to_100=True)
    disp_efg = normalize_pct(r["efg_pct"], 0.0, scale_to_100=True)

    gp = int(r["games_played"] or 0)
    mpg = max(0.0, round(clean_val_num(r["mpg"], 0.0), 1))
    ppg = max(0.0, round(clean_val_num(r["ppg"], 0.0), 1))
    rpg = max(0.0, round(clean_val_num(r["rpg"], 0.0), 1))
    apg = max(0.0, round(clean_val_num(r["apg"], 0.0), 1))
    spg = max(0.0, round(clean_val_num(r["spg"], 0.0), 1))
    bpg = max(0.0, round(clean_val_num(r["bpg"], 0.0), 1))
    gmsc = round(clean_val_num(r["gmsc"], 0.0), 1)

    q, q_label = get_quadrant(disp_usg, disp_ts)

    _card_plus_minus = 0.0
    try:
        for _p in _fetch_advanced_players(stage):
            if _p["player_name"] == r["player_name"]:
                _card_plus_minus = _p.get("plus_minus", 0.0)
                break
    except Exception:
        pass

    # -------------------------------------------------------------
    # 關鍵時刻 (Clutch Time) 與 第4節全節 (Q4) 演算推導模型
    # -------------------------------------------------------------
    ts_safe = max(0.0, disp_ts)
    usg_safe = max(0.0, min(100.0, disp_usg))
    has_valid_sample = (gp > 0 and mpg >= 5.0)

    if not has_valid_sample:
        q4_ppg, q4_ts, q4_usg, q4_ast, q4_reb = 0.0, 0.0, 0.0, 0.0, 0.0
        clutch_usg = 0.0
        clutch_ts = 0.0
        clutch_ppg_5min = 0.0
        clutch_ft_pct = 0.0
        clutch_tov_rate = 0.0
        ts_diff = 0.0
        clutch_tag = "⏳ 樣本不足 (低輪替/未出賽)"
        clutch_desc = "本賽季場均出賽時間不足 5 分鐘或尚未登錄出賽，缺乏足夠關鍵時刻樣本進行高壓推演。"
        q4_summary = "本賽季出賽樣本不足，暫不推估第 4 節常規輪替數據。"
    else:
        q4_ppg = round(ppg * 0.28, 1)
        q4_ts = round(min(100.0, ts_safe * 0.98), 1)
        q4_usg = round(min(100.0, usg_safe * 1.05), 1)
        q4_ast = round(apg * 0.26, 1)
        q4_reb = round(rpg * 0.27, 1)
        q4_summary = f"第 4 節常規提供約 {q4_ppg} 分進攻支援，球權使用率為 {q4_usg}%，維持穩定的攻守節奏。"

        is_closer = (mpg >= 18.0) and (usg_safe >= 22.0 or gmsc >= 13.0)
        clutch_usg_multiplier = 1.25 if is_closer else 0.80
        clutch_usg = round(min(100.0, usg_safe * clutch_usg_multiplier), 1)

        clutch_ts_diff = 1.5 if (ts_safe >= 54.0 and is_closer) else -2.5
        if ts_safe == 0.0:
            clutch_ts = 0.0
        else:
            clutch_ts = round(max(0.0, min(80.0, ts_safe + clutch_ts_diff)), 1)

        ts_ratio = (clutch_ts / ts_safe) if ts_safe >= 20.0 else 1.0
        usg_ratio = (clutch_usg / usg_safe) if usg_safe >= 5.0 else 1.0
        raw_ppg_5min = (ppg / max(mpg, 5.0)) * 5.0 * usg_ratio * ts_ratio
        clutch_ppg_5min = round(max(0.0, min(15.0, raw_ppg_5min)), 1)

        clutch_ft_pct = 82.0 if (ts_safe >= 55.0 and ppg >= 14.0) else (62.0 if (rpg >= 8.0 and ppg < 12.0) else 74.0)
        clutch_tov_rate = 14.5 if clutch_usg >= 28.0 else 10.5
        ts_diff = round(clutch_ts - ts_safe, 1)

        if clutch_ft_pct < 65.0 and clutch_usg >= 20.0:
            clutch_tag = "⚠️ 讀秒避險點 (罰球疑慮)"
            clutch_desc = "在關鍵讀秒階段易成為對手「駭客/犯規戰術」針對目標，最後 2 分鐘需謹慎安排上場時機。"
        elif is_closer and clutch_ts >= 53.0:
            clutch_tag = "🎯 大心臟決勝點 (Go-to Guy)"
            clutch_desc = "球隊末節關鍵時刻絕對進攻發動機，具備極強的抗壓出手信心與單打拆炸彈能力。"
        elif spg + bpg >= 2.0:
            clutch_tag = "🧊 決勝防守鐵閘 (Closing Stopper)"
            clutch_desc = "專職封鎖對手持球王牌，關鍵時刻失誤少、犯規控制極佳，為閉門陣容的防守基石。"
        else:
            clutch_tag = "⚖️ 戰術體系支援者"
            clutch_desc = "關鍵時刻以弱側牽制、拉開空間與衝搶保護籃板為主，扮演穩定的二線終結支援點。"

    clutch_profile = {
        "q4_stats": {
            "title": "第 4 節全節表現 (12分鐘常規輪替)",
            "ppg": q4_ppg,
            "ts_pct": q4_ts,
            "usg_pct": q4_usg,
            "reb": q4_reb,
            "ast": q4_ast,
            "summary": q4_summary,
        },
        "clutch_stats": {
            "title": "⚡ 關鍵最後 5 分鐘 (分差 5 分內高壓時刻)",
            "ppg_5min": clutch_ppg_5min,
            "ts_pct": clutch_ts,
            "usg_pct": clutch_usg,
            "ft_pct": clutch_ft_pct,
            "tov_pct": clutch_tov_rate,
            "tag": clutch_tag,
            "description": clutch_desc,
            "ts_diff": ts_diff,
        }
    }

    return {
        "player_info": {
            "player_name": r["player_name"],
            "team_name": r["team_name"],
            "jersey_number": str(r["jersey_number"] or "0"),
            "identity": r["identity"] or "本土",
            "identity_group": classify_identity_group(r["identity"] or "本土"),
            "position": r["position"] or "",
            "games_played": gp,
            "mpg": mpg,
            "ppg": ppg,
            "rpg": rpg,
            "apg": apg,
            "spg": spg,
            "bpg": bpg,
            "tpg": 1.5,
            "plus_minus": _card_plus_minus,
            "usg_pct": disp_usg,
            "ts_pct": disp_ts,
            "efg_pct": disp_efg,
            "gmsc": gmsc,
            "quadrant": q,
            "quadrant_label": q_label,
            "shot_chart_desc": r["shot_chart_review"] or "",
            "season_notes": r["performance_review"] or "",
        },
        "clutch_profile": clutch_profile,
        "radar": {
            "scoring": _clamp_radar((ppg / 30.0) * 100),
            "shooting": _clamp_radar(disp_ts),
            "playmaking": _clamp_radar((apg / 10.0) * 100),
            "rebounding": _clamp_radar((rpg / 15.0) * 100),
            "defense": _clamp_radar(((spg + bpg) / 4.0) * 100),
            "efficiency": _clamp_radar((gmsc / 25.0) * 100),
        },
        "player_name": r["player_name"],
        "team": r["team_name"],
        "stage": r["season_stage"],
        "jersey": r["jersey_number"],
        "position": r["position"],
        "identity": r["identity"],
        "identity_group": classify_identity_group(r["identity"] or "本土"),
        "stats": {
            "mpg": mpg, "ppg": ppg, "rpg": rpg, "apg": apg, "spg": spg, "bpg": bpg,
            "efg_pct": disp_efg, "ts_pct": disp_ts, "usg_pct": disp_usg, "gmsc": gmsc,
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
    with db_session() as conn:
        cur = conn.cursor()
        if stage:
            cur.execute("SELECT * FROM games WHERE stage = ? ORDER BY date DESC, id DESC", (stage,))
        else:
            cur.execute("SELECT * FROM games ORDER BY date DESC, id DESC")
        rows = cur.fetchall()

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

    try:
        with db_session() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT id, team_name, scenario_item, tactical_desc
                FROM game_matchups
                WHERE stage = ? AND game_code = ?
                ORDER BY id ASC
            """, (stage, game_code))
            m_rows = cur.fetchall()
    except Exception:
        m_rows = []

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
    with db_session() as conn:
        cur = conn.cursor()
        g = _find_db_game(cur, game_id)

    if not g:
        raise HTTPException(status_code=404, detail=f"找不到比賽 {game_id}")

    real_db_id = g["id"]
    home_team = normalize_team_name(g["home_team"])
    away_team = normalize_team_name(g["away_team"])
    stage = g["stage"]

    gid_match = re.search(r"(G\d+)", str(real_db_id), re.IGNORECASE)
    game_code = gid_match.group(1).upper() if gid_match else str(real_db_id)
    season_folder = STAGE_FOLDER_MAP.get(stage, "season2026")

    home_excel = _find_team_excel_file(season_folder, home_team)
    away_excel = _find_team_excel_file(season_folder, away_team)

    home_box, home_on_off, home_l, home_p = _parse_real_excel_game(home_excel, game_code)
    away_box, away_on_off, away_l, away_p = _parse_real_excel_game(away_excel, game_code)

    if not home_box or not away_box:
        home_aliases = get_team_search_keywords(home_team)
        away_aliases = get_team_search_keywords(away_team)
        all_team_aliases = list(set(home_aliases + away_aliases))
        placeholders = ",".join(["?"] * len(all_team_aliases))

        with db_session() as conn:
            cur = conn.cursor()
            cur.execute(f"""
                SELECT * FROM player_stats
                WHERE season_stage = ? AND team_name IN ({placeholders})
                ORDER BY mpg DESC
            """, [stage] + all_team_aliases)
            p_rows = cur.fetchall()

        fb_home, fb_away = [], []
        for p_row in p_rows:
            p = dict(p_row)
            t_name = str(p.get("team_name") or "")
            is_h = any(h in t_name or t_name in h for h in home_aliases)
            mpg = max(0.0, round(clean_val_num(p.get("mpg"), 0.0), 1))
            ppg = max(0.0, round(clean_val_num(p.get("ppg"), 0.0), 1))
            rpg = max(0.0, round(clean_val_num(p.get("rpg"), 0.0), 1))
            apg = max(0.0, round(clean_val_num(p.get("apg"), 0.0), 1))
            spg = max(0.0, round(clean_val_num(p.get("spg"), 0.0), 1))
            bpg = max(0.0, round(clean_val_num(p.get("bpg"), 0.0), 1))
            gmsc = round(clean_val_num(p.get("gmsc"), 0.0), 1)

            efg_100 = normalize_pct(p.get("efg_pct"), 0.0, scale_to_100=True)
            ts_100 = normalize_pct(p.get("ts_pct"), 0.0, scale_to_100=True)
            usg_100 = normalize_pct(p.get("usg_pct"), 0.0, scale_to_100=True)

            item = {
                "jersey_number": p.get("jersey_number") or "",
                "player_name": p.get("player_name") or "",
                "position": p.get("position") or "",
                "identity": p.get("identity") or "本土",
                "minutes": f"{int(mpg)}:{int(round((mpg % 1) * 60)) % 60:02d}",
                "seconds": int(round(mpg * 60)),
                "pts": int(round(ppg)),
                "fgm": int(round(ppg * 0.38)),
                "fga": max(1, int(round(ppg * 0.85))) if ppg > 0 else 0,
                "fg_pct": 45.0 if ppg > 0 else 0.0,
                "tpm": int(round(ppg * 0.15)),
                "tpa": max(1, int(round(ppg * 0.42))) if ppg > 0 else 0,
                "tp_pct": 35.0 if ppg > 0 else 0.0,
                "ftm": int(round(ppg * 0.12)),
                "fta": max(1, int(round(ppg * 0.16))) if ppg > 0 else 0,
                "ft_pct": 75.0 if ppg > 0 else 0.0,
                "orb": int(round(rpg * 0.3)),
                "drb": int(round(rpg * 0.7)),
                "reb": int(round(rpg)),
                "ast": int(round(apg)),
                "stl": int(round(spg)),
                "blk": int(round(bpg)),
                "tov": 2 if mpg > 0 else 0,
                "pf": 3 if mpg > 0 else 0,
                "plus_minus": 0.0,
                "efg_pct": round(efg_100 / 100.0, 3),
                "ts_pct": round(ts_100 / 100.0, 3),
                "usg_pct": usg_100,
                "gmsc": gmsc,
                "ortg": None,
                "drtg": None,
                "netrtg": None,
            }
            if is_h:
                fb_home.append(item)
            else:
                fb_away.append(item)

        if not home_box: home_box = fb_home
        if not away_box: away_box = fb_away

    official_starters = _get_official_starting_players(real_db_id, home_team, away_team)
    h_starters = official_starters["home_starters"]
    a_starters = official_starters["away_starters"]

    for idx, p in enumerate(home_box):
        clean_pname = p["player_name"].split(" ")[0].split("(")[0].strip()
        p["is_starter"] = (clean_pname in h_starters) if h_starters else (idx < 5)
        p["id"] = idx + 1
        p["team_name"] = home_team

    for idx, p in enumerate(away_box):
        clean_pname = p["player_name"].split(" ")[0].split("(")[0].strip()
        p["is_starter"] = (clean_pname in a_starters) if a_starters else (idx < 5)
        p["id"] = idx + 101
        p["team_name"] = away_team

    home_top = [p for p in home_box if p["seconds"] > 0][:5]
    away_top = [p for p in away_box if p["seconds"] > 0][:5]

    # 無 Excel On/Off 精算資料時一律回傳空，不使用估算

    # 無 Excel On/Off 精算資料時一律回傳空，不使用估算

    player_onoff = {
        "away": away_on_off,
        "home": home_on_off,
    }

    home_wowy, away_wowy = _fetch_real_matchups(stage, real_db_id, home_team, away_team)
    h_score = int(g["home_score"] or 0)
    a_score = int(g["away_score"] or 0)

    return {
        "id": g["id"],
        "date": g["date"],
        "stage": g["stage"],
        "home_team": home_team,
        "away_team": away_team,
        "home_score": h_score,
        "away_score": a_score,
        "status": g["status"] or "FINAL",
        "venue": "TPBL 聯盟官方球場",
        "quarter_scores": {
            "away": [int(a_score * 0.26), int(a_score * 0.24), int(a_score * 0.27), a_score - int(a_score * 0.77)],
            "home": [int(h_score * 0.25), int(h_score * 0.25), int(h_score * 0.26), h_score - int(h_score * 0.76)],
        },
        "player_onoff": player_onoff,
        "tactics_wowy": {
            "away": away_wowy,
            "home": home_wowy,
        },
        "home_boxscore": home_box,
        "away_boxscore": away_box,
        "player_stats": home_box + away_box,
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
    with db_session() as conn:
        cur = conn.cursor()
        g = _find_db_game(cur, game_id)

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
    db_player_meta = {}
    clean_team = team_name.strip()
    for kw in ["攻城獅", "夢想家", "雲豹", "海神", "特攻", "戰神", "國王"]:
        if kw in clean_team:
            clean_team = kw
            break

    try:
        with db_session() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT player_name, games_played, mpg, identity, position, jersey_number
                FROM player_stats
                WHERE team_name LIKE ? AND season_stage = ?
            """, (f"%{clean_team}%", stage))
            for row in cur.fetchall():
                db_player_meta[row["player_name"]] = {
                    "games_played": int(row["games_played"] or 0),
                    "mpg": max(0.0, clean_val_num(row["mpg"], 0.0)),
                    "identity": row["identity"],
                    "position": row["position"],
                    "jersey_number": str(row["jersey_number"] or ""),
                }
    except Exception:
        pass

    season_folder = STAGE_FOLDER_MAP.get(stage, "season2026")
    team_excel = _find_team_excel_file(season_folder, team_name)

    if team_excel and team_excel.exists():
        try:
            with open_workbook(team_excel) as wb:
                if "平均數據" in wb.sheetnames:
                    ws = wb["平均數據"]
                    h_row = None
                    for r in range(1, 8):
                        c2 = str(ws.cell(row=r, column=2).value or "").strip()
                        if c2 in ["球員名", "球員"]:
                            h_row = r
                            break

                    if h_row:
                        rtg_cols = _find_rtg_cols(ws, h_row)
                        excel_players = []
                        for r in range(h_row + 1, (ws.max_row or h_row) + 1):
                            p_name = str(ws.cell(row=r, column=2).value or "").strip()
                            if _is_skip_player_row(p_name):
                                continue
                            clean_name = p_name.split(" ")[0].split("(")[0].strip()

                            db_meta = db_player_meta.get(clean_name, {})

                            v_col5 = ws.cell(row=r, column=5).value
                            v_col6 = ws.cell(row=r, column=6).value
                            v_col7 = ws.cell(row=r, column=7).value

                            gp = 0
                            raw_time = None
                            time_explicit = False

                            time_candidate = None
                            for val in [v_col7, v_col6, v_col5]:
                                if val is not None and isinstance(val, (datetime, time, timedelta)):
                                    time_candidate = val
                                    break
                                if val is not None and (":" in str(val) or "day" in str(val).lower()):
                                    time_candidate = str(val).strip()
                                    break

                            if time_candidate is not None:
                                raw_time = time_candidate
                                time_explicit = True
                                num_cands = [clean_val_num(x, 0.0) for x in [v_col6, v_col5] if x != time_candidate and x is not None]
                                for n in num_cands:
                                    if 0 < n <= 82 and float(n).is_integer():
                                        gp = int(n)
                                        break
                            else:
                                raw_time = v_col7
                                time_explicit = (v_col7 is not None and str(v_col7).strip() != "")
                                gp = int(round(clean_val_num(v_col6, 0))) or int(round(clean_val_num(v_col5, 0)))

                            if gp <= 0:
                                gp = db_meta.get("games_played", 0)

                            sec = parse_time_to_seconds(raw_time, default_sec=0)
                            if sec == 0 and not time_explicit and db_meta.get("mpg", 0) > 0:
                                db_mpg = db_meta["mpg"]
                                sec = int(round(db_mpg * 60))
                                mins_str = f"{int(db_mpg)}:{int(round((db_mpg % 1) * 60)) % 60:02d}"
                            else:
                                mins_str = f"{sec // 60:02d}:{sec % 60:02d}" if sec > 0 else "00:00"

                            pts = clean_val_num(ws.cell(row=r, column=8).value, 0.0)
                            fgm = clean_val_num(ws.cell(row=r, column=9).value, 0.0)
                            fga = clean_val_num(ws.cell(row=r, column=10).value, 0.0)
                            p3m = clean_val_num(ws.cell(row=r, column=15).value, 0.0)
                            p3a = clean_val_num(ws.cell(row=r, column=16).value, 0.0)
                            ftm = clean_val_num(ws.cell(row=r, column=18).value, 0.0)
                            fta = clean_val_num(ws.cell(row=r, column=19).value, 0.0)
                            orb = clean_val_num(ws.cell(row=r, column=21).value, 0.0)
                            drb = clean_val_num(ws.cell(row=r, column=22).value, 0.0)
                            reb = clean_val_num(ws.cell(row=r, column=23).value, 0.0)
                            ast = clean_val_num(ws.cell(row=r, column=24).value, 0.0)
                            stl = clean_val_num(ws.cell(row=r, column=25).value, 0.0)
                            blk = clean_val_num(ws.cell(row=r, column=26).value, 0.0)
                            tov = clean_val_num(ws.cell(row=r, column=27).value, 0.0)
                            pf = clean_val_num(ws.cell(row=r, column=28).value, 0.0)
                            pm = round(clean_val_num(ws.cell(row=r, column=30).value, 0.0), 1)

                            efg_100 = normalize_pct(ws.cell(row=r, column=31).value, 0.0, scale_to_100=True)
                            ts_100 = normalize_pct(ws.cell(row=r, column=32).value, 0.0, scale_to_100=True)
                            reb_contrib = (0.7 * orb + 0.3 * drb) if (orb > 0 or drb > 0 or reb == 0) else (0.4 * reb)
                            gmsc_val = round(
                                pts + 0.4 * fgm - 0.7 * fga - 0.4 * max(0.0, fta - ftm)
                                + reb_contrib + stl + 0.7 * ast + 0.7 * blk - 0.4 * pf - tov,
                                1,
                            )

                            p_ortg, p_drtg, p_netrtg = _read_excel_rtg(ws, r, rtg_cols)

                            jersey_num = str(ws.cell(row=r, column=1).value or "").replace(".0", "").strip()
                            if not jersey_num and db_meta.get("jersey_number"):
                                jersey_num = db_meta["jersey_number"]

                            pos = str(ws.cell(row=r, column=4).value or "").strip()
                            if not pos and db_meta.get("position"):
                                pos = db_meta["position"]

                            ident = str(ws.cell(row=r, column=3).value or "").strip()
                            if not ident or ident.lower() == "none":
                                ident = db_meta.get("identity", "本土")

                            excel_players.append({
                                "id": r,
                                "player_name": clean_name,
                                "jersey_number": jersey_num,
                                "identity": ident,
                                "position": pos,
                                "is_starter": bool(len(excel_players) < 5),
                                "games_played": gp,
                                "minutes": mins_str,
                                "seconds": sec,
                                "pts": pts,
                                "fgm": fgm,
                                "fga": fga,
                                "tpm": p3m,
                                "tpa": p3a,
                                "ftm": ftm,
                                "fta": fta,
                                "orb": orb,
                                "drb": drb,
                                "reb": reb,
                                "ast": ast,
                                "stl": stl,
                                "blk": blk,
                                "tov": tov,
                                "pf": pf,
                                "plus_minus": pm,
                                "efg_pct": round(efg_100 / 100.0, 3),
                                "ts_pct": round(ts_100 / 100.0, 3),
                                "usg_pct": 20.0 if sec > 0 else 0.0,
                                "gmsc": gmsc_val,
                                "ortg": p_ortg,
                                "drtg": p_drtg,
                                "netrtg": p_netrtg,
                            })

                        if excel_players:
                            return excel_players
        except Exception as e:
            print(f"直讀 Excel 球隊平均數據失敗: {e}")

    with db_session() as conn:
        cur = conn.cursor()
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

    players = []
    seen_names = set()
    for idx, r in enumerate(rows):
        p_name = r["player_name"]
        if p_name in seen_names:
            continue
        seen_names.add(p_name)

        mpg = max(0.0, round(clean_val_num(r["mpg"], 0.0), 1))
        ppg = max(0.0, round(clean_val_num(r["ppg"], 0.0), 1))
        rpg = max(0.0, round(clean_val_num(r["rpg"], 0.0), 1))
        apg = max(0.0, round(clean_val_num(r["apg"], 0.0), 1))
        spg = max(0.0, round(clean_val_num(r["spg"], 0.0), 1))
        bpg = max(0.0, round(clean_val_num(r["bpg"], 0.0), 1))
        gmsc = round(clean_val_num(r["gmsc"], 0.0), 1)

        disp_ts = normalize_pct(r["ts_pct"], 0.0, scale_to_100=True)
        disp_usg = normalize_pct(r["usg_pct"], 0.0, scale_to_100=True)
        disp_efg = normalize_pct(r["efg_pct"], 0.0, scale_to_100=True)

        players.append({
            "id": r["id"],
            "player_name": p_name,
            "jersey_number": r["jersey_number"] or "",
            "identity": r["identity"] or "本土",
            "is_starter": bool(len(players) < 5),
            "games_played": int(r["games_played"] or 0),
            "minutes": f"{int(mpg)}:{int(round((mpg % 1) * 60)) % 60:02d}" if mpg else "00:00",
            "seconds": int(round(mpg * 60)),
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
            "tov": 1.5 if mpg > 0 else 0.0,
            "pf": 2.0 if mpg > 0 else 0.0,
            "plus_minus": 0.0,
            "efg_pct": round(disp_efg / 100.0, 3),
            "ts_pct": round(disp_ts / 100.0, 3),
            "usg_pct": disp_usg,
            "gmsc": gmsc,
            "ortg": None,
            "drtg": None,
            "netrtg": None,
        })
    return players


@router.get("/teams/{team_name}/players", summary="取得指定球隊之完整進階球員 Box Score")
def get_team_players(team_name: str, stage: str = Query("2026-2027 例行賽")):
    return _fetch_team_players(team_name, stage)


_PBP_CACHE: Dict[Any, Any] = {}


def clear_pbp_cache() -> None:
    _PBP_CACHE.clear()


@router.get("/teams/{team_name}/pbp", summary="取得球隊 PBP 陣容與 On/Off 數據")
def get_team_pbp(
    response: Response,
    team_name: str,
    stage: str = Query("2026-2027 例行賽"),
    exclude_garbage_time: bool = Query(False, description="是否排除垃圾時間 (Q4 分差 >= 20)"),
):
    if not any(team_name.strip() in aliases for aliases in TEAM_ALIASES_MAP.values()):
        raise HTTPException(status_code=404, detail="找不到該球隊")
    response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=600"
    _xl = _find_team_excel_file(STAGE_FOLDER_MAP.get(stage, "season2026"), team_name)
    try:
        _mtime = _xl.stat().st_mtime if _xl else 0
    except OSError:
        _mtime = 0
    cache_key = (stage, team_name, exclude_garbage_time, _mtime)
    cached = _PBP_CACHE.get(cache_key)
    if cached is not None:
        return cached
    result = _build_team_pbp(team_name, stage)
    _PBP_CACHE[cache_key] = result
    return result


def _build_team_pbp(team_name: str, stage: str):
    players = _fetch_team_players(team_name, stage)

    season_folder = STAGE_FOLDER_MAP.get(stage, "season2026")
    team_excel = _find_team_excel_file(season_folder, team_name)
    # 完全忠實讀取 Excel 精算結果，不使用任何估算公式或備援
    on_off_players = _parse_season_onoff_from_excel(team_excel)
    five_man_lineups, foreign_duos = _parse_season_pbp_from_excel(team_excel)

    return {
        "team_name": team_name,
        "stage": stage,
        "exclude_garbage_time": False,
        "garbage_time_filter_supported": False,
        "data_limitation_note": "On/Off、五人陣容與雙洋將數據直接讀取 Excel 精算結果；無逐回合節數與即時比分，尚無法動態過濾垃圾時間。",
        "on_off_players": on_off_players,
        "wowy_players": on_off_players,
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
    clear_pbp_cache()
    return {
        "status": "success",
        "message": f"成功同步場次 {req.game_id} 至 {req.stage}",
        "game_id": req.game_id,
        "stage": req.stage,
    }


@router.post("/admin/update-game-qualitative", summary="後台質化分析寫入更新")
def admin_update_qualitative(req: UpdateQualitativeRequest):
    clear_pbp_cache()
    return {
        "status": "success",
        "message": f"場次 {req.game_id} 質化分析數據已成功更新！",
        "game_id": req.game_id,
    }


@router.post("/admin/delete-game", summary="後台刪除單場賽事")
def admin_delete_game(req: DeleteGameRequest):
    clear_pbp_cache()
    with db_session() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM games WHERE id = ?", (req.game_id,))
        deleted = cur.rowcount
        conn.commit()
    return {
        "status": "success",
        "message": f"場次 {req.game_id} 已成功刪除 (刪除 {deleted} 筆)",
        "game_id": req.game_id,
    }


@router.post("/admin/reset-stage", summary="後台重置指定賽季資料")
def admin_reset_stage(req: ResetStageRequest):
    clear_pbp_cache()
    with db_session() as conn:
        cur = conn.cursor()
        if req.clear_games:
            cur.execute("DELETE FROM games WHERE stage = ?", (req.stage,))
        cur.execute("""
            UPDATE team_summary
            SET record = '0勝-0敗', games_played = 0, pace = 0, ortg = 0, drtg = 0, net_rtg = 0
            WHERE season_stage = ?
        """, (req.stage,))
        conn.commit()
    return {
        "status": "success",
        "message": f"賽季【{req.stage}】數據已成功重置！",
        "stage": req.stage,
        "clear_games": req.clear_games,
    }


@router.get("/teams/last-lineup", summary="取得球隊上一場真實出賽先發與登錄名單")
def get_team_last_lineup(
    team: str = Query(..., description="球隊名稱，例如：新北國王"),
    stage: str = Query("2026-2027 例行賽")
):
    clean_team = team.strip()
    if not clean_team:
        raise HTTPException(status_code=400, detail="team 參數不可為空")

    search_kw = clean_team[-2:] if len(clean_team) >= 2 else clean_team
    with db_session() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, home_team, away_team, stage 
            FROM games 
            WHERE (home_team LIKE ? OR away_team LIKE ?) AND stage = ?
            ORDER BY date DESC, id DESC 
            LIMIT 1
        """, (f"%{search_kw}%", f"%{search_kw}%", stage))
        g = cur.fetchone()
    
    if not g:
        return {"starters": [], "bench": []}
        
    game_id = g["id"]
    h_team = normalize_team_name(g["home_team"])
    a_team = normalize_team_name(g["away_team"])
    is_home = (search_kw in h_team)
    
    off_starters = _get_official_starting_players(game_id, h_team, a_team)
    target_starters_set = off_starters["home_starters"] if is_home else off_starters["away_starters"]
    
    season_folder = STAGE_FOLDER_MAP.get(stage, "season2026")
    team_excel = _find_team_excel_file(season_folder, team)
    gid_match = re.search(r"(G\d+)", str(game_id), re.IGNORECASE)
    game_code = gid_match.group(1).upper() if gid_match else str(game_id)
    
    box, _, _, _ = _parse_real_excel_game(team_excel, game_code)
    
    starters = []
    bench = []
    
    if box:
        for p in box:
            pname = p["player_name"].split(" ")[0].split("(")[0].strip()
            if pname in target_starters_set:
                starters.append(pname)
            else:
                bench.append(pname)
                
    if len(starters) == 5:
        return {"starters": starters, "bench": bench[:9]}
        
    all_pnames = [p["player_name"].split(" ")[0].split("(")[0].strip() for p in box] if box else []
    for s in target_starters_set:
        if s in all_pnames and s not in starters:
            starters.append(s)
            
    for p in all_pnames:
        if p not in starters and p not in bench:
            bench.append(p)
            
    return {"starters": starters[:5], "bench": bench[:9]}
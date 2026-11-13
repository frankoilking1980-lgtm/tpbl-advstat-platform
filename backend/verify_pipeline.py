#!/usr/bin/env python
"""
verify_pipeline.py - TPBL 更新後 100% 資料一致性自動對帳驗證腳本

使用方式:
    cd backend && python verify_pipeline.py
"""
from __future__ import annotations

import json
import math
import re
import sqlite3
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

import openpyxl
from fastapi.testclient import TestClient

# 確保 Windows 終端機正確輸出 UTF-8
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.main import app  # noqa: E402
from app.routes import clean_val_num, normalize_lineup_time, normalize_pct  # noqa: E402

DATA_DIR = BACKEND_DIR / "data"
DB_PATH = DATA_DIR / "tpbl_stats.db"
SEASON_DIR = DATA_DIR / "season2026"
RAW_GAME_STATS_DIR = DATA_DIR / "raw_game_stats"
TARGET_STAGE = "2026-2027 例行賽"

TEAMS_7 = [
    "新北國王",
    "福爾摩沙夢想家",
    "高雄全家海神",
    "新北中信特攻",
    "桃園台啤永豐雲豹",
    "新竹御嵿攻城獅",
    "臺北台新戰神",
]

MMSS_PATTERN = re.compile(r"^\d{2,}:[0-5]\d$")


def _find_team_excel(team_name: str) -> Path | None:
    for p in sorted(SEASON_DIR.glob("*.xlsx")):
        if "tpbl_summary" in p.name or p.name.startswith("~$"):
            continue
        if team_name in p.name:
            return p
    return None


def _clean_player_name(raw: Any) -> str:
    s = str(raw or "").strip()
    return s.split(" ")[0].split("(")[0].strip()


def _parse_excel_players(excel_path: Path) -> Dict[str, Dict[str, float]]:
    """從球隊 Excel 的「平均數據」與「球員進階數據 (Advanced Stats)」萃取指標"""
    wb = openpyxl.load_workbook(excel_path, data_only=True, read_only=True)
    result: Dict[str, Dict[str, float]] = {}
    try:
        adv_lookup: Dict[str, Dict[str, float]] = {}
        if "球員進階數據 (Advanced Stats)" in wb.sheetnames:
            ws_adv = wb["球員進階數據 (Advanced Stats)"]
            for row in ws_adv.iter_rows(min_row=5, values_only=True):
                if len(row) <= 24:
                    continue
                p_name = _clean_player_name(row[2])
                if not p_name or p_name.lower() in {"none", "nan"}:
                    continue
                adv_lookup[p_name] = {
                    "usg_pct": round(normalize_pct(row[21], 0.0, scale_to_100=True), 1),
                    "gmsc": round(clean_val_num(row[24], 0.0), 1),
                }

        if "平均數據" in wb.sheetnames:
            ws_avg = wb["平均數據"]
            for row in ws_avg.iter_rows(min_row=5, values_only=True):
                if len(row) <= 31:
                    continue
                p_name = _clean_player_name(row[1])
                if not p_name or p_name.lower() in {"none", "nan", "全隊", "平均", "球員名稱", "球員名"}:
                    continue
                if any(k in p_name for k in ("總計", "合計", "全隊", "平均")):
                    continue
                adv = adv_lookup.get(p_name, {})
                result[p_name] = {
                    "ppg": round(clean_val_num(row[7], 0.0), 1),
                    "plus_minus": round(clean_val_num(row[29], 0.0), 1),
                    "efg_pct": round(normalize_pct(row[30], 0.0, scale_to_100=True), 1),
                    "ts_pct": round(normalize_pct(row[31], 0.0, scale_to_100=True), 1),
                    "usg_pct": adv.get("usg_pct", 0.0),
                    "gmsc": adv.get("gmsc", 0.0),
                }
    finally:
        wb.close()
    return result


def _parse_excel_onoff_and_times(excel_path: Path) -> Tuple[Dict[str, Dict[str, float]], List[Tuple[str, str, int]]]:
    """萃取 Excel 的【賽季累積主力 On/Off 總榜】與【五人陣容 / 雙洋將】原始時間"""
    wb = openpyxl.load_workbook(excel_path, data_only=True, read_only=True)
    onoff_map: Dict[str, Dict[str, float]] = {}
    expected_times: List[Tuple[str, str, int]] = []
    try:
        if "平均數據" not in wb.sheetnames:
            return onoff_map, expected_times
        ws = wb["平均數據"]
        grid = [list(r) for r in ws.iter_rows(min_row=1, max_row=40, min_col=1, max_col=65, values_only=True)]

        # 1. 尋找 On/Off 區塊
        h_row = h_col = None
        for r_idx, row in enumerate(grid[:12]):
            for c_idx in range(29, min(60, len(row))):
                if str(row[c_idx] or "").strip() == "累計在場時間":
                    h_row, h_col = r_idx, c_idx - 1
                    break
            if h_row is not None:
                break

        if h_row is not None and h_col is not None:
            for row in grid[h_row + 1 :]:
                if len(row) <= h_col + 6:
                    continue
                name = str(row[h_col] or "").strip()
                if not name or name.lower() in ("none", "nan"):
                    continue
                on_net_raw = row[h_col + 4]
                off_net_raw = row[h_col + 5]
                diff_raw = row[h_col + 6]
                if on_net_raw is None and off_net_raw is None and diff_raw is None:
                    continue
                on_ortg = clean_val_num(row[h_col + 2], 0.0)
                on_drtg = clean_val_num(row[h_col + 3], 0.0)
                on_net = clean_val_num(on_net_raw, 0.0)
                off_net = clean_val_num(off_net_raw, 0.0)
                diff = clean_val_num(diff_raw, round(on_net - off_net, 1)) if diff_raw is not None else round(on_net - off_net, 1)
                onoff_map[name] = {
                    "on_ortg": round(on_ortg, 1),
                    "on_drtg": round(on_drtg, 1),
                    "diff_netrtg": round(diff, 1),
                }

        # 2. 五人陣容與雙洋將時間對帳
        for keyword, skip_header in [("最佳五人", "五人陣容組合"), ("雙洋將", "洋將搭檔組合")]:
            r_hdr = c_hdr = None
            for r_idx, row in enumerate(grid[:10]):
                for c_idx in range(34, min(65, len(row))):
                    if keyword in str(row[c_idx] or ""):
                        r_hdr, c_hdr = r_idx, c_idx
                        break
                if r_hdr is not None:
                    break
            if r_hdr is not None and c_hdr is not None:
                sub_cell = str(grid[r_hdr + 1][c_hdr] or "") if r_hdr + 1 < len(grid) else ""
                start_r = r_hdr + 2 if ("陣容" in sub_cell or "搭檔" in sub_cell) else r_hdr + 1
                for row in grid[start_r : start_r + 15]:
                    if len(row) <= c_hdr + 1:
                        continue
                    name_val = str(row[c_hdr] or "").strip()
                    if not name_val or name_val.lower() in ["none", "nan"] or name_val == skip_header:
                        continue
                    t_str, t_sec = normalize_lineup_time(row[c_hdr + 1])
                    expected_times.append((name_val.replace("-", " / "), t_str, t_sec))
    finally:
        wb.close()
    return onoff_map, expected_times


def _scan_dirty_values(obj: Any, path: str, errors: List[str]) -> None:
    if isinstance(obj, float):
        if not math.isfinite(obj):
            errors.append(f"{path}: 非法浮點數 {obj!r}")
    elif isinstance(obj, str):
        if obj.strip().lower() in {"nan", "inf", "-inf", "infinity", "-infinity"}:
            errors.append(f"{path}: 出現髒字串 {obj!r}")
    elif isinstance(obj, dict):
        for k, v in obj.items():
            _scan_dirty_values(v, f"{path}.{k}", errors)
    elif isinstance(obj, list):
        for idx, item in enumerate(obj):
            _scan_dirty_values(item, f"{path}[{idx}]", errors)


def check_a_schedule_completeness() -> Tuple[bool, str]:
    sched_file = SEASON_DIR / "schedule.json"
    if not sched_file.exists():
        return False, f"找不到賽程檔: {sched_file}"
    sched = json.loads(sched_file.read_text(encoding="utf-8"))
    finished_sched = [
        g for g in sched
        if "FINAL" in str(g.get("status", "")).upper()
        or (g.get("home_score") is not None and g.get("away_score") is not None and int(g.get("home_score") or 0) + int(g.get("away_score") or 0) > 0)
    ]
    sched_count = len(finished_sched)

    raw_files = sorted(RAW_GAME_STATS_DIR.glob("game_*_stats.json"))
    raw_count = len(raw_files)

    if not DB_PATH.exists():
        return False, f"找不到資料庫: {DB_PATH}"
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.cursor()
        db_count = cur.execute("SELECT COUNT(*) FROM games WHERE stage = ?", (TARGET_STAGE,)).fetchone()[0]
        dup_count = cur.execute(
            "SELECT COUNT(*) FROM (SELECT id, COUNT(*) c FROM games WHERE stage = ? GROUP BY id HAVING c > 1)",
            (TARGET_STAGE,),
        ).fetchone()[0]
    finally:
        conn.close()

    if sched_count == raw_count == db_count and dup_count == 0:
        return True, f"schedule.json={sched_count} 場 == raw_game_stats={raw_count} 檔 == DB games={db_count} 場 (重複={dup_count})"
    return False, f"場次不一致! schedule.json={sched_count}, raw_game_stats={raw_count}, DB games={db_count}, 重複={dup_count}"


def check_b_player_stats_match(client: TestClient) -> Tuple[bool, str]:
    r = client.get("/api/players/advanced", params={"stage": TARGET_STAGE})
    if r.status_code != 200:
        return False, f"/api/players/advanced 回傳 HTTP {r.status_code}"
    api_players = r.json()
    api_by_team: Dict[str, Dict[str, dict]] = {}
    for p in api_players:
        api_by_team.setdefault(p["team_name"], {})[p["player_name"]] = p

    checked_count = 0
    mismatches: List[str] = []

    for team in TEAMS_7:
        xl = _find_team_excel(team)
        if not xl:
            mismatches.append(f"{team}: 找不到 Excel 檔案")
            continue
        excel_players = _parse_excel_players(xl)
        team_api = api_by_team.get(team, {})
        if not team_api:
            mismatches.append(f"{team}: API 未回傳任何球員")
            continue

        # 每隊全數比對有上場的球員（必含新北國王、福爾摩沙夢想家）
        for p_name, ex in excel_players.items():
            ap = team_api.get(p_name)
            if not ap:
                mismatches.append(f"{team} - {p_name}: 存在於 Excel 但 API 缺失")
                continue
            checked_count += 1
            for field in ("ppg", "ts_pct", "efg_pct", "usg_pct", "gmsc", "plus_minus"):
                ex_val = round(float(ex[field]), 1)
                ap_val = round(float(ap.get(field) or 0.0), 1)
                if ex_val != ap_val:
                    mismatches.append(f"{team} - {p_name}.{field}: Excel={ex_val} != API={ap_val}")

    if mismatches:
        preview = "; ".join(mismatches[:8])
        return False, f"發現 {len(mismatches)} 筆差異 (前幾筆: {preview})"
    return True, f"全部 7 隊（含新北國王、福爾摩沙夢想家）共 {checked_count} 位球員 6 項核心指標 100% 吻合 Excel"


def check_c_pbp_wowy_and_time(client: TestClient) -> Tuple[bool, str]:
    errors: List[str] = []
    onoff_checked = 0
    time_checked = 0

    for team in TEAMS_7:
        xl = _find_team_excel(team)
        if not xl:
            errors.append(f"{team}: 找不到 Excel")
            continue
        ex_onoff, ex_times = _parse_excel_onoff_and_times(xl)

        r = client.get(f"/api/teams/{team}/pbp", params={"stage": TARGET_STAGE})
        if r.status_code != 200:
            errors.append(f"{team}: /pbp HTTP {r.status_code}")
            continue
        data = r.json()

        # 比對 On/Off 數據
        api_onoff = {row["player_name"]: row for row in data.get("on_off_players", [])}
        for p_name, ex in ex_onoff.items():
            ap = api_onoff.get(p_name)
            if not ap:
                errors.append(f"{team} On/Off 缺少球員: {p_name}")
                continue
            onoff_checked += 1
            for field in ("on_ortg", "on_drtg", "diff_netrtg"):
                if round(float(ap.get(field) or 0.0), 1) != ex[field]:
                    errors.append(f"{team} On/Off {p_name}.{field}: Excel={ex[field]} != API={ap.get(field)}")

        # 驗證五人陣容與雙洋將時間格式與總秒數
        api_time_items = data.get("five_man_lineups", []) + data.get("foreign_duos", [])
        api_time_map = {item["name"]: item for item in api_time_items}
        for item in api_time_items:
            t_str = str(item.get("total_time", ""))
            t_sec = item.get("total_seconds")
            time_checked += 1
            if not MMSS_PATTERN.match(t_str):
                errors.append(f"{team} {item.get('name')}: 非法時間格式 {t_str!r}")
            if not isinstance(t_sec, int) or t_sec < 0:
                errors.append(f"{team} {item.get('name')}: 非法 total_seconds={t_sec!r}")
            elif f"{t_sec // 60:02d}:{t_sec % 60:02d}" != t_str:
                errors.append(f"{team} {item.get('name')}: total_time={t_str} 與 total_seconds={t_sec} 不符")

        for name_val, ex_str, ex_sec in ex_times:
            ap = api_time_map.get(name_val)
            if not ap:
                errors.append(f"{team} 陣容/搭檔缺失: {name_val}")
            elif ap.get("total_time") != ex_str or ap.get("total_seconds") != ex_sec:
                errors.append(f"{team} {name_val}: Excel=({ex_str}, {ex_sec}s) != API=({ap.get('total_time')}, {ap.get('total_seconds')}s)")

    if errors:
        return False, f"發現 {len(errors)} 筆錯誤: {'; '.join(errors[:6])}"
    return True, f"7 隊共 {onoff_checked} 筆 On/Off 與 {time_checked} 組陣容/雙洋將 MM:SS 時間格式及秒數 100% 正確"


def check_d_dirty_data_and_footer(client: TestClient) -> Tuple[bool, str]:
    dirty_errors: List[str] = []

    endpoints: List[Tuple[str, dict]] = [
        ("/api/stages", {}),
        ("/api/teams/summary", {"stage": TARGET_STAGE}),
        ("/api/players/advanced", {"stage": TARGET_STAGE}),
        ("/api/games", {"stage": TARGET_STAGE}),
    ]
    for team in TEAMS_7:
        endpoints.append((f"/api/teams/{team}/pbp", {"stage": TARGET_STAGE}))

    stages_data = None
    for path, params in endpoints:
        r = client.get(path, params=params)
        if r.status_code != 200:
            dirty_errors.append(f"{path} 回傳 HTTP {r.status_code}")
            continue
        payload = r.json()
        if path == "/api/stages":
            stages_data = payload
        _scan_dirty_values(payload, path, dirty_errors)

    # 驗證 Footer 使用的最新比賽日期與場次
    sched = json.loads((SEASON_DIR / "schedule.json").read_text(encoding="utf-8"))
    latest_sched_date = max(str(g.get("date", "")).replace(".", "-") for g in sched if g.get("date"))
    sched_count = len(sched)

    footer_ok = False
    footer_msg = ""
    if isinstance(stages_data, list):
        default_stage = next((s for s in stages_data if s.get("id") == TARGET_STAGE), None)
        if default_stage:
            api_date = default_stage.get("last_updated")
            api_global_date = default_stage.get("global_last_updated")
            api_count = default_stage.get("game_count")
            if api_date == latest_sched_date and api_global_date == latest_sched_date and api_count == sched_count:
                footer_ok = True
                footer_msg = f"Footer 日期={api_global_date}, 場次={api_count}"
            else:
                dirty_errors.append(
                    f"Footer 不一致: API(date={api_date}, global={api_global_date}, count={api_count}) != Schedule({latest_sched_date}, {sched_count})"
                )
        else:
            dirty_errors.append(f"/api/stages 缺少預設階段 {TARGET_STAGE}")

    if dirty_errors or not footer_ok:
        return False, f"發現異常: {'; '.join(dirty_errors[:6])}"
    return True, f"全站 {len(endpoints)} 個 API 端點無 NaN/Infinity 髒資料，{footer_msg} 正確"


def main() -> int:
    print("=" * 72)
    print(f"🔍 TPBL 資料管線一致性自動稽核 ({TARGET_STAGE})")
    print("=" * 72)

    client = TestClient(app)
    checks = [
        ("檢查項目 A（賽程與比賽場次完整性）", lambda: check_a_schedule_completeness()),
        ("檢查項目 B（球員基礎與進階數據 100% 吻合 Excel）", lambda: check_b_player_stats_match(client)),
        ("檢查項目 C（WOWY On/Off 與陣容時間單位防呆）", lambda: check_c_pbp_wowy_and_time(client)),
        ("檢查項目 D（無髒資料、NaN 與 Footer 日期場次檢查）", lambda: check_d_dirty_data_and_footer(client)),
    ]

    all_passed = True
    for title, fn in checks:
        ok, detail = fn()
        tag = "[PASS]" if ok else "[FAIL]"
        print(f"{tag} {title}")
        print(f"       -> {detail}")
        if not ok:
            all_passed = False

    print("=" * 72)
    if all_passed:
        print("✅ 所有數據 100% 驗證通過，可安全執行 git push 部署")
        return 0
    print("❌ 稽核未通過，請修正上述差異後再行部署")
    return 1


if __name__ == "__main__":
    sys.exit(main())

"""
TPBL 官方 Box Score 與逐球文字直播 (Broadcasts) 彈性抓取腳本
用法範例：
  1. 抓單場: python backend/fetch_tpbl_boxscores.py 27555 -g 14
  2. 連續抓多場並跳過已存在檔案: python backend/fetch_tpbl_boxscores.py 27542 -g 1 -c 14 --skip-existing
"""

import argparse
from datetime import datetime
import json
import re
import time
from pathlib import Path
import requests

CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
RAW_DIR = CURRENT_DIR / "data" / "raw_game_stats"
RAW_DIR.mkdir(parents=True, exist_ok=True)
SEASON2026_DIR = CURRENT_DIR / "data" / "season2026"
ROOT_SEASON2026_DIR = PROJECT_ROOT / "data" / "season2026"


def _fetch_json_with_retry(url: str, headers: dict, retries: int = 3):
    for _ in range(retries):
        try:
            resp = requests.get(url, headers=headers, timeout=12)
            if resp.status_code == 200:
                return resp.json(), 200
            if resp.status_code == 404:
                return None, 404
            time.sleep(0.5)
        except Exception:
            time.sleep(0.8)
    return None, 0


def _extract_team_score(side_data: dict) -> int:
    """從 raw stats JSON 擷取球隊總得分，若 teams.total.won_score 為 0 則加總球員得分。"""
    if not isinstance(side_data, dict):
        return 0
    total_score = (side_data.get("teams") or {}).get("total", {}).get("won_score")
    if total_score is not None:
        try:
            val = int(round(float(total_score)))
            if val > 0:
                return val
        except (TypeError, ValueError):
            pass
    players_total = (side_data.get("players") or {}).get("total") or {}
    return int(
        round(
            sum(
                float(p.get("score") or 0)
                for p in players_total.values()
                if isinstance(p, dict)
            )
        )
    )


def _load_upcoming_map() -> dict[int, dict]:
    """讀取 season2026/upcoming_schedule.json，建立 official_id -> 賽程中繼資料對照表。"""
    mapping: dict[int, dict] = {}
    for cand in (
        SEASON2026_DIR / "upcoming_schedule.json",
        ROOT_SEASON2026_DIR / "upcoming_schedule.json",
    ):
        if cand.exists():
            try:
                items = json.loads(cand.read_text(encoding="utf-8"))
                if isinstance(items, list):
                    for it in items:
                        oid = it.get("official_id")
                        if oid is not None:
                            mapping[int(oid)] = it
                    break
            except Exception:
                pass
    return mapping


def _upsert_season2026_schedule(
    schedule_id: int,
    fallback_g_num: int,
    stats_data: dict,
    bcast_data: dict | None,
    upcoming_map: dict[int, dict],
) -> str:
    """
    從 raw JSON 與 upcoming_schedule.json 擷取隊伍、日期、比分與場次編號 (Gxx)，
    並同步寫入 season2026/schedule.json（若有根目錄 data/season2026 亦同步更新）。
    """
    home_team = str((stats_data.get("home_team") or {}).get("name") or "").strip()
    away_team = str((stats_data.get("away_team") or {}).get("name") or "").strip()
    if not home_team or not away_team:
        return f"G{fallback_g_num:02d}"

    home_score = _extract_team_score(stats_data.get("home_team") or {})
    away_score = _extract_team_score(stats_data.get("away_team") or {})
    if home_score == 0 and away_score == 0:
        return f"G{fallback_g_num:02d}"

    rounds_cnt = len((bcast_data or {}).get("rounds") or [])
    if rounds_cnt == 5:
        status = "FINAL (OT)"
    elif rounds_cnt > 5:
        status = f"FINAL ({rounds_cnt - 4}OT)"
    else:
        status = "FINAL"

    up_info = upcoming_map.get(schedule_id, {})
    gdate = str(up_info.get("date") or datetime.now().strftime("%Y-%m-%d"))[:10].replace("-", ".")
    gtime = str(up_info.get("time") or "17:00")

    target_files = [SEASON2026_DIR / "schedule.json"]
    if ROOT_SEASON2026_DIR.exists():
        target_files.append(ROOT_SEASON2026_DIR / "schedule.json")

    resolved_gid = str(up_info.get("game_id") or "").strip().upper()

    for sched_path in target_files:
        sched_path.parent.mkdir(parents=True, exist_ok=True)
        items: list[dict] = []
        if sched_path.exists():
            try:
                loaded = json.loads(sched_path.read_text(encoding="utf-8"))
                if isinstance(loaded, list):
                    items = loaded
            except Exception:
                items = []

        # 尋找是否已存在相同 schedule_id 或相同日期+對戰組合
        existing_idx = None
        max_g_num = 0
        for idx, it in enumerate(items):
            gm = re.search(r"G(\d+)", str(it.get("game_id", "")), re.IGNORECASE)
            if gm:
                max_g_num = max(max_g_num, int(gm.group(1)))
            it_sid = it.get("schedule_id")
            if it_sid is not None and int(it_sid) == schedule_id:
                existing_idx = idx
                if not resolved_gid and it.get("game_id"):
                    resolved_gid = str(it["game_id"]).upper()
                break
            if (
                str(it.get("date", ""))[:10].replace("-", ".") == gdate
                and str(it.get("home_team", "")) == home_team
                and str(it.get("away_team", "")) == away_team
            ):
                existing_idx = idx
                if not resolved_gid and it.get("game_id"):
                    resolved_gid = str(it["game_id"]).upper()
                break

        if not resolved_gid:
            # 若未從 upcoming_schedule 取得 Gxx，依當季已有場次順序自動遞補（或採用不重複的 fallback_g_num）
            used_gids = {str(it.get("game_id", "")).upper() for it in items}
            cand_gid = f"G{fallback_g_num:02d}"
            if fallback_g_num > max_g_num and cand_gid not in used_gids:
                resolved_gid = cand_gid
            else:
                resolved_gid = f"G{max_g_num + 1:02d}"

        entry = {
            "game_id": resolved_gid,
            "schedule_id": schedule_id,
            "date": gdate,
            "time": gtime,
            "away_team": away_team,
            "away_score": away_score,
            "home_team": home_team,
            "home_score": home_score,
            "sheet_name": f"{gdate} {resolved_gid} {away_team} vs {home_team}",
            "status": status,
        }

        if existing_idx is not None:
            items[existing_idx].update(entry)
        else:
            items.append(entry)

        def _sort_key(x: dict) -> tuple:
            m = re.search(r"G(\d+)", str(x.get("game_id", "")), re.IGNORECASE)
            return (0, int(m.group(1))) if m else (1, str(x.get("date", "")))

        items.sort(key=_sort_key)
        sched_path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")

    return resolved_gid


def fetch_box_scores(start_id: int, start_g_num: int, count: int, skip_existing: bool = False):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://tpbl.basketball",
        "Referer": "https://tpbl.basketball/",
    }
    upcoming_map = _load_upcoming_map()

    print(f"🚀 開始透過 TPBL 官方 API 抓取 {count} 場比賽數據 (Stats + Broadcasts)...")
    print(f"📌 起始官網 ID: {start_id} | 起始場次: G{start_g_num:02d} | 跳過已存在: {skip_existing}")
    print(f"📁 存檔目錄: {RAW_DIR}")
    print("-" * 60)

    for i in range(count):
        schedule_id = start_id + i
        g_num = start_g_num + i
        gid_str = f"G{g_num:02d}"

        stats_file = RAW_DIR / f"game_{schedule_id}_stats.json"
        bcast_file = RAW_DIR / f"game_{schedule_id}_broadcasts.json"

        # 1. 抓取 Stats
        stats_data = None
        if skip_existing and stats_file.exists() and stats_file.stat().st_size > 500:
            try:
                stats_data = json.loads(stats_file.read_text(encoding="utf-8"))
                stats_status = "cached"
            except Exception:
                stats_data = None
                stats_status = "error"
        else:
            stats_url = f"https://api.tpbl.basketball/api/games/{schedule_id}/stats"
            data, code = _fetch_json_with_retry(stats_url, headers)
            if (
                code == 200
                and isinstance(data, dict)
                and data.get("home_team", {}).get("name")
                and data.get("away_team", {}).get("name")
            ):
                stats_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
                stats_data = data
                stats_status = "downloaded"
            elif code == 404:
                stats_status = "404"
            else:
                stats_status = "empty/fail"

        if stats_status in ("404", "empty/fail"):
            print(f"[{i+1:02d}/{count:02d}] ⚠️ {gid_str} (ID {schedule_id}) Stats {stats_status}，略過")
            time.sleep(0.2)
            continue

        # 2. 抓取 Broadcasts (Play-by-Play)
        bcast_data = None
        if skip_existing and bcast_file.exists() and bcast_file.stat().st_size > 500:
            try:
                bcast_data = json.loads(bcast_file.read_text(encoding="utf-8"))
            except Exception:
                bcast_data = None
            bcast_status = "cached"
        else:
            bcast_url = f"https://api.tpbl.basketball/api/games/{schedule_id}/broadcasts"
            bdata, bcode = _fetch_json_with_retry(bcast_url, headers)
            if bcode == 200 and isinstance(bdata, dict) and len(bdata.get("rounds", [])) > 0:
                bcast_file.write_text(json.dumps(bdata, ensure_ascii=False, indent=2), encoding="utf-8")
                bcast_data = bdata
                bcast_status = f"downloaded ({len(bdata.get('rounds', []))}Q)"
            elif bcode == 404:
                bcast_status = "404"
            else:
                bcast_status = "empty/fail"

        synced_gid = gid_str
        if isinstance(stats_data, dict):
            synced_gid = _upsert_season2026_schedule(
                schedule_id=schedule_id,
                fallback_g_num=g_num,
                stats_data=stats_data,
                bcast_data=bcast_data,
                upcoming_map=upcoming_map,
            )

        home_name = (stats_data or {}).get("home_team", {}).get("name", "主隊")
        away_name = (stats_data or {}).get("away_team", {}).get("name", "客隊")
        print(
            f"[{i+1:02d}/{count:02d}] ✅ {synced_gid} (ID {schedule_id}): {away_name} vs {home_name} "
            f"| Stats: {stats_status} | Broadcasts: {bcast_status}"
        )
        if stats_status == "downloaded" or bcast_status.startswith("downloaded"):
            time.sleep(0.3)

    print("-" * 60)
    print("🎉 全部場次抓取與存檔完成！")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TPBL 官方 Box Score 與 Broadcasts 彈性抓取腳本")
    parser.add_argument("start_id", type=int, help="起始比賽的官網 Schedule ID (例如: 27542)")
    parser.add_argument("-g", "--g_num", type=int, default=1, help="對應的比賽編號 Gxx (預設為 1，即 G01)")
    parser.add_argument("-c", "--count", type=int, default=1, help="要連續抓取的場數 (預設為 1 場)")
    parser.add_argument("--skip-existing", action="store_true", help="跳過已存在的 stats / broadcasts 檔案")

    args = parser.parse_args()
    fetch_box_scores(args.start_id, args.g_num, args.count, skip_existing=args.skip_existing)

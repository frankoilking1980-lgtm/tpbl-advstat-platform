"""
TPBL 官方 Box Score 與逐球文字直播 (Broadcasts) 彈性抓取腳本
用法範例：
  1. 抓單場: python backend/fetch_tpbl_boxscores.py 27555 -g 14
  2. 連續抓多場並跳過已存在檔案: python backend/fetch_tpbl_boxscores.py 27542 -g 1 -c 14 --skip-existing
"""

import argparse
import json
import time
from pathlib import Path
import requests

CURRENT_DIR = Path(__file__).resolve().parent
RAW_DIR = CURRENT_DIR / "data" / "raw_game_stats"
RAW_DIR.mkdir(parents=True, exist_ok=True)


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


def fetch_box_scores(start_id: int, start_g_num: int, count: int, skip_existing: bool = False):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://tpbl.basketball",
        "Referer": "https://tpbl.basketball/",
    }

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
        if skip_existing and bcast_file.exists() and bcast_file.stat().st_size > 500:
            bcast_status = "cached"
        else:
            bcast_url = f"https://api.tpbl.basketball/api/games/{schedule_id}/broadcasts"
            bdata, bcode = _fetch_json_with_retry(bcast_url, headers)
            if bcode == 200 and isinstance(bdata, dict) and len(bdata.get("rounds", [])) > 0:
                bcast_file.write_text(json.dumps(bdata, ensure_ascii=False, indent=2), encoding="utf-8")
                bcast_status = f"downloaded ({len(bdata.get('rounds', []))}Q)"
            elif bcode == 404:
                bcast_status = "404"
            else:
                bcast_status = "empty/fail"

        home_name = (stats_data or {}).get("home_team", {}).get("name", "主隊")
        away_name = (stats_data or {}).get("away_team", {}).get("name", "客隊")
        print(
            f"[{i+1:02d}/{count:02d}] ✅ ID {schedule_id}: {away_name} vs {home_name} "
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

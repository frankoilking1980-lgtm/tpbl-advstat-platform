import argparse
import json
import time
from pathlib import Path
import requests

CURRENT_DIR = Path(__file__).resolve().parent
RAW_DIR = CURRENT_DIR / "data" / "raw_game_stats"
RAW_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML,"
        " like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://tpbl.basketball/",
    "Accept": "application/json, text/plain, */*",
}


def fetch_single_game(gid, force=False):
  """抓取單場比賽並快取至 local JSON"""
  file_path = RAW_DIR / f"game_{gid}_stats.json"

  if not force and file_path.exists() and file_path.stat().st_size > 500:
    print(f"[{gid}] ⏩ 已存在快取，略過 (使用 --force 可強制重新抓取)")
    return "cached"

  url = f"https://api.tpbl.basketball/api/games/{gid}/stats"
  try:
    resp = requests.get(url, headers=HEADERS, timeout=6)
    if resp.status_code == 200:
      data = resp.json()

      # 若為空陣列或非字典格式，代表未開賽或無資料
      if not isinstance(data, dict):
        print(f"[{gid}] ⚠️ 官方回傳空資料（賽事未開打或已取消），略過")
        return "empty"

      home_team = data.get("home_team", {})
      away_team = data.get("away_team", {})

      if home_team.get("name") and away_team.get("name"):
        h_name = home_team.get("name")
        a_name = away_team.get("name")
        h_score = (
            home_team.get("teams", {}).get("total", {}).get("won_score", 0)
        )
        a_score = (
            away_team.get("teams", {}).get("total", {}).get("won_score", 0)
        )

        with open(file_path, "w", encoding="utf-8") as f:
          json.dump(data, f, ensure_ascii=False, indent=2)

        print(
            f"[{gid}] ✅ 成功下載: {a_name} ({a_score}) vs {h_name} ({h_score})"
        )
        time.sleep(0.4)
        return "downloaded"
      else:
        print(f"[{gid}] ⚠️ 資料不完整，略過")
        return "incomplete"
    elif resp.status_code == 404:
      return "404"
    else:
      print(f"[{gid}] 狀態碼 {resp.status_code}")
      return "error"
  except Exception as e:
    print(f"[{gid}] ❌ 請求異常: {e}")
    return "error"


def main():
  parser = argparse.ArgumentParser(
      description="TPBL Game Stats Fetcher (Phase 2)"
  )
  parser.add_argument("--game", type=int, help="指定單一 Game ID (例如: 27551)")
  parser.add_argument(
      "--games", type=str, help="指定多個 Game ID，以逗號分隔 (例如: 27549,27551)"
  )
  parser.add_argument(
      "--start", type=int, default=27540, help="探測起始 Game ID (預設: 27540)"
  )
  parser.add_argument(
      "--end", type=int, default=27600, help="探測結束 Game ID (預設: 27600)"
  )
  parser.add_argument(
      "--force", action="store_true", help="強制重新下載並覆蓋現有快取"
  )

  args = parser.parse_args()

  # 決定要抓取的 Game ID 清單
  target_ids = []
  if args.game:
    target_ids = [args.game]
  elif args.games:
    target_ids = [int(x.strip()) for x in args.games.split(",") if x.strip()]
  else:
    target_ids = list(range(args.start, args.end + 1))

  print(f"📡 準備抓取 {len(target_ids)} 個 Game ID 目標 (force={args.force}) ...\n")

  downloaded, cached = 0, 0
  consecutive_empty = 0

  for gid in target_ids:
    res = fetch_single_game(gid, force=args.force)
    if res == "downloaded":
      downloaded += 1
      consecutive_empty = 0
    elif res == "cached":
      cached += 1
      consecutive_empty = 0
    elif res in ("empty", "404"):
      consecutive_empty += 1
      # 如果是全區間掃描，連續 10 場空賽事且已超過 27552 則自動結束
      if (
          not args.game
          and not args.games
          and consecutive_empty >= 10
          and gid > 27552
      ):
        print(f"\n🛑 連續 {consecutive_empty} 場無資料，已達到當前賽程邊界。")
        break

  print(f"\n🎉 執行完畢！新下載: {downloaded} 場 | 本地快取: {cached} 場")


if __name__ == "__main__":
  main()
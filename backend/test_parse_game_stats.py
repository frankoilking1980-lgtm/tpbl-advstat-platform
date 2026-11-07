import requests
import json
from pathlib import Path

GAME_ID = "27551"
URL = f"https://api.tpbl.basketball/api/games/{GAME_ID}/stats"

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://tpbl.basketball/",
    "Accept": "application/json, text/plain, */*",
}

def fetch_and_inspect():
    print(f"📡 正在請求: {URL}")
    resp = requests.get(URL, headers=headers, timeout=10)
    if resp.status_code != 200:
        print(f"❌ 請求失敗，狀態碼: {resp.status_code}")
        return

    data = resp.json()
    
    # 儲存一份乾淨的 JSON 供後續對照
    output_path = Path("data/raw_game_27551_stats.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"✅ 成功儲存完整 JSON 至: {output_path}")

    # 解析結構並印出球員的所有欄位
    away_team = data.get("away_team", {})
    team_name = away_team.get("name")
    rounds = away_team.get("players", {}).get("rounds", {})
    
    round1 = rounds.get("1", {})
    if not round1:
        print("未找到 Round 1 球員數據")
        return

    # 取第一位球員
    first_player_roster_id = list(round1.keys())[0]
    first_player_stats = round1[first_player_roster_id]

    print(f"\n🏀 範例球隊: {team_name} | Roster ID: {first_player_roster_id}")
    print(f"📊 該球員包含的統計指標總數: {len(first_player_stats.keys())}")
    print("--------------------------------------------------")
    for k, v in sorted(first_player_stats.items()):
        print(f"  {k}: {v}")
    print("--------------------------------------------------")

if __name__ == "__main__":
    fetch_and_inspect()
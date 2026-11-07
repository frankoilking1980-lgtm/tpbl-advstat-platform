import json
from pathlib import Path

raw_dir = Path("data/raw_game_stats")
files = sorted(list(raw_dir.glob("game_*_stats.json")))

print("🔍 檢查本地快取中克雷格的逐場記錄：\n")

total_pts = 0
total_3pm = 0
total_3pa = 0

for f in files:
    with open(f, "r", encoding="utf-8") as fp:
        try:
            data = json.load(fp)
        except:
            continue
    
    if not isinstance(data, dict):
        continue

    gid = f.stem.replace("game_", "").replace("_stats", "")
    
    # 搜尋克雷格
    for side in ["home_team", "away_team"]:
        tname = data.get(side, {}).get("name", "")
        totals = data.get(side, {}).get("players", {}).get("total", {})
        
        for pid, p in totals.items():
            if not isinstance(p, dict):
                continue
            name = (p.get("name") or "").strip()
            
            # 比對克雷格
            if "克雷格" in name or "Craig" in name:
                pts = p.get("score", 0)
                m3 = p.get("three_pointers_made", 0)
                a3 = p.get("three_pointers_attempted", 0)
                m2 = p.get("two_pointers_made", 0)
                a2 = p.get("two_pointers_attempted", 0)
                js3_m = p.get("three_pointers_jump_shot_made", 0)
                js3_a = p.get("three_pointers_jump_shot_attempted", 0)
                
                print(f"📄 比賽 Game {gid} | 球隊: {tname} | 姓名欄位: '{name}'")
                print(f"   得分: {pts} | 兩分: {m2}/{a2} | 三分: {m3}/{a3}")
                print(f"   JSON原生三分跳投: {js3_m}/{js3_a}")
                print(f"   Round節次數據存在: {'rounds' in data.get(side, {}).get('players', {})}")
                print("-" * 55)
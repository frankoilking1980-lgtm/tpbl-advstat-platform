import json
from pathlib import Path

json_path = Path("data/player_situations_stats.json")
with open(json_path, "r", encoding="utf-8") as f:
    data = json.load(f)

print(f"📊 賽季: {data['meta']['season']} | 總場次: {data['meta']['total_games']}\n")

sample_names = ["阿巴西", "林庭謙", "賀丹", "貝西里", "林書緯"]

for name in sample_names:
    p = data["players"].get(name)
    if not p:
        continue
    sit = p["scoring_situations"]
    q4 = p["q4_crunch_time"]
    fin = p["finishing_breakdown"]
    
    print(f"🏀 【{name}】 ({p['team']} #{p['number']})")
    print(f"   出賽: {p['games_played']} 場 | 場均得分: {p['ppg']} 分 | 出賽時間: {p['mpg']} 分鐘")
    print(f"   得分情境: 快攻 {sit['fast_break']['ppg']}分({sit['fast_break']['share_pct']}%) | 禁區 {sit['points_in_paint']['ppg']}分({sit['points_in_paint']['share_pct']}%) | 二次進攻 {sit['second_chance']['ppg']}分")
    print(f"   終結把握: 跳投 {fin['jump_shot']['fgm']}/{fin['jump_shot']['fga']} ({fin['jump_shot']['fg_pct']}%) | 上籃 {fin['layup']['fgm']}/{fin['layup']['fga']} ({fin['layup']['fg_pct']}%) | 單打自創 {fin['self_created']['fgm']}/{fin['self_created']['fga']} ({fin['self_created']['fg_pct']}%)")
    print(f"   第 4 節表現: 場均 {q4['q4_ppg']} 分 | TS% {q4['q4_ts_pct']}% | 場均正負值 {q4['q4_plus_minus_pg']} | 場均失誤 {q4['q4_tov_pg']}")
    print("-" * 65)
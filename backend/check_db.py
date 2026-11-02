import sqlite3

conn = sqlite3.connect('data/tpbl_stats.db')
c = conn.cursor()

print("🏀 【當季 games 表賽程核對】")
c.execute("SELECT id, date, home_team, away_team, home_score, away_score FROM games WHERE stage = '2026-2027 例行賽' ORDER BY id")
rows = c.fetchall()
for r in rows:
    print(f"  {r[0]} | 日期: {r[1]} | 主隊: {r[2]} ({r[4]}) vs 客隊: {r[3]} ({r[5]})")

print(f"\n📊 當季賽程總場數: {len(rows)} 場")

c.execute("SELECT COUNT(*) FROM game_matchups WHERE stage = '2026-2027 例行賽'")
print(f"⚔️ 當季戰術對位總筆數: {c.fetchone()[0]} 筆")

c.execute("SELECT DISTINCT team_name FROM player_stats WHERE season_stage = '2026-2027 例行賽'")
teams = [r[0] for r in c.fetchall()]
print(f"👥 當季已匯入球員名單的球隊 ({len(teams)} 隊): {teams}")

conn.close()
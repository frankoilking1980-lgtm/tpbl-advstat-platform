import sqlite3
from pathlib import Path

DB_PATH = Path("data/tpbl_stats.db")

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# 1. 檢視 games 欄位名稱
cursor.execute("PRAGMA table_info(games);")
cols = [r[1] for r in cursor.fetchall()]
print(f"📋 games 資料表所有欄位: {cols}\n")

# 2. 抽查 2026-2027 例行賽已完賽的資料
cursor.execute("""
    SELECT * FROM games 
    WHERE stage LIKE '%2026%例行賽%' AND home_score > 0 
    LIMIT 5
""")
rows = cursor.fetchall()

print(f"🏀 找到 {len(rows)} 筆範例：")
for r in rows:
    print(r)

conn.close()
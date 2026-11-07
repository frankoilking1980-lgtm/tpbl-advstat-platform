Set-Content check_db.py -Value @"
import sqlite3
conn = sqlite3.connect('backend/data/tpbl_stats.db')
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cursor.fetchall()]
print('【資料庫所有資料表】:', tables)

# 查看各表的欄位
for t in tables:
    cursor.execute(f"PRAGMA table_info({t})")
    cols = [c[1] for c in cursor.fetchall()]
    print(f'\n表 [{t}] 欄位:', cols)
"@
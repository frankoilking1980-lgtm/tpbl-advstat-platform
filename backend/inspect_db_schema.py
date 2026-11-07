import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "data" / "tpbl_stats.db"

def inspect():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 1. 查看資料庫裡有哪些 tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [r[0] for r in cursor.fetchall()]
    print(f"📁 資料庫現有資料表: {tables}\n")

    # 2. 檢查是否有 pbp、events、shot_chart 或 detailed_stats 相關資料表
    target_tables = [t for t in tables if any(k in t.lower() for k in ['pbp', 'event', 'shot', 'detail', 'game'])]
    for tbl in target_tables:
        cursor.execute(f"PRAGMA table_info({tbl});")
        cols = [c[1] for c in cursor.fetchall()]
        cursor.execute(f"SELECT COUNT(*) FROM {tbl};")
        cnt = cursor.fetchone()[0]
        print(f"📊 表名: {tbl} (共 {cnt} 筆資料)")
        print(f"   欄位清單: {cols[:15]} ... (共 {len(cols)} 個欄位)\n")

    conn.close()

if __name__ == "__main__":
    inspect()
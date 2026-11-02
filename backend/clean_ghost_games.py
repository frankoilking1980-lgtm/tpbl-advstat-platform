import sqlite3
import json
from pathlib import Path
import openpyxl
import glob

DB_PATH = Path("data/tpbl_stats.db")
SCHED_PATH = Path("schedule.json")

def clean_database():
    if not DB_PATH.exists():
        print(f"[-] 找不到資料庫檔案: {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # 1. 取得資料庫中所有的 table 名稱
    c.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [row[0] for row in c.fetchall()]

    # 2. 先處理主表 games
    if "games" in tables:
        c.execute("PRAGMA table_info(games)")
        cols = [r[1] for r in c.fetchall()]
        
        # 組合 games 表的刪除條件
        conds = []
        if "game_id" in cols:
            conds.append("game_id LIKE '%27550%' OR game_id LIKE '%27551%'")
        if "away_team" in cols:
            conds.append("away_team IN ('國王', '海神')")
        if "home_score" in cols and "away_score" in cols:
            conds.append("(home_score = 0 AND away_score = 0)")

        if conds:
            sql = f"DELETE FROM games WHERE {' OR '.join(conds)}"
            c.execute(sql)
            print(f"✓ games 表清理完成，共刪除 {c.rowcount} 筆幽靈比賽記錄。")

    # 3. 處理其他相關關聯表（依存在的欄位動態清理）
    for tbl in tables:
        if tbl in ["games", "sqlite_sequence"]:
            continue
        c.execute(f"PRAGMA table_info({tbl})")
        tbl_cols = [r[1] for r in c.fetchall()]

        t_conds = []
        if "game_id" in tbl_cols:
            t_conds.append("game_id LIKE '%27550%' OR game_id LIKE '%27551%'")
        if "sheet_name" in tbl_cols:
            t_conds.append("sheet_name LIKE '%27550%' OR sheet_name LIKE '%27551%'")
        if "match_title" in tbl_cols:
            t_conds.append("match_title LIKE '%27550%' OR match_title LIKE '%27551%'")

        if t_conds:
            try:
                c.execute(f"DELETE FROM {tbl} WHERE {' OR '.join(t_conds)}")
                print(f"✓ {tbl} 表清理完成，刪除 {c.rowcount} 筆相關記錄。")
            except Exception as e:
                pass

    conn.commit()
    conn.close()

def clean_schedule_json():
    if not SCHED_PATH.exists():
        return

    try:
        with open(SCHED_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)

        original_len = len(data)
        cleaned_data = [
            item for item in data
            if not any(k in str(item.get("game_id", "")) for k in ["27550", "27551"])
            and not (item.get("away_team") in ["國王", "海神"] and item.get("home_score", 0) == 0)
        ]

        with open(SCHED_PATH, "w", encoding="utf-8") as f:
            json.dump(cleaned_data, f, ensure_ascii=False, indent=2)

        print(f"✓ schedule.json 清理完成：移除了 {original_len - len(cleaned_data)} 筆錯誤排程。")
    except Exception as e:
        print(f"[-] schedule.json 清理略過: {e}")

def clean_excel_sheets():
    for f in glob.glob("*.xlsx"):
        try:
            wb = openpyxl.load_workbook(f)
            dirty_sheets = [s for s in wb.sheetnames if "27550" in s or "27551" in s]
            if dirty_sheets:
                for s in dirty_sheets:
                    del wb[s]
                wb.save(f)
                print(f"✓ Excel 已移除工作表: {f} -> {dirty_sheets}")
        except Exception:
            pass

if __name__ == "__main__":
    print("=" * 55)
    print("🧹 開始清理 TPBL 錯誤幽靈資料 (安全動態欄位模式)...")
    print("=" * 55)
    clean_database()
    clean_schedule_json()
    clean_excel_sheets()
    print("\n🎉 清理作業執行完成！")
import sqlite3
import pandas as pd
from pathlib import Path

# 設定參數
EXCEL_PATH = Path("data/season2026/高雄全家海神.xlsx")
SHEET_NAME = "2026-11-01 vs 中信特攻 (G10)"  # 對應工作表名稱
STAGE = "2026-2027 例行賽"
GAME_CODE = "G10"
TEAM_NAME = "高雄全家海神"

# 1. 讀取 Excel 中的對位情境與說明
df = pd.read_excel(EXCEL_PATH, sheet_name=SHEET_NAME, header=None)
c_scen, c_desc = None, None
for c in range(len(df.columns)):
    header_str = " ".join([str(x) for x in df.iloc[:6, c].dropna().values])
    if "對位情境" in header_str:
        c_scen = c
    elif "攻防表現" in header_str:
        c_desc = c

new_matchups = []
if c_scen is not None and c_desc is not None:
    for r in range(4, len(df)):
        scen = str(df.iloc[r, c_scen]).strip() if pd.notna(df.iloc[r, c_scen]) else ""
        desc = str(df.iloc[r, c_desc]).strip() if pd.notna(df.iloc[r, c_desc]) else ""
        if scen and scen not in ["nan", "對位情境項目"] and desc and desc not in ["nan", "攻防表現與命中率變化"]:
            new_matchups.append((GAME_CODE, STAGE, TEAM_NAME, scen, desc))

# 2. 僅針對該場該隊更新資料庫
conn = sqlite3.connect("backend/data/tpbl_stats.db")
cur = conn.cursor()
cur.execute("DELETE FROM game_matchups WHERE stage = ? AND game_code = ? AND team_name = ?", (STAGE, GAME_CODE, TEAM_NAME))
cur.executemany("""
    INSERT INTO game_matchups (game_code, stage, team_name, scenario_item, tactical_desc)
    VALUES (?, ?, ?, ?, ?)
""", new_matchups)
conn.commit()
conn.close()
print(f"成功更新 {len(new_matchups)} 筆單場評論！")
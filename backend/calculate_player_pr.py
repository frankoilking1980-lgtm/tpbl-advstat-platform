import json
from pathlib import Path
import sqlite3
import numpy as np
import pandas as pd

CURRENT_DIR = Path(__file__).resolve().parent
DB_PATH = CURRENT_DIR / "data" / "tpbl_stats.db"
OUTPUT_BACKEND_JSON = CURRENT_DIR / "data" / "player_pr_stats.json"
OUTPUT_FRONTEND_JSON = (
    CURRENT_DIR.parent / "frontend" / "public" / "player_pr_stats.json"
)

TARGET_STAGE = "2026-2027 例行賽"
MIN_MPG = 8.0  # 基本時間門檻


def get_team_games_map(conn, stage: str) -> dict:
  """直接從 player_stats 統計每支球隊當季打完的最大場數，不依賴 games 表"""
  query = """
    SELECT team_name, MAX(games_played) as max_gp
    FROM player_stats
    WHERE season_stage = ?
    GROUP BY team_name
    """
  cursor = conn.cursor()
  cursor.execute(query, (stage,))
  rows = cursor.fetchall()
  return {row[0]: int(row[1]) for row in rows if row[0]}


def load_data():
  conn = sqlite3.connect(DB_PATH, timeout=30.0)
  try:
    team_games_map = get_team_games_map(conn, TARGET_STAGE)

    query = """
      SELECT 
          id, season_stage, team_name, player_name, jersey_number,
          position, identity, games_played, mpg, ppg, rpg, apg,
          spg, bpg, efg_pct, ts_pct, usg_pct, gmsc
      FROM player_stats
      WHERE season_stage = ?
      """
    df = pd.read_sql_query(query, conn, params=(TARGET_STAGE,))
    return df, team_games_map
  finally:
    conn.close()


def is_qualified(row, team_games_map: dict) -> bool:
  team = row["team_name"]
  gp = int(row["games_played"]) if pd.notnull(row["games_played"]) else 0
  mpg = float(row["mpg"]) if pd.notnull(row["mpg"]) else 0.0
  team_total = team_games_map.get(team, gp)

  # 1. 基本場均時間過濾 (過濾垃圾時間上場)
  if mpg < MIN_MPG or gp <= 0:
    return False

  # 2. 按所屬球隊已賽進度的階梯門檻
  if team_total <= 2:
    return gp >= 1
  elif team_total <= 5:
    return gp >= 2
  else:
    req = max(3, int(round(team_total * 0.4)))
    return gp >= req


def _normalize_pct_series(s: pd.Series) -> pd.Series:
  num = pd.to_numeric(s, errors="coerce")
  return num.where(~((num > 0.0) & (num <= 1.0)), num * 100.0)


def calculate_percentiles(df: pd.DataFrame, team_games_map: dict):
  if df.empty:
    return {}

  qualified_mask = df.apply(lambda r: is_qualified(r, team_games_map), axis=1)
  qualified_df = df[qualified_mask].copy()

  print(f"📊 賽季總球員: {len(df)} 位")
  print(f"🏀 各隊真實已賽場次: {team_games_map}")
  print(f"✅ 符合出賽門檻的合格母體: {len(qualified_df)} 位")

  if qualified_df.empty:
    return {
        "meta": {
            "stage": TARGET_STAGE,
            "min_mpg": MIN_MPG,
            "team_games": team_games_map,
            "total_qualified": 0,
        },
        "players": {},
        "rankings": [],
    }

  for pct_col in ("efg_pct", "ts_pct", "usg_pct"):
    qualified_df[pct_col] = _normalize_pct_series(qualified_df[pct_col])

  metric_cols = [
      ("ppg", "PTS"),
      ("rpg", "REB"),
      ("apg", "AST"),
      ("spg", "STL"),
      ("bpg", "BLK"),
      ("efg_pct", "eFG%"),
      ("ts_pct", "TS%"),
      ("usg_pct", "USG%"),
      ("gmsc", "GmSC"),
  ]

  for col, label in metric_cols:
    ranks = (
        qualified_df[col].rank(pct=True, ascending=True, method="average") * 100
    )
    qualified_df[f"{col}_pr"] = ranks.fillna(0).round(0).astype(int)

  by_name = {}
  ranked_list = []
  qualified_df = qualified_df.sort_values(by="gmsc", ascending=False)

  rank_idx = 1
  for _, row in qualified_df.iterrows():
    p_name = row["player_name"]
    badges = {}
    for col, label in metric_cols:
      val = (
          round(float(row[col]), 1)
          if pd.notnull(row[col])
          else 0.0
      )
      pr_val = (
          int(row[f"{col}_pr"])
          if pd.notnull(row[f"{col}_pr"])
          else 50
      )
      badges[label] = {"val": val, "pr": pr_val}

    item = {
        "rank": rank_idx,
        "id": row["id"],
        "name": p_name,
        "team_name": row["team_name"],
        "jersey_number": row["jersey_number"],
        "position": row["position"],
        "identity": row["identity"],
        "games_played": int(row["games_played"]),
        "mpg": round(float(row["mpg"]), 1),
        "badges": badges,
    }
    by_name[p_name] = item
    ranked_list.append(item)
    rank_idx += 1

  return {
      "meta": {
          "stage": TARGET_STAGE,
          "min_mpg": MIN_MPG,
          "team_games": team_games_map,
          "total_qualified": len(ranked_list),
      },
      "players": by_name,
      "rankings": ranked_list,
  }


def main():
  df, team_games_map = load_data()
  data = calculate_percentiles(df, team_games_map)
  if not data:
    return

  OUTPUT_BACKEND_JSON.parent.mkdir(parents=True, exist_ok=True)
  OUTPUT_FRONTEND_JSON.parent.mkdir(parents=True, exist_ok=True)

  with open(OUTPUT_BACKEND_JSON, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

  with open(OUTPUT_FRONTEND_JSON, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

  print("🚀 前後端 JSON 均已同步完成")


if __name__ == "__main__":
  main()
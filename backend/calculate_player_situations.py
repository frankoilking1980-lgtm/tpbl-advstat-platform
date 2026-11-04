import json
from pathlib import Path
from collections import defaultdict

CURRENT_DIR = Path(__file__).resolve().parent
RAW_DIR = CURRENT_DIR / "data" / "raw_game_stats"
OUTPUT_JSON_BACKEND = CURRENT_DIR / "data" / "player_situations_stats.json"
OUTPUT_JSON_FRONTEND = CURRENT_DIR.parent / "frontend" / "public" / "player_situations_stats.json"

EXCLUDE_GAME_IDS = {"27540", "27541"}

def safe_div(n, d, default=0.0):
    return round((n / d) * 100, 1) if d > 0 else default

def calculate():
    files = sorted(list(RAW_DIR.glob("game_*_stats.json")))
    print(f"📂 正在處理 {len(files)} 個比賽原始檔...")

    players = defaultdict(lambda: {
        "team": "", "number": "", "position": "", "games_played": 0,
        "total_minutes": 0.0, "total_points": 0,
        
        # 1. 互斥得分構成 (加總 = 100%)
        "pts_paint": 0,
        "pts_3pt": 0,
        "pts_ft": 0,
        "pts_mid": 0,
        
        # 2. 戰術情境
        "fast_break_pts": 0, "fast_break_fga": 0, "fast_break_fgm": 0,
        "paint_pts": 0, "paint_fga": 0, "paint_fgm": 0,
        "second_chance_pts": 0, "second_chance_fga": 0, "second_chance_fgm": 0,
        "points_off_tov": 0,
        
        # 3. 終結手法全覆蓋 (無漏接)
        # 三分完整統計 (包含定點、急停、後撤、飄移等所有三分)
        "three_total_fga": 0, "three_total_fgm": 0,
        "three_catch_shoot_fga": 0, "three_catch_shoot_fgm": 0, # 純定點跳投
        
        # 兩分跳投 (中距離 jump shot + pull-up + step-back + fadeaway)
        "two_jump_shot_fga": 0, "two_jump_shot_fgm": 0,
        
        # 總跳投合計 (所有兩分跳投 + 所有三分跳投)
        "jump_shot_total_fga": 0, "jump_shot_total_fgm": 0,
        
        # 上籃 (普通 + 切入突破)
        "layup_fga": 0, "layup_fgm": 0,
        # 灌籃 (普通 + 補扣)
        "dunk_fga": 0, "dunk_fgm": 0,
        # 自主單打 (急停 + 後撤 + 後仰，包含兩分與三分)
        "self_created_fga": 0, "self_created_fgm": 0,
        
        # 4. 第四節 (Q4)
        "q4_games": 0, "q4_seconds": 0, "q4_pts": 0,
        "q4_fga": 0, "q4_fgm": 0, "q4_fta": 0, "q4_ftm": 0,
        "q4_tov": 0, "q4_plus_minus": 0
    })

    valid_game_count = 0

    for f in files:
        gid = f.stem.replace("game_", "").replace("_stats", "")
        if gid in EXCLUDE_GAME_IDS:
            continue
        try:
            with open(f, "r", encoding="utf-8") as fp:
                data = json.load(fp)
        except Exception:
            continue
        if not isinstance(data, dict):
            continue

        valid_game_count += 1

        for side in ["home_team", "away_team"]:
            team_info = data.get(side, {})
            team_name = team_info.get("name", "")
            players_block = team_info.get("players", {})
            totals = players_block.get("total", {})
            
            for p_id, p_tot in totals.items():
                if not isinstance(p_tot, dict):
                    continue
                name = (p_tot.get("name") or "").strip()
                if not name:
                    continue
                sec = p_tot.get("time_on_court") or 0
                if sec == 0:
                    continue

                p = players[name]
                p["team"] = team_name
                p["number"] = p_tot.get("number") or p["number"]
                p["position"] = p_tot.get("positions") or p["position"]
                p["games_played"] += 1
                p["total_minutes"] += round(sec / 60.0, 1)
                
                score = p_tot.get("score") or 0
                p["total_points"] += score
                
                # --- 1. 真實互斥得分構成 ---
                made_3p = p_tot.get("three_pointers_made") or 0
                att_3p = p_tot.get("three_pointers_attempted") or 0
                made_ft = p_tot.get("free_throws_made") or 0
                paint_pts = p_tot.get("points_in_paint") or 0
                
                pts_from_3p = made_3p * 3
                pts_from_ft = made_ft * 1
                pts_from_paint = paint_pts
                pts_from_mid = max(0, score - pts_from_3p - pts_from_ft - pts_from_paint)
                
                p["pts_3pt"] += pts_from_3p
                p["pts_ft"] += pts_from_ft
                p["pts_paint"] += pts_from_paint
                p["pts_mid"] += pts_from_mid

                # --- 2. 戰術情境 ---
                p["fast_break_pts"] += p_tot.get("fast_break_points") or 0
                p["fast_break_fga"] += p_tot.get("field_goals_attempted_on_fast_break") or 0
                p["fast_break_fgm"] += p_tot.get("field_goals_made_on_fast_break") or 0

                p["paint_pts"] += paint_pts
                p["paint_fga"] += p_tot.get("field_goals_attempted_in_the_paint") or 0
                p["paint_fgm"] += p_tot.get("field_goals_made_in_the_paint") or 0

                p["second_chance_pts"] += p_tot.get("second_chance_points") or 0
                p["second_chance_fga"] += p_tot.get("field_goals_attempted_on_second_chance") or 0
                p["second_chance_fgm"] += p_tot.get("field_goals_made_on_second_chance") or 0

                p["points_off_tov"] += p_tot.get("points_off_turnovers") or 0

                # --- 3. 終結手法全項目抓取 (100% 精準無遺漏) ---
                # A. 三分全部投籃 (以官方三分為準，確保 100% 吻合)
                p["three_total_fga"] += att_3p
                p["three_total_fgm"] += made_3p
                # 三分定點 Catch & Shoot
                p["three_catch_shoot_fga"] += p_tot.get("three_pointers_jump_shot_attempted") or 0
                p["three_catch_shoot_fgm"] += p_tot.get("three_pointers_jump_shot_made") or 0

                # B. 兩分跳投全項目：兩分普通跳投 + 兩分急停 + 兩分後撤 + 兩分後仰 + 兩分翻身
                two_jump_fga = (
                    (p_tot.get("two_pointers_jump_shot_attempted") or 0) +
                    (p_tot.get("two_pointers_pull_up_jump_shot_attempted") or 0) +
                    (p_tot.get("two_pointers_step_back_jump_shot_attempted") or 0) +
                    (p_tot.get("two_pointers_fadeaway_jump_shot_attempted") or 0) +
                    (p_tot.get("two_pointers_turnaround_jump_shot_attempted") or 0)
                )
                two_jump_fgm = (
                    (p_tot.get("two_pointers_jump_shot_made") or 0) +
                    (p_tot.get("two_pointers_pull_up_jump_shot_made") or 0) +
                    (p_tot.get("two_pointers_step_back_jump_shot_made") or 0) +
                    (p_tot.get("two_pointers_fadeaway_jump_shot_made") or 0) +
                    (p_tot.get("two_pointers_turnaround_jump_shot_made") or 0)
                )
                p["two_jump_shot_fga"] += two_jump_fga
                p["two_jump_shot_fgm"] += two_jump_fgm

                # C. 總跳投合計 (兩分跳投 + 三分所有投籃)
                p["jump_shot_total_fga"] += (two_jump_fga + att_3p)
                p["jump_shot_total_fgm"] += (two_jump_fgm + made_3p)

                # D. 上籃 (上籃 + 切入突破)
                p["layup_fga"] += (p_tot.get("two_pointers_layup_attempted") or 0) + (p_tot.get("two_pointers_driving_layup_attempted") or 0)
                p["layup_fgm"] += (p_tot.get("two_pointers_layup_made") or 0) + (p_tot.get("two_pointers_driving_layup_made") or 0)

                # E. 灌籃 (普通灌籃 + 補扣)
                p["dunk_fga"] += (p_tot.get("two_pointers_dunk_attempted") or 0) + (p_tot.get("two_pointers_putback_dunk_attempted") or 0)
                p["dunk_fgm"] += (p_tot.get("two_pointers_dunk_made") or 0) + (p_tot.get("two_pointers_putback_dunk_made") or 0)

                # F. 自主單打自創 (急停 + 後撤 + 後仰，包含兩分與三分)
                self_fga = (
                    (p_tot.get("two_pointers_pull_up_jump_shot_attempted") or 0) + 
                    (p_tot.get("three_pointers_pull_up_jump_shot_attempted") or 0) +
                    (p_tot.get("two_pointers_step_back_jump_shot_attempted") or 0) +
                    (p_tot.get("three_pointers_step_back_jump_shot_attempted") or 0) +
                    (p_tot.get("two_pointers_fadeaway_jump_shot_attempted") or 0) +
                    (p_tot.get("three_pointers_fadeaway_jump_shot_attempted") or 0)
                )
                self_fgm = (
                    (p_tot.get("two_pointers_pull_up_jump_shot_made") or 0) + 
                    (p_tot.get("three_pointers_pull_up_jump_shot_made") or 0) +
                    (p_tot.get("two_pointers_step_back_jump_shot_made") or 0) +
                    (p_tot.get("three_pointers_step_back_jump_shot_made") or 0) +
                    (p_tot.get("two_pointers_fadeaway_jump_shot_made") or 0) +
                    (p_tot.get("three_pointers_fadeaway_jump_shot_made") or 0)
                )
                p["self_created_fga"] += self_fga
                p["self_created_fgm"] += self_fgm

            # --- 4. 處理第四節 (Round 4) 數據 ---
            rounds = players_block.get("rounds", {})
            r4 = rounds.get("4", {})
            for p_id, p_r4 in r4.items():
                if not isinstance(p_r4, dict):
                    continue
                name = (p_r4.get("name") or "").strip()
                if not name:
                    continue
                sec = p_r4.get("time_on_court") or 0
                if sec == 0:
                    continue
                p = players[name]
                p["q4_games"] += 1
                p["q4_seconds"] += sec
                p["q4_pts"] += p_r4.get("score") or 0
                p["q4_fga"] += p_r4.get("field_goals_attempted") or 0
                p["q4_fgm"] += p_r4.get("field_goals_made") or 0
                p["q4_fta"] += p_r4.get("free_throws_attempted") or 0
                p["q4_ftm"] += p_r4.get("free_throws_made") or 0
                p["q4_tov"] += p_r4.get("turnovers") or 0
                p["q4_plus_minus"] += p_r4.get("plus_minus") or 0

    print(f"✅ 有效 2026-2027 例行賽場次: {valid_game_count} 場，統計球員人數: {len(players)}")

    final_result = {
        "meta": { "season": "2026-2027 例行賽", "total_games": valid_game_count },
        "players": {}
    }

    for name, stat in players.items():
        gp = stat["games_played"]
        if gp == 0:
            continue
        tot_pts = stat["total_points"]

        q4_ts_denom = 2 * (stat["q4_fga"] + 0.44 * stat["q4_fta"])
        q4_ts = round((stat["q4_pts"] / q4_ts_denom) * 100, 1) if q4_ts_denom > 0 else 0.0

        final_result["players"][name] = {
            "team": stat["team"],
            "number": stat["number"],
            "position": stat["position"],
            "games_played": gp,
            "mpg": round(stat["total_minutes"] / gp, 1),
            "ppg": round(tot_pts / gp, 1),

            # 純得分幾何構成 (互斥加總 = 100%)
            "point_composition": {
                "paint_pct": safe_div(stat["pts_paint"], tot_pts),
                "paint_ppg": round(stat["pts_paint"] / gp, 1),
                
                "three_pt_pct": safe_div(stat["pts_3pt"], tot_pts),
                "three_pt_ppg": round(stat["pts_3pt"] / gp, 1),
                
                "mid_range_pct": safe_div(stat["pts_mid"], tot_pts),
                "mid_range_ppg": round(stat["pts_mid"] / gp, 1),
                
                "free_throw_pct": safe_div(stat["pts_ft"], tot_pts),
                "free_throw_ppg": round(stat["pts_ft"] / gp, 1),
            },

            # 戰術反擊與拼勁情境
            "tactical_situations": {
                "fast_break": {
                    "ppg": round(stat["fast_break_pts"] / gp, 1),
                    "share_pct": safe_div(stat["fast_break_pts"], tot_pts),
                    "fg_pct": safe_div(stat["fast_break_fgm"], stat["fast_break_fga"]),
                },
                "second_chance": {
                    "ppg": round(stat["second_chance_pts"] / gp, 1),
                    "share_pct": safe_div(stat["second_chance_pts"], tot_pts),
                    "fg_pct": safe_div(stat["second_chance_fgm"], stat["second_chance_fga"]),
                },
                "points_off_tov": {
                    "ppg": round(stat["points_off_tov"] / gp, 1),
                    "share_pct": safe_div(stat["points_off_tov"], tot_pts)
                }
            },

            # 終結手法細分
            "finishing_breakdown": {
                "jump_shot_total": {
                    "fga": stat["jump_shot_total_fga"],
                    "fgm": stat["jump_shot_total_fgm"],
                    "fg_pct": safe_div(stat["jump_shot_total_fgm"], stat["jump_shot_total_fga"])
                },
                "two_jump_shot": {
                    "fga": stat["two_jump_shot_fga"],
                    "fgm": stat["two_jump_shot_fgm"],
                    "fg_pct": safe_div(stat["two_jump_shot_fgm"], stat["two_jump_shot_fga"])
                },
                "three_jump_shot": {
                    "fga": stat["three_total_fga"],
                    "fgm": stat["three_total_fgm"],
                    "fg_pct": safe_div(stat["three_total_fgm"], stat["three_total_fga"])
                },
                "layup": {
                    "fga": stat["layup_fga"],
                    "fgm": stat["layup_fgm"],
                    "fg_pct": safe_div(stat["layup_fgm"], stat["layup_fga"])
                },
                "dunk": {
                    "fga": stat["dunk_fga"],
                    "fgm": stat["dunk_fgm"],
                    "fg_pct": safe_div(stat["dunk_fgm"], stat["dunk_fga"])
                },
                "self_created": {
                    "fga": stat["self_created_fga"],
                    "fgm": stat["self_created_fgm"],
                    "fg_pct": safe_div(stat["self_created_fgm"], stat["self_created_fga"])
                }
            },

            # 第四節 (Q4) 抗壓
            "q4_crunch_time": {
                "q4_games": stat["q4_games"],
                "q4_mpg": round((stat["q4_seconds"] / 60.0) / stat["q4_games"], 1) if stat["q4_games"] > 0 else 0.0,
                "q4_ppg": round(stat["q4_pts"] / stat["q4_games"], 1) if stat["q4_games"] > 0 else 0.0,
                "q4_fg_pct": safe_div(stat["q4_fgm"], stat["q4_fga"]),
                "q4_ts_pct": q4_ts,
                "q4_tov_pg": round(stat["q4_tov"] / stat["q4_games"], 1) if stat["q4_games"] > 0 else 0.0,
                "q4_plus_minus_pg": round(stat["q4_plus_minus"] / stat["q4_games"], 1) if stat["q4_games"] > 0 else 0.0
            }
        }

    OUTPUT_JSON_BACKEND.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON_BACKEND, "w", encoding="utf-8") as f:
        json.dump(final_result, f, ensure_ascii=False, indent=2)

    OUTPUT_JSON_FRONTEND.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON_FRONTEND, "w", encoding="utf-8") as f:
        json.dump(final_result, f, ensure_ascii=False, indent=2)

    print(f"🎉 成功更新 JSON 至:\n   -> {OUTPUT_JSON_BACKEND}\n   -> {OUTPUT_JSON_FRONTEND}")

if __name__ == "__main__":
    calculate()
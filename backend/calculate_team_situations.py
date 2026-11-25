import argparse
import json
import os
import re
import sqlite3
from pathlib import Path
from collections import defaultdict

CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
RAW_DIR = CURRENT_DIR / "data" / "raw_game_stats"
if not RAW_DIR.exists():
    RAW_DIR = PROJECT_ROOT / "data" / "raw_game_stats"

DB_PATH = Path(os.environ["TPBL_DB_PATH"]) if os.environ.get("TPBL_DB_PATH") else (CURRENT_DIR / "data" / "tpbl_stats.db")
if not DB_PATH.exists():
    DB_PATH = PROJECT_ROOT / "backend" / "data" / "tpbl_stats.db"

STAGING_OUT_DIR = Path(os.environ["TPBL_STAGING_OUT_DIR"]) if os.environ.get("TPBL_STAGING_OUT_DIR") else None
OUTPUT_BACKEND_JSON = (STAGING_OUT_DIR / "team_situations_stats.json") if STAGING_OUT_DIR else (CURRENT_DIR / "data" / "team_situations_stats.json")
OUTPUT_FRONTEND_JSON = None if STAGING_OUT_DIR else (PROJECT_ROOT / "frontend" / "public" / "team_situations_stats.json")

STAGE_MAPPING = {
    "season2024": "2024-2025 例行賽",
    "season2025": "2025-2026 例行賽",
    "playin2025": "2025-2026 季後挑戰賽",
    "playoff2025": "2025-2026 季後賽",
    "final20252026": "2025-2026 冠軍賽",
    "preseason2026": "2026-2027 熱身賽",
    "season2026": "2026-2027 例行賽",
}
DEFAULT_STAGE = "2026-2027 例行賽"
EXCLUDE_GAME_IDS = {"27540", "27541"}

TEAM_ALIASES_MAP = {
    "新竹御嵿攻城獅": ["新竹御嵿攻城獅", "新竹御頂攻城獅", "新竹攻城獅", "攻城獅"],
    "新竹御頂攻城獅": ["新竹御嵿攻城獅", "新竹御頂攻城獅", "新竹攻城獅", "攻城獅"],
    "新竹攻城獅": ["新竹御嵿攻城獅", "新竹御頂攻城獅", "新竹攻城獅", "攻城獅"],
    "福爾摩沙夢想家": ["福爾摩沙夢想家", "福爾摩沙台新夢想家", "夢想家"],
    "桃園台啤永豐雲豹": ["桃園台啤永豐雲豹", "台啤永豐雲豹", "桃園雲豹", "台啤雲豹", "雲豹"],
    "高雄全家海神": ["高雄全家海神", "全家海神", "高雄海神", "海神"],
    "新北中信特攻": ["新北中信特攻", "中信特攻", "新北特攻", "特攻"],
    "臺北台新戰神": ["臺北台新戰神", "台北台新戰神", "台北戰神", "臺北戰神", "台新戰神", "戰神"],
    "新北國王": ["新北國王", "國王"],
}

def normalize_team(raw_name: str) -> str:
    clean = str(raw_name).strip()
    for std_name, aliases in TEAM_ALIASES_MAP.items():
        if clean in aliases or any(alias in clean for alias in aliases):
            return std_name
    return clean

def safe_pct(n, d, default=0.0):
    return round((n / d) * 100, 1) if d > 0 else default

def _extract_score(side: dict) -> int:
    tot = (side.get("teams") or {}).get("total", {}).get("won_score")
    if tot is not None:
        try:
            v = int(round(float(tot)))
            if v > 0:
                return v
        except (TypeError, ValueError):
            pass
    return int(round(sum(float(p.get("score") or 0) for p in ((side.get("players") or {}).get("total") or {}).values() if isinstance(p, dict))))


def _load_season_matcher(season_folder: str) -> tuple[set[str], set[tuple[str, str, int, int]]]:
    sched_path = CURRENT_DIR / "data" / season_folder / "schedule.json"
    if not sched_path.exists():
        sched_path = PROJECT_ROOT / "data" / season_folder / "schedule.json"
    if not sched_path.exists():
        return set(), set()
    try:
        items = json.loads(sched_path.read_text(encoding="utf-8"))
        if not isinstance(items, list):
            return set(), set()
    except Exception:
        return set(), set()

    sids: set[str] = set()
    score_keys: set[tuple[str, str, int, int]] = set()
    for g in items:
        sid = g.get("schedule_id") or g.get("official_id")
        if sid is not None:
            sids.add(str(sid))
        a_team = normalize_team(g.get("away_team", ""))
        h_team = normalize_team(g.get("home_team", ""))
        a_score = int(g.get("away_score") or 0)
        h_score = int(g.get("home_score") or 0)
        if a_team and h_team and (a_score > 0 or h_score > 0):
            score_keys.add((a_team, h_team, a_score, h_score))
    return sids, score_keys


def get_player_identity_map(stage: str = DEFAULT_STAGE):
    """從資料庫 player_stats 讀取指定賽季球員官方身分 (本土 / 洋將 / 華裔 / 外籍生)"""
    id_map = {}
    if not DB_PATH.exists():
        print(f"⚠️ 找不到資料庫檔案: {DB_PATH}")
        return id_map

    conn = None
    try:
        conn = sqlite3.connect(DB_PATH, timeout=30.0)
        cur = conn.cursor()
        cur.execute(
            "SELECT player_name, identity FROM player_stats WHERE season_stage = ? AND identity IS NOT NULL AND identity != ''",
            (stage,),
        )
        rows = cur.fetchall()
        if not rows:
            cur.execute("SELECT player_name, identity FROM player_stats WHERE identity IS NOT NULL AND identity != ''")
            rows = cur.fetchall()
        for p_name, ident in rows:
            clean = str(p_name).split(" ")[0].split("(")[0].strip()
            id_map[clean] = str(ident).strip()
        print(f"🔍 [{stage}] 成功載入 {len(id_map)} 位球員官方登錄身分資料。")
    except Exception as e:
        print(f"⚠️ 讀取球員身分失敗: {e}")
    finally:
        if conn is not None:
            conn.close()

    return id_map

def calculate_season(season_folder: str) -> dict:
    stage = STAGE_MAPPING.get(season_folder, season_folder)
    sched_sids, score_keys = _load_season_matcher(season_folder)
    files = sorted(list(RAW_DIR.glob("game_*_stats.json")))
    print(f"📂 [{stage}] 正在掃描 {len(files)} 個比賽原始檔...")

    player_identities = get_player_identity_map(stage)

    teams = defaultdict(lambda: {
        "games_played": 0,
        "total_points": 0,
        "starter_points": 0,
        "bench_points": 0,
        "local_points": 0,
        "import_points": 0,
        "fga_total": 0,
        "two_fga": 0,
        "three_fga": 0,
        "paint_points": 0,
        "fast_break_points": 0,
    })

    valid_game_count = 0

    for f in files:
        gid = f.stem.replace("game_", "").replace("_stats", "")
        if season_folder == "season2026" and gid in EXCLUDE_GAME_IDS:
            continue
        try:
            with open(f, "r", encoding="utf-8") as fp:
                data = json.load(fp)
        except Exception:
            continue
        if not isinstance(data, dict):
            continue

        if gid not in sched_sids:
            a_t = normalize_team((data.get("away_team") or {}).get("name", ""))
            h_t = normalize_team((data.get("home_team") or {}).get("name", ""))
            a_s = _extract_score(data.get("away_team") or {})
            h_s = _extract_score(data.get("home_team") or {})
            if (a_t, h_t, a_s, h_s) not in score_keys:
                continue

        valid_game_count += 1

        for side in ["home_team", "away_team"]:
            team_info = data.get(side, {})
            team_name = normalize_team(team_info.get("name", ""))
            if not team_name:
                continue

            t = teams[team_name]
            t["games_played"] += 1

            players_block = team_info.get("players", {})
            totals = players_block.get("total", {})

            for p_id, p_tot in totals.items():
                if not isinstance(p_tot, dict):
                    continue
                sec = p_tot.get("time_on_court") or 0
                if sec == 0:
                    continue

                pts = p_tot.get("score") or 0
                is_starter = bool(p_tot.get("is_starting", False))
                
                raw_pname = (p_tot.get("name") or "").strip()
                clean_name = raw_pname.split(" ")[0].split("(")[0].strip()

                # 精確身分判定：優先查官方 identity
                ident = player_identities.get(clean_name, "")
                is_foreign = (ident == "洋將")

                # 若資料庫無記錄的保底：常見職籃洋將譯名檢索
                if not ident:
                    is_foreign = any(k in clean_name for k in [
                        "米勒", "莫騰", "溫布許", "馬雷利亞", "馬利", "麥基",
                        "威勝", "庫薩斯", "克雷格", "比菲", "艾德", "浩勝", "葛瑞飛",
                        "克拉", "霍立飛", "艾夫伯", "力猛", "高柏鎧", "霍爾曼", "貝奇",
                        "沃許本", "曼尼高", "強森", "奧帝", "桑尼"
                    ])

                t["total_points"] += pts
                if is_starter:
                    t["starter_points"] += pts
                else:
                    t["bench_points"] += pts

                if is_foreign:
                    t["import_points"] += pts
                else:
                    t["local_points"] += pts

                # 出手統計
                fga_2p = p_tot.get("two_pointers_attempted") or 0
                fga_3p = p_tot.get("three_pointers_attempted") or 0
                t["two_fga"] += fga_2p
                t["three_fga"] += fga_3p
                t["fga_total"] += (fga_2p + fga_3p)

                t["paint_points"] += (p_tot.get("points_in_paint") or 0)
                t["fast_break_points"] += (p_tot.get("fast_break_points") or 0)

    result = {
        "meta": {
            "season": stage,
            "stage": stage,
            "total_games": valid_game_count
        },
        "teams": []
    }

    for t_name, stat in sorted(teams.items(), key=lambda x: x[1]["total_points"] / max(x[1]["games_played"], 1), reverse=True):
        gp = stat["games_played"]
        if gp == 0:
            continue

        tot_pts = stat["total_points"]
        tot_fga = stat["fga_total"]

        result["teams"].append({
            "team_name": t_name,
            "games_played": gp,
            "ppg": round(tot_pts / gp, 1),
            "starter": {
                "ppg": round(stat["starter_points"] / gp, 1),
                "share_pct": safe_pct(stat["starter_points"], tot_pts)
            },
            "bench": {
                "ppg": round(stat["bench_points"] / gp, 1),
                "share_pct": safe_pct(stat["bench_points"], tot_pts)
            },
            "local": {
                "ppg": round(stat["local_points"] / gp, 1),
                "share_pct": safe_pct(stat["local_points"], tot_pts)
            },
            "import": {
                "ppg": round(stat["import_points"] / gp, 1),
                "share_pct": safe_pct(stat["import_points"], tot_pts)
            },
            "shot_distribution": {
                "two_pt_fga_pg": round(stat["two_fga"] / gp, 1),
                "two_pt_share_pct": safe_pct(stat["two_fga"], tot_fga),
                "three_pt_fga_pg": round(stat["three_fga"] / gp, 1),
                "three_pt_share_pct": safe_pct(stat["three_fga"], tot_fga),
            },
            "situations": {
                "paint_ppg": round(stat["paint_points"] / gp, 1),
                "paint_share_pct": safe_pct(stat["paint_points"], tot_pts),
                "fast_break_ppg": round(stat["fast_break_points"] / gp, 1),
                "fast_break_share_pct": safe_pct(stat["fast_break_points"], tot_pts),
            }
        })

    print(f"✅ [{stage}] 團隊情境矩陣統計完成！共產出 {len(result['teams'])} 隊數據。")
    return result


def _load_existing_payload() -> dict:
    for cand in (OUTPUT_BACKEND_JSON, OUTPUT_FRONTEND_JSON):
        if cand is not None and cand.exists():
            try:
                return json.loads(cand.read_text(encoding="utf-8"))
            except Exception:
                pass
    return {}


def main():
    parser = argparse.ArgumentParser(description="計算團隊先發/替補與本土/洋將情境矩陣 (支援多賽季)")
    parser.add_argument("--season", type=str, default=None, help="指定賽季資料夾 (例如: season2024)")
    parser.add_argument("--all-seasons", action="store_true", help="遍歷所有具備 schedule.json 的賽季資料夾")
    args = parser.parse_args()

    data_root = CURRENT_DIR / "data"
    if args.all_seasons:
        target_seasons = [
            d.name for d in sorted(data_root.iterdir())
            if d.is_dir() and d.name in STAGE_MAPPING and (d / "schedule.json").exists()
        ]
    elif args.season:
        target_seasons = [args.season]
    else:
        target_seasons = ["season2026"]

    existing = _load_existing_payload()
    stages_dict = dict(existing.get("stages") or {})
    if not stages_dict and existing.get("teams") is not None:
        ex_stage = (existing.get("meta") or {}).get("stage") or (existing.get("meta") or {}).get("season") or DEFAULT_STAGE
        stages_dict[ex_stage] = {
            "meta": existing.get("meta", {}),
            "teams": existing.get("teams", []),
        }

    for sf in target_seasons:
        stage = STAGE_MAPPING.get(sf, sf)
        res = calculate_season(sf)
        if res["meta"]["total_games"] > 0 or stage not in stages_dict:
            stages_dict[stage] = res

    root_data = stages_dict.get(DEFAULT_STAGE) or (next(iter(stages_dict.values())) if stages_dict else {"meta": {}, "teams": []})
    payload = {
        "meta": root_data.get("meta", {}),
        "teams": root_data.get("teams", []),
        "stages": stages_dict,
    }

    OUTPUT_BACKEND_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_BACKEND_JSON, "w", encoding="utf-8") as fp:
        json.dump(payload, fp, ensure_ascii=False, indent=2)

    if OUTPUT_FRONTEND_JSON is not None:
        OUTPUT_FRONTEND_JSON.parent.mkdir(parents=True, exist_ok=True)
        with open(OUTPUT_FRONTEND_JSON, "w", encoding="utf-8") as fp:
            json.dump(payload, fp, ensure_ascii=False, indent=2)

    print(f"🎉 成功更新多賽季 team_situations_stats.json（涵蓋 {len(stages_dict)} 個賽季階段） -> {OUTPUT_BACKEND_JSON}")


if __name__ == "__main__":
    main()
"""
TPBL 真實逐球文字直播 (Broadcasts PBP) 陣容與 On/Off 精算引擎
----------------------------------------------------------------
讀取 backend/data/raw_game_stats/ 下每場比賽的：
  - game_{schedule_id}_stats.json (球員 ID、姓名、球隊總分檢核)
  - game_{schedule_id}_broadcasts.json (逐球事件與 Rotation 出場/離場時間軸)
並結合 backend/data/tpbl_stats.db 取得球員本土/洋將身份 (identity)，
精算「全場 (all)」與「排除垃圾時間 (non_garbage: Q4 最後 5 分鐘且分差 >= 20)」之：
  1. 單場球員 On/Off、最佳五人陣容、雙人搭檔
  2. 全季各隊累積 On/Off 總榜、最佳五人陣容 (>= 10 分鐘)、雙洋將組合

輸出至：
  - backend/data/pbp_lineup_stats.json
  - frontend/public/pbp_lineup_stats.json
"""

import json
import sqlite3
from collections import defaultdict
from itertools import combinations
from pathlib import Path
from typing import Dict, List, Set, Tuple, Any

CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
RAW_DIR = CURRENT_DIR / "data" / "raw_game_stats"
DB_PATH = CURRENT_DIR / "data" / "tpbl_stats.db"
SCHED_PATH = PROJECT_ROOT / "data" / "season2026" / "schedule.json"

OUT_BACKEND = CURRENT_DIR / "data" / "pbp_lineup_stats.json"
OUT_FRONTEND = PROJECT_ROOT / "frontend" / "public" / "pbp_lineup_stats.json"

TEAM_ALIASES_MAP = {
    "新竹御嵿攻城獅": ["新竹御嵿攻城獅", "新竹御頂攻城獅", "新竹攻城獅", "攻城獅"],
    "福爾摩沙夢想家": ["福爾摩沙夢想家", "福爾摩沙台新夢想家", "夢想家"],
    "桃園台啤永豐雲豹": ["桃園台啤永豐雲豹", "台啤永豐雲豹", "桃園雲豹", "台啤雲豹", "雲豹"],
    "高雄全家海神": ["高雄全家海神", "全家海神", "高雄海神", "海神"],
    "新北中信特攻": ["新北中信特攻", "中信特攻", "新北特攻", "特攻"],
    "臺北台新戰神": ["臺北台新戰神", "台北台新戰神", "台北戰神", "臺北戰神", "台新戰神", "戰神"],
    "新北國王": ["新北國王", "國王"],
}


def normalize_team_name(raw_name: str) -> str:
    clean = str(raw_name or "").strip()
    for std_name, aliases in TEAM_ALIASES_MAP.items():
        if clean in aliases or any(alias in clean for alias in aliases):
            return std_name
    return clean


def fmt_mmss(seconds_float: float) -> str:
    sec = max(0, int(round(seconds_float)))
    return f"{sec // 60:02d}:{sec % 60:02d}"


def calc_rtg(pts: float, poss: float) -> float:
    return round((pts / poss) * 100.0, 1) if poss > 0 else 0.0


def empty_bucket() -> Dict[str, float]:
    return {
        "sec": 0.0,
        "pts_for": 0,
        "pts_against": 0,
        "poss_for": 0.0,
        "poss_against": 0.0,
    }


def load_import_players_from_db(stage: str = "2026-2027 例行賽") -> Dict[Tuple[str, str], bool]:
    """從 SQLite 讀取 (標準隊名, 球員名) -> 是否為洋將"""
    mapping: Dict[Tuple[str, str], bool] = {}
    if not DB_PATH.exists():
        return mapping
    conn = sqlite3.connect(str(DB_PATH))
    try:
        rows = conn.execute(
            "SELECT team_name, player_name, identity FROM player_stats WHERE season_stage = ?",
            (stage,),
        ).fetchall()
        for t_name, p_name, ident in rows:
            std_t = normalize_team_name(t_name)
            clean_p = str(p_name or "").split(" ")[0].split("(")[0].strip()
            is_imp = "洋將" in str(ident or "")
            mapping[(std_t, clean_p)] = is_imp
    finally:
        conn.close()
    return mapping


def load_schedule_map() -> Dict[Tuple[str, str], Dict[str, Any]]:
    """從 schedule.json 建立 (away_team, home_team) -> [game_meta...] 用於對應 G01..G14"""
    res: Dict[Tuple[str, str], List[Dict[str, Any]]] = defaultdict(list)
    if not SCHED_PATH.exists():
        return {}
    sched = json.loads(SCHED_PATH.read_text(encoding="utf-8"))
    for g in sched:
        a = normalize_team_name(g.get("away_team", ""))
        h = normalize_team_name(g.get("home_team", ""))
        res[(a, h)].append(g)
    return res


def process_game(schedule_id: str, stats_data: dict, bcast_data: dict) -> dict:
    home_raw = stats_data["home_team"]
    away_raw = stats_data["away_team"]
    hid, aid = home_raw["id"], away_raw["id"]
    h_name = normalize_team_name(home_raw["name"])
    a_name = normalize_team_name(away_raw["name"])

    team_names = {hid: h_name, aid: a_name}
    opp_of = {hid: aid, aid: hid}

    # 建立球員名單與官方 Box Score 檢核對照
    player_names: Dict[int, str] = {}
    player_team: Dict[int, int] = {}
    box_check: Dict[int, Dict[str, Any]] = {}

    for tid, t_raw in [(aid, away_raw), (hid, home_raw)]:
        for p in t_raw.get("players", {}).get("total", {}).values():
            pid = p.get("id")
            if pid is None:
                continue
            pname = str(p.get("name", "")).split(" ")[0].split("(")[0].strip()
            player_names[pid] = pname
            player_team[pid] = tid
            box_check[pid] = {
                "name": pname,
                "team_id": tid,
                "box_sec": int(p.get("time_on_court") or 0),
                "box_pm": int(p.get("plus_minus") or 0),
                "box_pts": int(p.get("score") or 0),
            }

    # 收集並嚴格排序逐球事件
    events: List[dict] = []
    for rd in bcast_data.get("rounds", []):
        for ev in rd.get("events", []):
            events.append(ev)
            p_obj = ev.get("player")
            t_obj = ev.get("team")
            if isinstance(p_obj, dict) and p_obj.get("id") is not None:
                pid = p_obj["id"]
                if pid not in player_names:
                    player_names[pid] = str(p_obj.get("name", "")).split(" ")[0].split("(")[0].strip()
                if pid not in player_team and isinstance(t_obj, dict) and t_obj.get("id") in (hid, aid):
                    player_team[pid] = t_obj["id"]

    # 排序規則：quarter 升序、剩餘時間降序；t==0 的離場 (Leaving) 置於該節末所有攻守事件之後；其餘依 order 升序
    def sort_key(ev: dict):
        q = int(ev.get("quarter") or 0)
        t = int(ev.get("event_quarter_time") or 0)
        is_end_leaving = (
            1
            if (t == 0 and ev.get("event_type") == "Rotation" and ev.get("event_outcome") == "Leaving")
            else 0
        )
        return (q, -t, is_end_leaving, int(ev.get("order") or 0))

    events.sort(key=sort_key)

    # 追蹤兩個模式：all (全場) 與 non_garbage (排除垃圾時間)
    modes = ("all", "non_garbage")
    team_totals = {m: {hid: empty_bucket(), aid: empty_bucket()} for m in modes}
    player_on = {m: {hid: defaultdict(empty_bucket), aid: defaultdict(empty_bucket)} for m in modes}
    lineup_stats = {m: {hid: defaultdict(empty_bucket), aid: defaultdict(empty_bucket)} for m in modes}
    pair_stats = {m: {hid: defaultdict(empty_bucket), aid: defaultdict(empty_bucket)} for m in modes}

    on_court: Dict[int, Set[int]] = {hid: set(), aid: set()}
    running_pts: Dict[int, int] = {hid: 0, aid: 0}
    prev_q = None
    prev_t = None
    bad_lineup_events = 0

    def add_time_interval(q: int, t0: int, t1: int):
        if t0 <= t1:
            return
        if len(on_court[hid]) != 5 or len(on_court[aid]) != 5:
            return

        score_diff = abs(running_pts[hid] - running_pts[aid])
        # 若橫跨第4節 300000ms (5:00) 分界，切分時間段以確保秒數精確
        segments: List[Tuple[int, int, bool]] = []
        if q == 4 and score_diff >= 20 and t0 > 300000 > t1:
            segments.append((t0, 300000, False))
            segments.append((300000, t1, True))
        else:
            is_garbage = (q == 4 and t0 <= 300000 and score_diff >= 20)
            segments.append((t0, t1, is_garbage))

        for seg_start, seg_end, is_g in segments:
            dt_sec = (seg_start - seg_end) / 1000.0
            active_modes = ("all",) if is_g else ("all", "non_garbage")
            for m in active_modes:
                for tid in (hid, aid):
                    team_totals[m][tid]["sec"] += dt_sec
                    oc = sorted(on_court[tid])
                    l_key = tuple(oc)
                    lineup_stats[m][tid][l_key]["sec"] += dt_sec
                    for pid in oc:
                        player_on[m][tid][pid]["sec"] += dt_sec
                    for p1, p2 in combinations(oc, 2):
                        pair_stats[m][tid][(p1, p2)]["sec"] += dt_sec

    for ev in events:
        q = int(ev.get("quarter") or 0)
        t = int(ev.get("event_quarter_time") or 0)

        if prev_q == q and prev_t is not None and t < prev_t:
            add_time_interval(q, prev_t, t)
        prev_q = q
        prev_t = t

        et = ev.get("event_type")
        eo = ev.get("event_outcome")
        tid = (ev.get("team") or {}).get("id")
        pid = (ev.get("player") or {}).get("id")

        if et == "Rotation":
            if tid in on_court and pid is not None:
                if eo == "Entering":
                    on_court[tid].add(pid)
                elif eo == "Leaving":
                    on_court[tid].discard(pid)
            continue

        # 計算當下事件得分與回合數增量
        pts_delta = 0
        poss_delta = 0.0

        if et == "TwoPointer":
            poss_delta += 1.0
            if eo in ("Made", "AndOne"):
                pts_delta = 2
        elif et == "ThreePointer":
            poss_delta += 1.0
            if eo == "Made":
                pts_delta = 3
        elif et == "FreeThrow":
            poss_delta += 0.44
            if eo == "Made":
                pts_delta = 1
        elif et == "Rebound" and eo == "Offensive":
            poss_delta -= 1.0
        elif et == "Turnover":
            poss_delta += 1.0

        if pts_delta == 0 and poss_delta == 0.0:
            continue

        if tid not in (hid, aid):
            continue

        if len(on_court[hid]) != 5 or len(on_court[aid]) != 5:
            bad_lineup_events += 1

        score_diff_before = abs(running_pts[hid] - running_pts[aid])
        is_garbage = (q == 4 and t <= 300000 and score_diff_before >= 20)
        active_modes = ("all",) if is_garbage else ("all", "non_garbage")

        opp_tid = opp_of[tid]
        for m in active_modes:
            # 進攻方
            team_totals[m][tid]["pts_for"] += pts_delta
            team_totals[m][tid]["poss_for"] += poss_delta
            # 防守方
            team_totals[m][opp_tid]["pts_against"] += pts_delta
            team_totals[m][opp_tid]["poss_against"] += poss_delta

            for active_tid, is_offense in ((tid, True), (opp_tid, False)):
                oc = sorted(on_court[active_tid])
                if not oc:
                    continue
                l_key = tuple(oc)
                if is_offense:
                    lineup_stats[m][active_tid][l_key]["pts_for"] += pts_delta
                    lineup_stats[m][active_tid][l_key]["poss_for"] += poss_delta
                    for p in oc:
                        player_on[m][active_tid][p]["pts_for"] += pts_delta
                        player_on[m][active_tid][p]["poss_for"] += poss_delta
                    for p1, p2 in combinations(oc, 2):
                        pair_stats[m][active_tid][(p1, p2)]["pts_for"] += pts_delta
                        pair_stats[m][active_tid][(p1, p2)]["poss_for"] += poss_delta
                else:
                    lineup_stats[m][active_tid][l_key]["pts_against"] += pts_delta
                    lineup_stats[m][active_tid][l_key]["poss_against"] += poss_delta
                    for p in oc:
                        player_on[m][active_tid][p]["pts_against"] += pts_delta
                        player_on[m][active_tid][p]["poss_against"] += poss_delta
                    for p1, p2 in combinations(oc, 2):
                        pair_stats[m][active_tid][(p1, p2)]["pts_against"] += pts_delta
                        pair_stats[m][active_tid][(p1, p2)]["poss_against"] += poss_delta

        # 得分後才更新即時比數
        if pts_delta > 0:
            running_pts[tid] += pts_delta

    # 整理單場結果
    def format_side(m: str, tid: int):
        tt = team_totals[m][tid]
        t_sec = tt["sec"]
        t_pf, t_pa = tt["pts_for"], tt["pts_against"]
        t_of, t_oa = tt["poss_for"], tt["poss_against"]

        onoff_list = []
        for pid, b in player_on[m][tid].items():
            if b["sec"] <= 0:
                continue
            on_ortg = calc_rtg(b["pts_for"], b["poss_for"])
            on_drtg = calc_rtg(b["pts_against"], b["poss_against"])
            on_net = round(on_ortg - on_drtg, 1)

            off_pf = max(0, t_pf - b["pts_for"])
            off_pa = max(0, t_pa - b["pts_against"])
            off_of = max(0.0, t_of - b["poss_for"])
            off_oa = max(0.0, t_oa - b["poss_against"])
            off_ortg = calc_rtg(off_pf, off_of)
            off_drtg = calc_rtg(off_pa, off_oa)
            off_net = round(off_ortg - off_drtg, 1)
            diff_net = round(on_net - off_net, 1)

            onoff_list.append({
                "player_id": pid,
                "player_name": player_names.get(pid, str(pid)),
                "minutes_on": fmt_mmss(b["sec"]),
                "seconds_on": int(round(b["sec"])),
                "seconds_off": int(round(max(0.0, t_sec - b["sec"]))),
                "plus_minus": int(b["pts_for"] - b["pts_against"]),
                "on_pts_for": int(b["pts_for"]),
                "on_pts_against": int(b["pts_against"]),
                "on_poss_for": round(b["poss_for"], 2),
                "on_poss_against": round(b["poss_against"], 2),
                "on_ortg": on_ortg,
                "on_drtg": on_drtg,
                "on_netrtg": on_net,
                "off_ortg": off_ortg,
                "off_drtg": off_drtg,
                "off_netrtg": off_net,
                "diff_netrtg": diff_net,
            })
        onoff_list.sort(key=lambda x: (-x["diff_netrtg"], -x["seconds_on"]))

        five_list = []
        for l_key, b in lineup_stats[m][tid].items():
            if b["sec"] <= 0:
                continue
            ortg = calc_rtg(b["pts_for"], b["poss_for"])
            drtg = calc_rtg(b["pts_against"], b["poss_against"])
            net = round(ortg - drtg, 1)
            names = [player_names.get(p, str(p)) for p in l_key]
            five_list.append({
                "player_ids": list(l_key),
                "lineup_name": " / ".join(names),
                "minutes": fmt_mmss(b["sec"]),
                "seconds": int(round(b["sec"])),
                "plus_minus": int(b["pts_for"] - b["pts_against"]),
                "pts_for": int(b["pts_for"]),
                "pts_against": int(b["pts_against"]),
                "poss_for": round(b["poss_for"], 2),
                "poss_against": round(b["poss_against"], 2),
                "ortg": ortg,
                "drtg": drtg,
                "netrtg": net,
            })
        five_list.sort(key=lambda x: (-x["seconds"], -x["netrtg"]))

        two_list = []
        for (p1, p2), b in pair_stats[m][tid].items():
            if b["sec"] <= 0:
                continue
            ortg = calc_rtg(b["pts_for"], b["poss_for"])
            drtg = calc_rtg(b["pts_against"], b["poss_against"])
            net = round(ortg - drtg, 1)
            n1 = player_names.get(p1, str(p1))
            n2 = player_names.get(p2, str(p2))
            two_list.append({
                "player_ids": [p1, p2],
                "lineup_name": f"{n1} - {n2}",
                "minutes": fmt_mmss(b["sec"]),
                "seconds": int(round(b["sec"])),
                "plus_minus": int(b["pts_for"] - b["pts_against"]),
                "pts_for": int(b["pts_for"]),
                "pts_against": int(b["pts_against"]),
                "poss_for": round(b["poss_for"], 2),
                "poss_against": round(b["poss_against"], 2),
                "ortg": ortg,
                "drtg": drtg,
                "netrtg": net,
            })
        two_list.sort(key=lambda x: (-x["seconds"], -x["netrtg"]))

        return {
            "team_name": team_names[tid],
            "team_totals": {
                "seconds": int(round(t_sec)),
                "pts_for": int(t_pf),
                "pts_against": int(t_pa),
                "plus_minus": int(t_pf - t_pa),
                "poss_for": round(t_of, 2),
                "poss_against": round(t_oa, 2),
                "ortg": calc_rtg(t_pf, t_of),
                "drtg": calc_rtg(t_pa, t_oa),
                "netrtg": round(calc_rtg(t_pf, t_of) - calc_rtg(t_pa, t_oa), 1),
            },
            "player_onoff": onoff_list,
            "five_man_lineups": five_list,
            "two_man_pairs": two_list,
        }

    # 官方總分檢核
    official_away_pts = int(away_raw.get("teams", {}).get("total", {}).get("won_score") or 0)
    official_home_pts = int(home_raw.get("teams", {}).get("total", {}).get("won_score") or 0)

    return {
        "schedule_id": schedule_id,
        "away_team": a_name,
        "home_team": h_name,
        "official_away_score": official_away_pts,
        "official_home_score": official_home_pts,
        "pbp_away_score": int(running_pts[aid]),
        "pbp_home_score": int(running_pts[hid]),
        "bad_lineup_events": bad_lineup_events,
        "box_check": box_check,
        "all": {
            "away": format_side("all", aid),
            "home": format_side("all", hid),
        },
        "non_garbage": {
            "away": format_side("non_garbage", aid),
            "home": format_side("non_garbage", hid),
        },
        # 保留原始 raw buckets 供全季累加
        "_raw": {
            "team_names": team_names,
            "player_names": player_names,
            "team_totals": team_totals,
            "player_on": player_on,
            "lineup_stats": lineup_stats,
            "pair_stats": pair_stats,
        },
    }


def aggregate_teams(game_results: List[dict], import_map: Dict[Tuple[str, str], bool]) -> dict:
    modes = ("all", "non_garbage")
    season_team = {m: defaultdict(empty_bucket) for m in modes}
    season_player = {m: defaultdict(lambda: defaultdict(empty_bucket)) for m in modes}
    season_lineup = {m: defaultdict(lambda: defaultdict(empty_bucket)) for m in modes}
    season_pair = {m: defaultdict(lambda: defaultdict(empty_bucket)) for m in modes}

    def merge_bucket(dst: dict, src: dict):
        dst["sec"] += src["sec"]
        dst["pts_for"] += src["pts_for"]
        dst["pts_against"] += src["pts_against"]
        dst["poss_for"] += src["poss_for"]
        dst["poss_against"] += src["poss_against"]

    for gr in game_results:
        raw = gr["_raw"]
        t_names = raw["team_names"]
        p_names = raw["player_names"]
        for m in modes:
            for tid, std_team in t_names.items():
                merge_bucket(season_team[m][std_team], raw["team_totals"][m][tid])
                for pid, b in raw["player_on"][m][tid].items():
                    pname = p_names.get(pid, str(pid))
                    merge_bucket(season_player[m][std_team][pname], b)
                for l_key, b in raw["lineup_stats"][m][tid].items():
                    lnames = tuple(sorted(p_names.get(p, str(p)) for p in l_key))
                    merge_bucket(season_lineup[m][std_team][lnames], b)
                for (p1, p2), b in raw["pair_stats"][m][tid].items():
                    pnames_pair = tuple(sorted([p_names.get(p1, str(p1)), p_names.get(p2, str(p2))]))
                    merge_bucket(season_pair[m][std_team][pnames_pair], b)

    teams_out: Dict[str, Any] = {}
    all_teams = sorted(season_team["all"].keys())

    for std_team in all_teams:
        teams_out[std_team] = {}
        for m in modes:
            tt = season_team[m][std_team]
            t_pf, t_pa = tt["pts_for"], tt["pts_against"]
            t_of, t_oa = tt["poss_for"], tt["poss_against"]

            onoff_players = []
            for pname, b in season_player[m][std_team].items():
                if b["sec"] <= 0:
                    continue
                on_ortg = calc_rtg(b["pts_for"], b["poss_for"])
                on_drtg = calc_rtg(b["pts_against"], b["poss_against"])
                on_net = round(on_ortg - on_drtg, 1)

                off_pf = max(0, t_pf - b["pts_for"])
                off_pa = max(0, t_pa - b["pts_against"])
                off_of = max(0.0, t_of - b["poss_for"])
                off_oa = max(0.0, t_oa - b["poss_against"])
                off_net = round(calc_rtg(off_pf, off_of) - calc_rtg(off_pa, off_oa), 1)
                diff_net = round(on_net - off_net, 1)

                onoff_players.append({
                    "player_name": pname,
                    "total_time": fmt_mmss(b["sec"]),
                    "total_seconds": int(round(b["sec"])),
                    "plus_minus": int(b["pts_for"] - b["pts_against"]),
                    "on_ortg": on_ortg,
                    "on_drtg": on_drtg,
                    "on_netrtg": on_net,
                    "off_netrtg": off_net,
                    "diff_netrtg": diff_net,
                })
            onoff_players.sort(key=lambda x: (-x["diff_netrtg"], -x["total_seconds"]))

            five_man_lineups = []
            for lnames, b in season_lineup[m][std_team].items():
                if b["sec"] < 600:  # >= 10 分鐘
                    continue
                ortg = calc_rtg(b["pts_for"], b["poss_for"])
                drtg = calc_rtg(b["pts_against"], b["poss_against"])
                net = round(ortg - drtg, 1)
                d_name = " / ".join(lnames)
                t_str = fmt_mmss(b["sec"])
                pm = int(b["pts_for"] - b["pts_against"])
                five_man_lineups.append({
                    "lineup_name": d_name,
                    "name": d_name,
                    "total_time": t_str,
                    "minutes": t_str,
                    "total_seconds": int(round(b["sec"])),
                    "plus_minus": pm,
                    "pm": pm,
                    "ortg": ortg,
                    "drtg": drtg,
                    "netrtg": net,
                    "lineup_ortg": ortg,
                    "lineup_drtg": drtg,
                    "lineup_netrtg": net,
                })
            five_man_lineups.sort(key=lambda x: (-x["netrtg"], -x["total_seconds"]))

            foreign_duos = []
            for (n1, n2), b in season_pair[m][std_team].items():
                if b["sec"] <= 0:
                    continue
                if not (import_map.get((std_team, n1), False) and import_map.get((std_team, n2), False)):
                    continue
                ortg = calc_rtg(b["pts_for"], b["poss_for"])
                drtg = calc_rtg(b["pts_against"], b["poss_against"])
                net = round(ortg - drtg, 1)
                d_name = f"{n1} - {n2}"
                t_str = fmt_mmss(b["sec"])
                pm = int(b["pts_for"] - b["pts_against"])
                foreign_duos.append({
                    "duo_name": d_name,
                    "name": d_name,
                    "total_time": t_str,
                    "minutes": t_str,
                    "total_seconds": int(round(b["sec"])),
                    "plus_minus": pm,
                    "pm": pm,
                    "ortg": ortg,
                    "drtg": drtg,
                    "netrtg": net,
                    "lineup_ortg": ortg,
                    "lineup_drtg": drtg,
                    "lineup_netrtg": net,
                })
            foreign_duos.sort(key=lambda x: (-x["total_seconds"], -x["netrtg"]))

            teams_out[std_team][m] = {
                "team_totals": {
                    "seconds": int(round(tt["sec"])),
                    "pts_for": int(t_pf),
                    "pts_against": int(t_pa),
                    "plus_minus": int(t_pf - t_pa),
                    "poss_for": round(t_of, 2),
                    "poss_against": round(t_oa, 2),
                    "ortg": calc_rtg(t_pf, t_of),
                    "drtg": calc_rtg(t_pa, t_oa),
                    "netrtg": round(calc_rtg(t_pf, t_of) - calc_rtg(t_pa, t_oa), 1),
                },
                "on_off_players": onoff_players,
                "five_man_lineups": five_man_lineups,
                "foreign_duos": foreign_duos,
            }
    return teams_out


def print_game_verification(gr: dict, label: str = ""):
    sid = gr["schedule_id"]
    print("=" * 88)
    print(f"📊 驗算場次 ID {sid} {label}: {gr['away_team']} ({gr['pbp_away_score']}) @ {gr['home_team']} ({gr['pbp_home_score']})")
    print(
        f"   官方總分: {gr['official_away_score']} - {gr['official_home_score']} | "
        f"PBP累加總分: {gr['pbp_away_score']} - {gr['pbp_home_score']} | "
        f"非5人異常事件數: {gr['bad_lineup_events']}"
    )

    for side in ("away", "home"):
        sdata = gr["all"][side]
        tt = sdata["team_totals"]
        onoff = sdata["player_onoff"]
        sum_player_sec = sum(p["seconds_on"] for p in onoff)
        sum_player_pm = sum(p["plus_minus"] for p in onoff)
        expected_sec = tt["seconds"] * 5
        expected_pm = tt["plus_minus"] * 5

        print(f"\n  [{sdata['team_name']}] 隊伍總時間={tt['seconds']}s ({fmt_mmss(tt['seconds'])}) | 隊伍淨勝分={tt['plus_minus']:+d}")
        print(
            f"  [守恆檢核] Σ球員在場時間={sum_player_sec}s (預期 5×={expected_sec}s, 差={sum_player_sec - expected_sec:+d}s) | "
            f"Σ球員正負值={sum_player_pm:+d} (預期 5×={expected_pm:+d}, 差={sum_player_pm - expected_pm:+d})"
        )
        print(f"  {'球員':<10} {'時間':>6} {'On+/-':>6} {'OnORtg':>7} {'OnDRtg':>7} {'OnNet':>7} {'OffNet':>7} {'Diff':>7} | {'官方秒數/PM':>12}")
        print("  " + "-" * 82)
        for p in onoff:
            bc = gr["box_check"].get(p["player_id"], {})
            b_str = f"{bc.get('box_sec', 0)}s / {bc.get('box_pm', 0):+d}"
            print(
                f"  {p['player_name']:<10} {p['minutes_on']:>6} {p['plus_minus']:>+6d} "
                f"{p['on_ortg']:>7.1f} {p['on_drtg']:>7.1f} {p['on_netrtg']:>+7.1f} "
                f"{p['off_netrtg']:>+7.1f} {p['diff_netrtg']:>+7.1f} | {b_str:>12}"
            )


def main():
    bcast_files = sorted(RAW_DIR.glob("game_*_broadcasts.json"))
    if not bcast_files:
        print(f"❌ 找不到任何 broadcasts JSON：{RAW_DIR}")
        return

    import_map = load_import_players_from_db()
    sched_map = load_schedule_map()
    sched_used_idx: Dict[Tuple[str, str], int] = defaultdict(int)

    game_results = []
    for bp in bcast_files:
        sid = bp.name.split("_")[1]
        sp = RAW_DIR / f"game_{sid}_stats.json"
        if not sp.exists():
            continue
        stats_data = json.loads(sp.read_text(encoding="utf-8"))
        bcast_data = json.loads(bp.read_text(encoding="utf-8"))
        gr = process_game(sid, stats_data, bcast_data)

        # 嘗試對應 schedule.json 的 game_id (G01..G14)
        key = (gr["away_team"], gr["home_team"])
        idx = sched_used_idx[key]
        candidates = sched_map.get(key, [])
        if idx < len(candidates):
            gr["game_id"] = candidates[idx].get("game_id", sid)
            gr["date"] = candidates[idx].get("date", "")
            sched_used_idx[key] += 1
        else:
            gr["game_id"] = sid
            gr["date"] = ""

        game_results.append(gr)

    teams_out = aggregate_teams(game_results, import_map)

    games_out = {}
    for gr in game_results:
        clean_gr = {k: v for k, v in gr.items() if k not in ("_raw", "box_check")}
        games_out[gr["schedule_id"]] = clean_gr

    payload = {
        "meta": {
            "stage": "2026-2027 例行賽",
            "games_count": len(games_out),
            "garbage_time_rule": "Q4 <= 5:00 且分差 >= 20 分",
        },
        "games": games_out,
        "teams": teams_out,
    }

    OUT_BACKEND.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_FRONTEND.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✅ 已處理 {len(games_out)} 場比賽、{len(teams_out)} 支球隊，輸出至：")
    print(f"   - {OUT_BACKEND}")
    print(f"   - {OUT_FRONTEND}")

    # 全場次快速守恆摘要
    print("\n🔍 全場次守恆快速檢查：")
    for gr in game_results:
        score_ok = (
            gr["official_away_score"] == gr["pbp_away_score"]
            and gr["official_home_score"] == gr["pbp_home_score"]
        )
        print(
            f"  ID {gr['schedule_id']} ({gr['game_id']}): "
            f"比分一致={score_ok} ({gr['pbp_away_score']}-{gr['pbp_home_score']}) | "
            f"非5人異常={gr['bad_lineup_events']}"
        )

    # 印出 27555 與今天最新另一場 (27554) 供詳細核對
    for target_sid in ("27554", "27555"):
        for gr in game_results:
            if gr["schedule_id"] == target_sid:
                print_game_verification(gr, f"({gr['game_id']})")


if __name__ == "__main__":
    main()

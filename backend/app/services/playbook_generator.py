import json
import math
import os
import sqlite3
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

from pydantic import BaseModel, Field

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BACKEND_DIR / "data"
RAW_GAME_STATS_DIR = DATA_DIR / "raw_game_stats"
AI_TACTICAL_BOARDS_DIR = DATA_DIR / "ai_tactical_boards"
DB_PATH = DATA_DIR / "tpbl_stats.db"

YOUTUBE_LEAD_IN_SECONDS = 2


# ---------------------------------------------------------------------------
# Database Schema Migration (Idempotent)
# ---------------------------------------------------------------------------

def ensure_playbook_schema(conn: sqlite3.Connection) -> None:
    """確保 games 表的 YouTube 雙錨點欄位與 team_playbooks 表已存在。"""
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(games)")
    existing_cols = {row[1] for row in cur.fetchall()}

    if "youtube_url" not in existing_cols:
        cur.execute("ALTER TABLE games ADD COLUMN youtube_url TEXT")
    if "q1_tipoff_seconds" not in existing_cols:
        cur.execute("ALTER TABLE games ADD COLUMN q1_tipoff_seconds INTEGER")
    if "q3_tipoff_seconds" not in existing_cols:
        cur.execute("ALTER TABLE games ADD COLUMN q3_tipoff_seconds INTEGER")

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS team_playbooks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            stage TEXT NOT NULL,
            team_name TEXT NOT NULL,
            side TEXT NOT NULL CHECK(side IN ('offense', 'defense')),
            play_name TEXT NOT NULL,
            summary TEXT,
            tactical_tags TEXT,
            svg_playbook_json TEXT NOT NULL,
            source_game_id TEXT NOT NULL,
            source_quarter TEXT NOT NULL,
            source_clock TEXT NOT NULL,
            youtube_seconds INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            UNIQUE(source_game_id, team_name, side, source_quarter, source_clock)
        )
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_team_playbooks_game ON team_playbooks(source_game_id)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_team_playbooks_team ON team_playbooks(team_name, side)"
    )
    conn.commit()


# ---------------------------------------------------------------------------
# Time & Clock Helpers (Dual-Anchor Q1 + Q3, -2s lead-in)
# ---------------------------------------------------------------------------

def _parse_created_at(ts_str: Any) -> Optional[datetime]:
    if not ts_str:
        return None
    s = str(ts_str).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(s[:19], fmt)
        except ValueError:
            continue
    return None


def _quarter_label(round_num: int) -> str:
    if round_num <= 4:
        return f"Q{round_num}"
    return f"OT{round_num - 4}"


def _quarter_num_from_label(q_lbl: str) -> int:
    s = (q_lbl or "").strip().upper()
    if s.startswith("Q") and s[1:].isdigit():
        return int(s[1:])
    if s.startswith("OT") and s[2:].isdigit():
        return 4 + int(s[2:])
    return 1


def _format_clock_ms(ms: Any) -> str:
    try:
        total_sec = max(0, int(round(float(ms) / 1000.0)))
    except (TypeError, ValueError):
        return "00:00"
    mins, secs = divmod(total_sec, 60)
    return f"{mins:02d}:{secs:02d}"


def _quarter_duration_sec(round_num: int) -> float:
    return 720.0 if round_num <= 4 else 300.0


def compute_quarter_timeline(broadcasts_data: Dict[str, Any]) -> Dict[str, Any]:
    """依據 broadcasts.json 計算第一節與第三節開球真實時刻 (q1_tipoff_dt, q3_tipoff_dt)。"""
    rounds = broadcasts_data.get("rounds") or []
    sorted_rounds = sorted(
        [rd for rd in rounds if isinstance(rd, dict) and rd.get("events")],
        key=lambda r: int(r.get("round") or 0),
    )
    if not sorted_rounds:
        return {"q1_tipoff_dt": None, "q3_tipoff_dt": None}

    q1_tipoff_dt: Optional[datetime] = None
    q3_tipoff_dt: Optional[datetime] = None

    for rd in sorted_rounds:
        r_num = int(rd.get("round") or 1)
        q_len = _quarter_duration_sec(r_num)
        events = rd.get("events") or []

        parsed_events: List[Tuple[datetime, Dict[str, Any]]] = []
        for ev in events:
            dt = _parse_created_at(ev.get("created_at"))
            if dt is not None:
                parsed_events.append((dt, ev))

        if not parsed_events:
            continue

        first_play = None
        for dt, ev in parsed_events:
            ev_type = str(ev.get("event_type") or "")
            q_ms = float(ev.get("event_quarter_time") or q_len * 1000.0)
            if ev_type != "Rotation" or q_ms < q_len * 1000.0:
                first_play = (dt, q_ms)
                break

        if first_play is not None:
            dt0, q_ms0 = first_play
            elapsed_in_q = max(0.0, q_len - q_ms0 / 1000.0)
            q_start_dt = dt0 - timedelta(seconds=elapsed_in_q)
        else:
            q_start_dt = min(dt for dt, _ in parsed_events)

        if r_num == 1 or q1_tipoff_dt is None:
            q1_tipoff_dt = q_start_dt
        if r_num == 3:
            q3_tipoff_dt = q_start_dt

    return {"q1_tipoff_dt": q1_tipoff_dt, "q3_tipoff_dt": q3_tipoff_dt}


def calc_youtube_seconds_for_event(
    timeline: Dict[str, Any],
    q1_tipoff_seconds: Optional[int],
    quarter_label: str,
    event_created_at: Optional[str],
    q3_tipoff_seconds: Optional[int] = None,
    event_quarter_time_ms: Optional[float] = None,
    lead_in: int = YOUTUBE_LEAD_IN_SECONDS,
) -> Optional[int]:
    ev_dt = _parse_created_at(event_created_at)
    q_num = _quarter_num_from_label(quarter_label)
    q_len = _quarter_duration_sec(q_num)

    if q_num >= 3 and q3_tipoff_seconds is not None and timeline.get("q3_tipoff_dt") is not None:
        anchor_dt = timeline["q3_tipoff_dt"]
        anchor_sec = float(q3_tipoff_seconds)
        base_q = 3
    elif q1_tipoff_seconds is not None and timeline.get("q1_tipoff_dt") is not None:
        anchor_dt = timeline["q1_tipoff_dt"]
        anchor_sec = float(q1_tipoff_seconds)
        base_q = 1
    else:
        return None

    elapsed_sec: Optional[float] = None
    if ev_dt is not None:
        diff = (ev_dt - anchor_dt).total_seconds()
        if diff >= 0:
            elapsed_sec = diff

    if elapsed_sec is None:
        if event_quarter_time_ms is not None:
            rem_sec = max(0.0, float(event_quarter_time_ms) / 1000.0)
            elapsed_in_q = max(0.0, q_len - rem_sec)
            completed_qs = max(0, q_num - base_q)
            elapsed_sec = completed_qs * 720.0 + elapsed_in_q
        else:
            elapsed_sec = 0.0

    return max(0, int(round(anchor_sec + elapsed_sec - lead_in)))


def lookup_event_youtube_seconds(
    broadcasts_data: Dict[str, Any],
    q1_tipoff_seconds: Optional[int],
    source_quarter: str,
    source_clock: str,
    q3_tipoff_seconds: Optional[int] = None,
) -> Optional[int]:
    """依據 quarter + clock 反查 broadcasts.json 內對應事件的 YouTube 跳轉秒數。"""
    if q1_tipoff_seconds is None and q3_tipoff_seconds is None:
        return None
    timeline = compute_quarter_timeline(broadcasts_data)
    rounds = broadcasts_data.get("rounds") or []
    for rd in rounds:
        if not isinstance(rd, dict):
            continue
        r_num = int(rd.get("round") or 0)
        if _quarter_label(r_num) != source_quarter:
            continue
        for ev in rd.get("events") or []:
            if _format_clock_ms(ev.get("event_quarter_time")) == source_clock:
                yt_sec = calc_youtube_seconds_for_event(
                    timeline,
                    q1_tipoff_seconds,
                    source_quarter,
                    ev.get("created_at"),
                    q3_tipoff_seconds=q3_tipoff_seconds,
                    event_quarter_time_ms=ev.get("event_quarter_time"),
                )
                if yt_sec is not None:
                    return yt_sec
    return None


# ---------------------------------------------------------------------------
# PBP Theme Aggregation & Related Plays Extraction (4 Core Systems)
# ---------------------------------------------------------------------------

def _position_rank(pos_str: str) -> int:
    s = (pos_str or "").lower()
    if "pointguard" in s and "shooting" not in s:
        return 1
    if "pointguard" in s or "shootingguard" in s:
        return 2
    if "smallforward" in s or ("forward" in s and "power" not in s):
        return 3
    if "powerforward" in s:
        return 4
    if "center" in s:
        return 5
    return 3


def _team_matches(ev_team: str, target_team: str) -> bool:
    if not ev_team or not target_team:
        return False
    return ev_team == target_team or ev_team in target_team or target_team in ev_team


def _calc_related_play_youtube_seconds(
    events: List[Dict[str, Any]],
    idx: int,
    offense_team_name: str,
    t_ev_yt: Optional[int],
    timeline: Dict[str, Any],
    q1_tipoff_seconds: Optional[int],
    quarter_label: str,
    q3_tipoff_seconds: Optional[int] = None,
) -> Optional[int]:
    """
    計算 related_plays 的預設 YouTube 起跳秒數：
    若往前 12 秒內可追溯到同波球權起點（籃板、抄截、發球/失誤/暫停等），
    以起點事件時間減 2 秒為準；否則（半場陣地戰或無同波起點）將終結事件時間往前推 7 秒。
    """
    if t_ev_yt is None:
        return None

    ev_ms = float(events[idx].get("event_quarter_time") or 0)
    for j in range(idx - 1, -1, -1):
        prev_ev = events[j]
        prev_ms = float(prev_ev.get("event_quarter_time") or 0)
        diff_ms = prev_ms - ev_ms
        if diff_ms > 12_000:
            break
        if diff_ms < 0:
            continue

        p_type = str(prev_ev.get("event_type") or "")
        p_out = str(prev_ev.get("event_outcome") or "")
        if p_type in ("Rotation", "Assist"):
            continue

        p_team = str(((prev_ev.get("team") or {}).get("name")) or "")
        is_off_team = _team_matches(p_team, offense_team_name)
        is_possession_start = (
            (p_type in ("Rebound", "Steal") and is_off_team)
            or p_type == "Inbound"
            or (
                p_type in ("TwoPointer", "ThreePointer", "FreeThrow")
                and p_out in ("Made", "AndOne")
                and not is_off_team
            )
            or (p_type == "Turnover" and not is_off_team)
            or p_type == "Timeout"
        )
        if is_possession_start:
            t_start_yt = calc_youtube_seconds_for_event(
                timeline,
                q1_tipoff_seconds,
                quarter_label,
                prev_ev.get("created_at"),
                q3_tipoff_seconds=q3_tipoff_seconds,
                event_quarter_time_ms=prev_ms,
                lead_in=0,
            )
            if t_start_yt is not None and 0 <= (t_ev_yt - t_start_yt) <= 20:
                return max(0, t_start_yt - 2)
            break

    return max(0, t_ev_yt - 7)


def extract_team_tactical_themes(
    broadcasts_data: Dict[str, Any],
    home_team: str,
    away_team: str,
    q1_tipoff_seconds: Optional[int] = None,
    q3_tipoff_seconds: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    統計本場主客隊 PBP 進攻得分與防守成功模式，各自提煉 1 套核心進攻體系與 1 套核心防守體系（共 4 套），
    並篩選 1~3 筆真實 PBP 關聯實戰案例 (related_plays) 與雙方本場真實出賽 5 人名單。
    """
    timeline = compute_quarter_timeline(broadcasts_data)
    rounds = sorted(
        [rd for rd in (broadcasts_data.get("rounds") or []) if isinstance(rd, dict)],
        key=lambda r: int(r.get("round") or 0),
    )

    # 追蹤每回合發生當下場上精確 5v5 名單
    on_court: Dict[str, Dict[str, Dict[str, Any]]] = {"home": {}, "away": {}}
    # 統計雙方本場真實出賽球員 (嚴禁未登錄球員)
    played_players: Dict[str, Dict[str, Dict[str, Any]]] = {"home": {}, "away": {}}
    # 統計主導類型計數與關聯回合
    offense_buckets: Dict[str, Dict[str, List[Dict[str, Any]]]] = {
        "home": {"assisted_three": [], "paint_attack": [], "mid_pullup": []},
        "away": {"assisted_three": [], "paint_attack": [], "mid_pullup": []},
    }
    defense_buckets: Dict[str, Dict[str, List[Dict[str, Any]]]] = {
        "home": {"steal_transition": [], "rim_protection": [], "ball_pressure": []},
        "away": {"steal_transition": [], "rim_protection": [], "ball_pressure": []},
    }

    def _snapshot_5(side_key: str) -> Optional[List[Dict[str, str]]]:
        m = on_court[side_key]
        if len(m) != 5:
            return None
        ordered = sorted(
            m.values(),
            key=lambda p: (_position_rank(p.get("pos", "")), p.get("height", 190), p.get("name", "")),
        )
        return [{"name": p["name"], "number": p.get("number", "")} for p in ordered]

    for rd in rounds:
        r_num = int(rd.get("round") or 1)
        q_lbl = _quarter_label(r_num)
        q_len_ms = _quarter_duration_sec(r_num) * 1000.0
        events = sorted(
            rd.get("events") or [],
            key=lambda e: (
                -float(e.get("event_quarter_time") or 0),
                int(e.get("order") or 0),
            ),
        )

        has_quarter_starters = any(
            str(e.get("event_type") or "") == "Rotation"
            and str(e.get("event_outcome") or "") == "Entering"
            and float(e.get("event_quarter_time") or 0) >= q_len_ms - 1000
            for e in events
        )
        if has_quarter_starters:
            on_court = {"home": {}, "away": {}}

        for idx, ev in enumerate(events):
            ev_type = str(ev.get("event_type") or "")
            ev_outcome = str(ev.get("event_outcome") or "")
            ev_team_name = str(((ev.get("team") or {}).get("name")) or "")
            player_obj = ev.get("player") or {}
            p_name = str(player_obj.get("name") or "").strip()
            p_num = str(player_obj.get("number") or "").strip()
            p_meta = player_obj.get("meta") or {}

            team_side = "home" if _team_matches(ev_team_name, home_team) else ("away" if _team_matches(ev_team_name, away_team) else "")
            if not team_side or not p_name:
                continue

            # 紀錄真實出賽球員與活躍度
            if p_name not in played_players[team_side]:
                played_players[team_side][p_name] = {
                    "name": p_name,
                    "number": p_num,
                    "pos": str(p_meta.get("position") or ""),
                    "height": int(p_meta.get("height") or 190),
                    "count": 0,
                }
            played_players[team_side][p_name]["count"] += 1

            if ev_type == "Rotation":
                if ev_outcome == "Entering":
                    on_court[team_side][p_name] = {
                        "name": p_name,
                        "number": p_num,
                        "pos": str(p_meta.get("position") or ""),
                        "height": int(p_meta.get("height") or 190),
                    }
                elif ev_outcome == "Leaving":
                    on_court[team_side].pop(p_name, None)
                continue

            q_ms = float(ev.get("event_quarter_time") or 0)
            clk_str = _format_clock_ms(q_ms)
            t_ev_yt = calc_youtube_seconds_for_event(
                timeline, q1_tipoff_seconds, q_lbl, ev.get("created_at"), q3_tipoff_seconds=q3_tipoff_seconds, event_quarter_time_ms=q_ms, lead_in=0
            )
            snap_home = _snapshot_5("home")
            snap_away = _snapshot_5("away")

            # 1) 進攻模式分類
            if ev_type in ("ThreePointer", "TwoPointer") and ev_outcome in ("Made", "AndOne"):
                shoot_act = str(ev.get("shoot_action_translation") or ev.get("shoot_action") or "").strip()
                assist_player = ""
                for adj_idx in (idx - 1, idx + 1):
                    if 0 <= adj_idx < len(events):
                        adj = events[adj_idx]
                        if str(adj.get("event_type") or "") == "Assist" and _team_matches(str(((adj.get("team") or {}).get("name")) or ""), ev_team_name):
                            assist_player = str(((adj.get("player") or {}).get("name")) or "").strip()
                            break

                type_zh = "三分球" if ev_type == "ThreePointer" else "兩分球"
                act_zh = f"{shoot_act}" if shoot_act else ""
                ast_zh = f"（{assist_player} 助攻）" if assist_player else ""
                desc = f"{p_name} {act_zh}{type_zh}命中{ast_zh}"

                start_yt = max(0, t_ev_yt - 8) if t_ev_yt is not None else None
                end_yt = (t_ev_yt + 2) if t_ev_yt is not None else None
                yt_jump = _calc_related_play_youtube_seconds(
                    events, idx, ev_team_name, t_ev_yt, timeline, q1_tipoff_seconds, q_lbl, q3_tipoff_seconds
                )

                item = {
                    "quarter": q_lbl,
                    "game_clock": clk_str,
                    "description": desc,
                    "youtube_seconds": yt_jump,
                    "start_youtube_sec": start_yt,
                    "end_youtube_sec": end_yt,
                    "on_court_home": snap_home,
                    "on_court_away": snap_away,
                    "score": (10.0 if assist_player else 5.0) + (3.0 if r_num >= 3 else 0.0) + (5.0 if (snap_home and snap_away) else 0.0),
                }

                if ev_type == "ThreePointer" and assist_player:
                    offense_buckets[team_side]["assisted_three"].append(item)
                elif any(k in shoot_act for k in ("上籃", "灌籃", "勾射", "補籃", "拋投", "Layup", "Dunk")):
                    offense_buckets[team_side]["paint_attack"].append(item)
                else:
                    offense_buckets[team_side]["mid_pullup"].append(item)

            # 2) 防守模式分類
            elif ev_type in ("Steal", "Block"):
                def_act = "抄截成功" if ev_type == "Steal" else "阻攻封阻"
                fb_desc = ""
                end_yt = (t_ev_yt + 3) if t_ev_yt is not None else None
                bonus = 0.0
                for j in range(idx + 1, min(len(events), idx + 7)):
                    nxt = events[j]
                    nxt_ms = float(nxt.get("event_quarter_time") or 0)
                    if q_ms - nxt_ms > 10_000 or q_ms - nxt_ms < 0:
                        break
                    nxt_team = str(((nxt.get("team") or {}).get("name")) or "")
                    if _team_matches(nxt_team, ev_team_name) and str(nxt.get("event_type") or "") in ("TwoPointer", "ThreePointer") and str(nxt.get("event_outcome") or "") in ("Made", "AndOne"):
                        nxt_p = str(((nxt.get("player") or {}).get("name")) or "").strip()
                        nxt_t = "三分" if nxt.get("event_type") == "ThreePointer" else "快攻得分"
                        fb_desc = f"，隨即反擊由 {nxt_p} {nxt_t}"
                        t_fb_yt = calc_youtube_seconds_for_event(
                            timeline, q1_tipoff_seconds, q_lbl, nxt.get("created_at"), q3_tipoff_seconds=q3_tipoff_seconds, event_quarter_time_ms=nxt_ms, lead_in=0
                        )
                        if t_fb_yt is not None:
                            end_yt = t_fb_yt + 2
                        bonus = 6.0
                        break

                desc = f"{p_name} {def_act}{fb_desc}"
                start_yt = max(0, t_ev_yt - 5) if t_ev_yt is not None else None
                opp_team_name = away_team if team_side == "home" else home_team
                yt_jump = _calc_related_play_youtube_seconds(
                    events, idx, opp_team_name, t_ev_yt, timeline, q1_tipoff_seconds, q_lbl, q3_tipoff_seconds
                )

                item = {
                    "quarter": q_lbl,
                    "game_clock": clk_str,
                    "description": desc,
                    "youtube_seconds": yt_jump,
                    "start_youtube_sec": start_yt,
                    "end_youtube_sec": end_yt,
                    "on_court_home": snap_home,
                    "on_court_away": snap_away,
                    "score": 10.0 + bonus + (3.0 if r_num >= 3 else 0.0) + (5.0 if (snap_home and snap_away) else 0.0),
                }
                if ev_type == "Steal":
                    defense_buckets[team_side]["steal_transition"].append(item)
                else:
                    defense_buckets[team_side]["rim_protection"].append(item)

            elif ev_type == "Turnover" and ev_outcome in ("OffensiveFoul", "BadPass", "BallHandling", "Travel", "ThreeSeconds"):
                def_side = "away" if team_side == "home" else "home"
                out_zh = str(ev.get("event_outcome_translation") or ev_outcome)
                desc = f"迫使對手 {p_name} 發生{out_zh}"
                start_yt = max(0, t_ev_yt - 5) if t_ev_yt is not None else None
                end_yt = (t_ev_yt + 3) if t_ev_yt is not None else None
                yt_jump = _calc_related_play_youtube_seconds(
                    events, idx, ev_team_name, t_ev_yt, timeline, q1_tipoff_seconds, q_lbl, q3_tipoff_seconds
                )
                defense_buckets[def_side]["ball_pressure"].append({
                    "quarter": q_lbl,
                    "game_clock": clk_str,
                    "description": desc,
                    "youtube_seconds": yt_jump,
                    "start_youtube_sec": start_yt,
                    "end_youtube_sec": end_yt,
                    "on_court_home": snap_home,
                    "on_court_away": snap_away,
                    "score": 8.0 + (2.0 if r_num >= 3 else 0.0) + (5.0 if (snap_home and snap_away) else 0.0),
                })

    # 選出各隊真實核心 5 人先發/主力輪換名單 (100% 來自本場出賽名單)
    rosters_5: Dict[str, List[Dict[str, str]]] = {}
    for side_key in ("home", "away"):
        top_active = sorted(
            played_players[side_key].values(),
            key=lambda p: p["count"],
            reverse=True,
        )[:5]
        ordered = sorted(
            top_active,
            key=lambda p: (_position_rank(p.get("pos", "")), p.get("height", 190), p.get("name", "")),
        )
        rosters_5[side_key] = [{"name": p["name"], "number": p.get("number", "")} for p in ordered]

    OFFENSE_THEME_LABELS = {
        "assisted_three": "高位擋拆／突分外線導傳體系 (Drive & Kick / PnR 3PT)",
        "paint_attack": "強側突破與禁區空切終結體系 (Paint Attack & Rim Pressure)",
        "mid_pullup": "擋拆中距離與單打節奏體系 (PnR Pull-up & Isolation)",
    }
    DEFENSE_THEME_LABELS = {
        "steal_transition": "壓迫持球抄截與快速轉換反擊體系 (Ball Pressure & Transition)",
        "rim_protection": "禁區協防護框與防守籃板轉換體系 (Rim Protection & Outlet)",
        "ball_pressure": "外圍換防阻絕與製造對手失誤體系 (Switching & Forced TOV)",
    }

    systems: List[Dict[str, Any]] = []
    for t_side in ("home", "away"):
        team_name = home_team if t_side == "home" else away_team
        opp_name = away_team if t_side == "home" else home_team
        opp_side = "away" if t_side == "home" else "home"

        # 進攻主軸
        off_dict = offense_buckets[t_side]
        best_off_key = max(off_dict.keys(), key=lambda k: len(off_dict[k]))
        off_plays = sorted(off_dict[best_off_key], key=lambda x: x["score"], reverse=True)[:3]
        if not off_plays:
            all_off = [it for lst in off_dict.values() for it in lst]
            off_plays = sorted(all_off, key=lambda x: x["score"], reverse=True)[:3]

        if off_plays:
            lead = off_plays[0]
            h_roster = lead.get("on_court_home") or rosters_5["home"]
            a_roster = lead.get("on_court_away") or rosters_5["away"]
            off_r = h_roster if t_side == "home" else a_roster
            def_r = a_roster if t_side == "home" else h_roster
            systems.append({
                "slot_key": f"{t_side}_offense",
                "team_side": t_side,
                "team_name": team_name,
                "opponent_team": opp_name,
                "side": "offense",
                "theme_hint": OFFENSE_THEME_LABELS[best_off_key],
                "pattern_counts": {k: len(v) for k, v in off_dict.items()},
                "offense_roster_detail": off_r,
                "defense_roster_detail": def_r,
                "offense_roster": [x["name"] for x in off_r],
                "defense_roster": [x["name"] for x in def_r],
                "related_plays": off_plays,
            })

        # 防守主軸
        def_dict = defense_buckets[t_side]
        best_def_key = max(def_dict.keys(), key=lambda k: len(def_dict[k]))
        def_plays = sorted(def_dict[best_def_key], key=lambda x: x["score"], reverse=True)[:3]
        if not def_plays:
            all_def = [it for lst in def_dict.values() for it in lst]
            def_plays = sorted(all_def, key=lambda x: x["score"], reverse=True)[:3]

        if def_plays:
            lead = def_plays[0]
            h_roster = lead.get("on_court_home") or rosters_5["home"]
            a_roster = lead.get("on_court_away") or rosters_5["away"]
            off_r = a_roster if t_side == "home" else h_roster
            def_r = h_roster if t_side == "home" else a_roster
            systems.append({
                "slot_key": f"{t_side}_defense",
                "team_side": t_side,
                "team_name": team_name,
                "opponent_team": opp_name,
                "side": "defense",
                "theme_hint": DEFENSE_THEME_LABELS[best_def_key],
                "pattern_counts": {k: len(v) for k, v in def_dict.items()},
                "offense_roster_detail": off_r,
                "defense_roster_detail": def_r,
                "offense_roster": [x["name"] for x in off_r],
                "defense_roster": [x["name"] for x in def_r],
                "related_plays": def_plays,
            })

    return systems


# ---------------------------------------------------------------------------
# Textbook SVG Tactical System Schema + Generation
# ---------------------------------------------------------------------------

class PbpTacticalPathModel(BaseModel):
    from_pos: List[float]
    to_pos: List[float]
    type: Literal["dribble", "screen", "pass", "defense"]


class PbpTacticalPhaseModel(BaseModel):
    title: str
    description: str
    keyRead: str
    ballPos: List[float]
    offense: List[List[float]]
    defense: List[List[float]]
    paths: List[PbpTacticalPathModel]


class BallFrameModel(BaseModel):
    t: float = Field(ge=0.0, le=2.0, description="時間進度 0.0~2.0")
    pos: List[float]
    inAir: bool = False
    isShot: bool = False


class TacticalSystemModel(BaseModel):
    play_name: str = Field(..., description="精煉繁體中文戰術體系名稱（如：高位擋拆外線分球、抄截轉換快攻）")
    tactical_pattern: Optional[str] = Field(
        default=None,
        description="明確辨識出的標準戰術名稱，如「高位擋拆 (Pick & Roll)」、「雙高弧頂掩護 (Horns)」、「西班牙擋拆 (Spain PnR)」、「底線雙掩護 (Stagger)」、「手遞手傳球 (DHO)」、「強弱側轉移 (Skip Pass)」、「抄截轉換快攻 (Transition)」、「區域聯防輪轉」",
    )
    summary: str = Field(..., description="戰術核心機制與本場執行特色簡述（1-2 句，可使用 {O1}~{O5} 與 {D1}~{D5}）")
    tactical_tags: List[str]
    phases: List[PbpTacticalPhaseModel]
    ballFrames: Optional[List[BallFrameModel]] = None


def _clamp_pt(pt: List[float]) -> List[int]:
    if not isinstance(pt, (list, tuple)) or len(pt) < 2:
        return [250, 220]
    x = max(40, min(460, int(round(float(pt[0])))))
    y = max(70, min(430, int(round(float(pt[1])))))
    return [x, y]


def _normalize_phase(phase: PbpTacticalPhaseModel) -> Dict[str, Any]:
    off = [_clamp_pt(p) for p in phase.offense[:5]]
    while len(off) < 5:
        off.append([250, 200])
    dfn = [_clamp_pt(p) for p in phase.defense[:5]]
    while len(dfn) < 5:
        dfn.append([250, 245])
    paths = [
        {"from": _clamp_pt(p.from_pos), "to": _clamp_pt(p.to_pos), "type": p.type}
        for p in phase.paths
    ]
    return {
        "title": phase.title,
        "description": phase.description,
        "keyRead": phase.keyRead,
        "ballPos": _clamp_pt(phase.ballPos),
        "offense": off,
        "defense": dfn,
        "paths": paths,
    }


def _enforce_defensive_positioning(phases: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    籃球防守幾何校正防呆（對齊 Preview 半場座標系，籃框 [250, 407]）：
    防守者 D_i 必須卡在進攻者 O_i 與籃框 (250, 407) 之間。
    若 (D_i - O_i) · u <= 0，自動將 D_i 修正至 O_i + 34 * u（約 34px 合理防守間距）。
    """
    rx, ry = 250.0, 407.0
    for ph in phases:
        off = ph.get("offense") or []
        dfn = ph.get("defense") or []
        for i in range(min(len(off), len(dfn))):
            ox, oy = float(off[i][0]), float(off[i][1])
            dx, dy = float(dfn[i][0]), float(dfn[i][1])
            vx, vy = rx - ox, ry - oy
            dist = math.hypot(vx, vy)
            if dist <= 12.0:
                continue
            ux, uy = vx / dist, vy / dist
            dot = (dx - ox) * ux + (dy - oy) * uy
            if dot <= 0.0:
                new_dx = ox + 34.0 * ux
                new_dy = oy + 34.0 * uy
                dfn[i] = _clamp_pt([new_dx, new_dy])
    return phases


def _generate_single_system_with_gemini(
    client: Any,
    chosen_model: str,
    sys_info: Dict[str, Any],
    stage: str,
    source_game_id: str,
    home_team: str,
    away_team: str,
    youtube_url: str,
) -> TacticalSystemModel:
    from google.genai import types
    from app.services.scouting_generator import _strip_json_markdown_fences

    off_map = [
        f"{{O{i+1}}}: #{x['number']} {x['name']}" if x.get("number") else f"{{O{i+1}}}: {x['name']}"
        for i, x in enumerate(sys_info["offense_roster_detail"])
    ]
    def_map = [
        f"{{D{i+1}}}: #{x['number']} {x['name']}" if x.get("number") else f"{{D{i+1}}}: {x['name']}"
        for i, x in enumerate(sys_info["defense_roster_detail"])
    ]

    system_instruction = (
        "你是 TPBL 臺灣職業籃球大聯盟首席進階數據球探與戰術分析師，請使用繁體中文產出一套標準化、視覺流暢的戰術教科書 SVG 分鏡（完全對齊 Weekly Preview 戰術板規格）。\n"
        "【嚴格空間座標、佔位符動態綁定與動作一致性規範】：\n"
        "1. 必須嚴格基於本場真實 PBP 統計模式與關聯實戰案例（若有提供 YouTube 實戰片段請觀看確認實際套路名稱），提煉該隊本場最具代表性的進攻或防守戰術體系。\n"
        "2. 必須產出剛好 3 個 phases（啟動落位 -> 掩護/包夾施壓 -> 傳球轉移與輪轉終結），座標範圍為標準戰術板 x: [40..460], y: [70..430]（籃框在 [250, 407]，三分線弧頂約 [250, 203]，左右底角約 [55, 405] 與 [445, 405]）。paths.type 只能是 dribble、screen、pass、defense 之一。\n"
        "3. 防守者（defense[0..4]）必須永遠卡在對應進攻者（offense[0..4]）與籃框 [250, 407] 之間（即靠近籃框一側，保持約 30~40 單位合理防守間距），嚴禁站在進攻者身後。\n"
        "4. 場上 10 名球員（offense[0..4] 與 defense[0..4]）任兩名球員距離不得過近重疊（彼此保持合理籃球站位間距）。\n"
        "5. 嚴禁在任何 play_name、summary、title、description、keyRead 文案中輸出像素數值（例如 28px、32px）或座標代碼，一律使用純粹的籃球專業術語。\n"
        "6. 在戰術文案中優先使用佔位符 {O1}～{O5}（代表進攻方 1～5 號位）與 {D1}～{D5}（代表防守方 1～5 號位）來指代輸入提供的本場真實出賽球員，嚴禁出現任何未登錄球員姓名。\n"
        "7. 若描述雙人包夾某位特定球員（例如 {O2}），兩名防守者在階段 2 的座標必須真正移動至 offense[1] 左右 45 度角合圍；若描述弱側內縮漏出底角空檔，弱側防守者座標必須真正移動至油漆區邊緣並留出底角射手空檔。\n"
        "8. 必須同步產出 ballFrames（t 範圍 0.0~2.0），包含傳球飛行時間窗（inAir: true）與最終接球出手軌跡（isShot: true）。"
    )

    lead_play = sys_info["related_plays"][0] if sys_info["related_plays"] else {}
    context = {
        "game": f"{stage} {source_game_id} ({away_team} @ {home_team})",
        "team_analyzed": sys_info["team_name"],
        "side": sys_info["side"],
        "pbp_dominant_theme": sys_info["theme_hint"],
        "pbp_pattern_counts": sys_info["pattern_counts"],
        "offense_roster_O1_to_O5": off_map,
        "defense_roster_D1_to_D5": def_map,
        "related_pbp_examples": [
            {
                "time": f"{rp['quarter']} {rp['game_clock']}",
                "description": rp["description"],
            }
            for rp in sys_info["related_plays"]
        ],
    }

    user_prompt = (
        f"請為 {sys_info['team_name']} 繪製本場最具代表性的「{'進攻戰術體系' if sys_info['side'] == 'offense' else '防守反制體系'}」標準教科書 3 階段全場 SVG JSON：\n\n"
        + json.dumps(context, ensure_ascii=False)
    )

    contents: Any = user_prompt
    start_sec = lead_play.get("start_youtube_sec")
    end_sec = lead_play.get("end_youtube_sec")
    if youtube_url and start_sec is not None and end_sec is not None:
        video_part = types.Part(
            file_data=types.FileData(file_uri=youtube_url),
            video_metadata=types.VideoMetadata(
                start_offset=f"{start_sec}s",
                end_offset=f"{end_sec}s",
            ),
        )
        contents = [
            video_part,
            f"請先觀看這段代表性實戰片段（{lead_play.get('quarter')} {lead_play.get('game_clock')}，{start_sec}s~{end_sec}s）確認實際使用的戰術套路名稱，再產出標準化戰術教科書 JSON：\n\n"
            + user_prompt,
        ]

    last_err: Optional[Exception] = None
    response = None
    for attempt in range(2):
        try:
            response = client.models.generate_content(
                model=chosen_model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    response_schema=TacticalSystemModel,
                    temperature=0.25,
                ),
            )
            break
        except Exception as exc:
            last_err = exc
            if attempt == 0 and any(
                k in type(exc).__name__.lower() or k in str(exc).lower()
                for k in ("remoteprotocol", "disconnect", "timeout", "connection")
            ):
                continue
            raise
    if response is None and last_err is not None:
        raise last_err

    parsed_obj = getattr(response, "parsed", None)
    if isinstance(parsed_obj, TacticalSystemModel):
        return parsed_obj
    if isinstance(parsed_obj, dict):
        return TacticalSystemModel.model_validate(parsed_obj)
    raw_text = _strip_json_markdown_fences(getattr(response, "text", None) or "")
    return TacticalSystemModel.model_validate(json.loads(raw_text))


def generate_and_save_pbp_playbooks(
    conn: sqlite3.Connection,
    game_row: Dict[str, Any],
    schedule_id: int,
    broadcasts_data: Dict[str, Any],
    q1_tipoff_seconds: Optional[int],
    q3_tipoff_seconds: Optional[int] = None,
    model_name: str = "",
    youtube_url: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    每場精煉「4 套核心戰術體系」（主隊 1 攻 1 守、客隊 1 攻 1 守），
    結合標準化橫向全場戰術教科書 SVG 與本場關聯實戰影片片段連結 (related_plays)，自動寫入 team_playbooks。
    """
    ensure_playbook_schema(conn)

    home_team = str(game_row["home_team"])
    away_team = str(game_row["away_team"])
    stage = str(game_row["stage"])
    source_game_id = str(game_row["id"])
    effective_yt_url = (youtube_url or game_row.get("youtube_url") or "").strip()

    systems = extract_team_tactical_themes(
        broadcasts_data=broadcasts_data,
        home_team=home_team,
        away_team=away_team,
        q1_tipoff_seconds=q1_tipoff_seconds,
        q3_tipoff_seconds=q3_tipoff_seconds,
    )

    cur = conn.cursor()
    if not systems:
        cur.execute("DELETE FROM team_playbooks WHERE source_game_id = ?", (source_game_id,))
        conn.commit()
        return []

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("伺服器尚未設定 GEMINI_API_KEY 環境變數，無法生成戰術板。")

    from google import genai
    from google.genai import types
    from app.services.scouting_generator import select_best_gemini_model

    client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=180_000))
    chosen_model = (model_name or "").strip().replace("models/", "") or select_best_gemini_model(client)

    ai_results: Dict[str, TacticalSystemModel] = {}
    with ThreadPoolExecutor(max_workers=4) as executor:
        future_map = {
            executor.submit(
                _generate_single_system_with_gemini,
                client,
                chosen_model,
                sys_info,
                stage,
                source_game_id,
                home_team,
                away_team,
                effective_yt_url,
            ): sys_info["slot_key"]
            for sys_info in systems
        }
        for fut in as_completed(future_map):
            slot_key = future_map[fut]
            ai_results[slot_key] = fut.result()

    saved_rows: List[Dict[str, Any]] = []
    keep_keys = set()

    for sys_info in systems:
        slot_key = sys_info["slot_key"]
        ai_item = ai_results.get(slot_key)
        if not ai_item or len(ai_item.phases) != 3:
            continue

        is_home_offense = (
            (sys_info["team_side"] == "home" and sys_info["side"] == "offense")
            or (sys_info["team_side"] == "away" and sys_info["side"] == "defense")
        )
        side_label = "進攻體系" if sys_info["side"] == "offense" else "防守體系"
        tab_label = f"{sys_info['team_name']} {side_label}"

        lead_play = sys_info["related_plays"][0]
        clean_related = [
            {
                "quarter": rp["quarter"],
                "game_clock": rp["game_clock"],
                "description": rp["description"],
                "youtube_seconds": rp["youtube_seconds"] if effective_yt_url else None,
            }
            for rp in sys_info["related_plays"]
        ]

        tactical_pattern = (ai_item.tactical_pattern or "").strip() or None
        tags = list(ai_item.tactical_tags or [])
        if tactical_pattern and tactical_pattern not in tags:
            tags.insert(0, tactical_pattern)

        phases_norm = _enforce_defensive_positioning([_normalize_phase(ph) for ph in ai_item.phases[:3]])
        ball_frames_norm = [
            {
                "t": max(0.0, min(2.0, round(float(bf.t), 3))),
                "pos": _clamp_pt(bf.pos),
                "inAir": bool(bf.inAir),
                "isShot": bool(bf.isShot),
            }
            for bf in (ai_item.ballFrames or [])
        ]
        svg_payload = {
            "key": slot_key,
            "label": tab_label,
            "playName": ai_item.play_name,
            "tacticalGoal": ai_item.summary,
            "tacticalPattern": tactical_pattern,
            "offenseTeam": "home" if is_home_offense else "away",
            "side": sys_info["side"],
            "teamName": sys_info["team_name"],
            "sourceQuarter": lead_play["quarter"],
            "sourceClock": lead_play["game_clock"],
            "youtubeSeconds": lead_play["youtube_seconds"] if effective_yt_url else None,
            "relatedPlays": clean_related,
            "tacticalTags": tags,
            "offenseRoster": sys_info["offense_roster"],
            "defenseRoster": sys_info["defense_roster"],
            "phases": phases_norm,
            **({"ballFrames": ball_frames_norm} if len(ball_frames_norm) >= 2 else {}),
        }

        tags_json = json.dumps(tags, ensure_ascii=False)
        svg_json = json.dumps(svg_payload, ensure_ascii=False)

        dedup_tuple = (
            source_game_id,
            sys_info["team_name"],
            sys_info["side"],
            lead_play["quarter"],
            lead_play["game_clock"],
        )
        keep_keys.add(dedup_tuple)

        cur.execute(
            """
            INSERT INTO team_playbooks (
                stage, team_name, side, play_name, summary, tactical_tags,
                svg_playbook_json, source_game_id, source_quarter, source_clock, youtube_seconds
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_game_id, team_name, side, source_quarter, source_clock)
            DO UPDATE SET
                stage = excluded.stage,
                play_name = excluded.play_name,
                summary = excluded.summary,
                tactical_tags = excluded.tactical_tags,
                svg_playbook_json = excluded.svg_playbook_json,
                youtube_seconds = excluded.youtube_seconds,
                created_at = datetime('now', 'localtime')
            """,
            (
                stage,
                sys_info["team_name"],
                sys_info["side"],
                ai_item.play_name,
                ai_item.summary,
                tags_json,
                svg_json,
                source_game_id,
                lead_play["quarter"],
                lead_play["game_clock"],
                lead_play["youtube_seconds"] if effective_yt_url else None,
            ),
        )
        saved_rows.append(svg_payload)

    cur.execute(
        "SELECT id, team_name, side, source_quarter, source_clock FROM team_playbooks WHERE source_game_id = ?",
        (source_game_id,),
    )
    stale_ids = [
        r[0]
        for r in cur.fetchall()
        if (source_game_id, r[1], r[2], r[3], r[4]) not in keep_keys
    ]
    if stale_ids:
        placeholders = ",".join(["?"] * len(stale_ids))
        cur.execute(f"DELETE FROM team_playbooks WHERE id IN ({placeholders})", stale_ids)

    conn.commit()
    export_game_playbooks_to_json(conn, source_game_id)
    return saved_rows


def export_game_playbooks_to_json(
    conn: sqlite3.Connection,
    source_game_id: str,
    output_dir: Path = AI_TACTICAL_BOARDS_DIR,
) -> Optional[Path]:
    """將指定場次的 team_playbooks 同步匯出至 backend/data/ai_tactical_boards/{game_id}.json。"""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT stage, team_name, side, play_name, summary, tactical_tags,
               svg_playbook_json, source_game_id, source_quarter, source_clock,
               youtube_seconds, created_at
        FROM team_playbooks
        WHERE source_game_id = ?
        ORDER BY id ASC
        """,
        (source_game_id,),
    )
    rows = cur.fetchall()
    if not rows:
        return None

    output_dir.mkdir(parents=True, exist_ok=True)
    safe_name = source_game_id.replace("/", "_").replace("\\", "_")
    out_path = output_dir / f"{safe_name}.json"

    records = []
    for r in rows:
        records.append(
            {
                "stage": r[0],
                "team_name": r[1],
                "side": r[2],
                "play_name": r[3],
                "summary": r[4],
                "tactical_tags": r[5],
                "svg_playbook_json": r[6],
                "source_game_id": r[7],
                "source_quarter": r[8],
                "source_clock": r[9],
                "youtube_seconds": r[10],
                "created_at": r[11],
            }
        )

    payload = {
        "game_id": source_game_id,
        "exported_at": datetime.now().isoformat(timespec="seconds"),
        "count": len(records),
        "playbooks": records,
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_path


def fetch_game_playbooks(conn: sqlite3.Connection, source_game_id: str, home_team: str) -> List[Dict[str, Any]]:
    """從 team_playbooks 讀取該場次的 4 套核心戰術體系（主隊 攻->守 -> 客隊 攻->守排序）。"""
    ensure_playbook_schema(conn)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, stage, team_name, side, play_name, summary, tactical_tags,
               svg_playbook_json, source_game_id, source_quarter, source_clock, youtube_seconds, created_at
        FROM team_playbooks
        WHERE source_game_id = ?
        ORDER BY
            CASE WHEN team_name = ? THEN 0 ELSE 1 END,
            CASE WHEN side = 'offense' THEN 0 ELSE 1 END,
            id ASC
        """,
        (source_game_id, home_team),
    )
    rows = []
    for r in cur.fetchall():
        d = dict(r)
        try:
            svg_obj = json.loads(d["svg_playbook_json"])
        except Exception:
            svg_obj = {}
        try:
            tags = json.loads(d["tactical_tags"]) if d.get("tactical_tags") else []
        except Exception:
            tags = []
        if isinstance(svg_obj, dict):
            svg_obj["youtubeSeconds"] = d.get("youtube_seconds")
            svg_obj["sourceQuarter"] = d.get("source_quarter")
            svg_obj["sourceClock"] = d.get("source_clock")
            svg_obj["tacticalTags"] = tags
        rows.append({
            "id": d["id"],
            "stage": d["stage"],
            "team_name": d["team_name"],
            "side": d["side"],
            "play_name": d["play_name"],
            "summary": d["summary"],
            "tactical_tags": tags,
            "source_game_id": d["source_game_id"],
            "source_quarter": d["source_quarter"],
            "source_clock": d["source_clock"],
            "youtube_seconds": d["youtube_seconds"],
            "svg_playbook": svg_obj,
        })
    return rows

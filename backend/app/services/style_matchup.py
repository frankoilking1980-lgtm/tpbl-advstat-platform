import glob
import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.database import BACKEND_DIR, DATA_DIR


def _load_raw_game_style_aggregates() -> Dict[str, Dict[str, float]]:
    """從 raw_game_stats/game_*_stats.json 彙總各隊對手三分命中率與團隊防守籃板率"""
    stats_dirs = [DATA_DIR / "raw_game_stats", BACKEND_DIR / "data" / "raw_game_stats"]
    seen_files = set()
    files: List[Path] = []
    for d in stats_dirs:
        if d.exists():
            for f in sorted(d.glob("game_*_stats.json")):
                if f.name not in seen_files:
                    seen_files.add(f.name)
                    files.append(f)

    agg: Dict[str, Dict[str, float]] = {}
    for f in files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue

        for side, opp_side in (("home_team", "away_team"), ("away_team", "home_team")):
            team_obj = data.get(side) or {}
            opp_obj = data.get(opp_side) or {}
            t_name = str(team_obj.get("name") or "").strip()
            if not t_name:
                continue

            t_tot = ((team_obj.get("teams") or {}).get("total")) or {}
            o_tot = ((opp_obj.get("teams") or {}).get("total")) or {}

            bucket = agg.setdefault(
                t_name,
                {"opp_3pm": 0.0, "opp_3pa": 0.0, "dreb": 0.0, "opp_oreb": 0.0},
            )
            bucket["opp_3pm"] += float(o_tot.get("three_pointers_made") or 0)
            bucket["opp_3pa"] += float(o_tot.get("three_pointers_attempted") or 0)
            bucket["dreb"] += float(t_tot.get("defensive_rebounds") or 0)
            bucket["opp_oreb"] += float(o_tot.get("offensive_rebounds") or 0)

    result: Dict[str, Dict[str, float]] = {}
    for t_name, b in agg.items():
        opp_3pt_pct = round((b["opp_3pm"] / b["opp_3pa"]) * 100.0, 1) if b["opp_3pa"] > 0 else 34.0
        dreb_denom = b["dreb"] + b["opp_oreb"]
        dreb_pct = round((b["dreb"] / dreb_denom) * 100.0, 1) if dreb_denom > 0 else 70.0
        result[t_name] = {
            "opp_3pt_pct": opp_3pt_pct,
            "dreb_pct": dreb_pct,
        }
    return result


def get_stage_team_style_metrics(conn: sqlite3.Connection, stage: str) -> Dict[str, Any]:
    """
    取得指定賽季階段各隊風格相剋所需進階指標（3PAr、ORB%、opp_3pt_pct、DREB%）與聯盟均值。
    """
    rows = conn.execute(
        """
        SELECT team_name, three_par, orb_pct, efg_pct, drtg
        FROM team_summary
        WHERE season_stage = ?
          AND team_name NOT LIKE '【%'
          AND team_name != '球隊名稱'
          AND team_name != 'nan'
        """,
        (stage,),
    ).fetchall()

    raw_style = _load_raw_game_style_aggregates() if "2026-2027" in (stage or "") else {}

    teams: Dict[str, Dict[str, float]] = {}
    for r in rows:
        t_name = str(r["team_name"] or "").strip()
        if not t_name:
            continue
        raw_t = raw_style.get(t_name, {})
        three_par = float(r["three_par"] if r["three_par"] is not None else 40.0)
        orb_pct = float(r["orb_pct"] if r["orb_pct"] is not None else 28.0)
        opp_3pt_pct = float(raw_t.get("opp_3pt_pct", 34.0))
        dreb_pct = float(raw_t.get("dreb_pct", 70.0))
        teams[t_name] = {
            "three_par": round(three_par, 1),
            "orb_pct": round(orb_pct, 1),
            "opp_3pt_pct": round(opp_3pt_pct, 1),
            "dreb_pct": round(dreb_pct, 1),
        }

    if teams:
        n = len(teams)
        league_avg = {
            "three_par": round(sum(t["three_par"] for t in teams.values()) / n, 1),
            "orb_pct": round(sum(t["orb_pct"] for t in teams.values()) / n, 1),
            "opp_3pt_pct": round(sum(t["opp_3pt_pct"] for t in teams.values()) / n, 1),
            "dreb_pct": round(sum(t["dreb_pct"] for t in teams.values()) / n, 1),
        }
    else:
        league_avg = {
            "three_par": 40.0,
            "orb_pct": 28.0,
            "opp_3pt_pct": 34.0,
            "dreb_pct": 70.0,
        }

    return {"teams": teams, "league_avg": league_avg}


def compute_style_matchup_adjustment(
    home_team_name: str,
    away_team_name: str,
    home_stats: Dict[str, float],
    away_stats: Dict[str, float],
    league_avg: Dict[str, float],
) -> Dict[str, Any]:
    """
    Four Factors 風格相剋係數（前後端一致公式）：
    (a) 外線風格相剋 (ΔeFG) = 0.5 * (進攻方 3PAr/100) * (防守方被對手 3PT% - 聯盟均值)
    (b) 籃板衝搶相剋 (ΔOREB) = 0.4 * ((進攻方 OREB% - 防守方 DREB%) - (聯盟均值 OREB% - 聯盟均值 DREB%))
    """
    lg_opp_3pt = float(league_avg.get("opp_3pt_pct", 34.0))
    lg_orb = float(league_avg.get("orb_pct", 28.0))
    lg_dreb = float(league_avg.get("dreb_pct", 70.0))

    h_3par = float(home_stats.get("three_par", 40.0))
    h_orb = float(home_stats.get("orb_pct", 28.0))
    h_opp_3pt = float(home_stats.get("opp_3pt_pct", lg_opp_3pt))
    h_dreb = float(home_stats.get("dreb_pct", lg_dreb))

    a_3par = float(away_stats.get("three_par", 40.0))
    a_orb = float(away_stats.get("orb_pct", 28.0))
    a_opp_3pt = float(away_stats.get("opp_3pt_pct", lg_opp_3pt))
    a_dreb = float(away_stats.get("dreb_pct", lg_dreb))

    home_delta_efg = round(0.5 * (h_3par / 100.0) * (a_opp_3pt - lg_opp_3pt), 2)
    away_delta_efg = round(0.5 * (a_3par / 100.0) * (h_opp_3pt - lg_opp_3pt), 2)

    baseline_reb_gap = lg_orb - lg_dreb
    home_delta_oreb = round(0.4 * ((h_orb - a_dreb) - baseline_reb_gap), 2)
    away_delta_oreb = round(0.4 * ((a_orb - h_dreb) - baseline_reb_gap), 2)

    home_total_adj = round(home_delta_efg + home_delta_oreb, 2)
    away_total_adj = round(away_delta_efg + away_delta_oreb, 2)

    net_efg_diff = round(home_delta_efg - away_delta_efg, 2)
    net_oreb_diff = round(home_delta_oreb - away_delta_oreb, 2)
    net_style_adj = round(home_total_adj - away_total_adj, 2)

    abs_efg = abs(net_efg_diff)
    abs_oreb = abs(net_oreb_diff)

    tags: List[str] = []
    if abs_efg >= 0.35 and abs_efg >= abs_oreb:
        edge_team = home_team_name if net_efg_diff > 0 else away_team_name
        primary_tag = "🔥 外線火力克制"
        tags.append(primary_tag)
        if abs_oreb >= 0.45:
            tags.append("💪 禁區二次進攻優勢")
        summary = (
            f"{edge_team} 外線對位佔優（ΔeFG 淨差 {net_efg_diff:+.2f}）："
            f"高三分比重遇上對手外圍防守落差。"
        )
    elif abs_oreb >= 0.45 and abs_oreb > abs_efg:
        edge_team = home_team_name if net_oreb_diff > 0 else away_team_name
        primary_tag = "💪 禁區二次進攻優勢"
        tags.append(primary_tag)
        if abs_efg >= 0.35:
            tags.append("🔥 外線火力克制")
        summary = (
            f"{edge_team} 籃板衝搶佔優（ΔOREB 淨差 {net_oreb_diff:+.2f}）："
            f"進攻籃板率對上對手防守籃板保護存在明顯落差。"
        )
    else:
        primary_tag = "⚖️ 攻防節奏拉鋸"
        tags.append(primary_tag)
        summary = (
            f"雙方外線與籃板風格相剋幅度接近（總風格淨修正 {net_style_adj:+.2f}），"
            f"勝負將回歸臨場節奏與主力執行力。"
        )

    return {
        "primary_tag": primary_tag,
        "tags": tags,
        "summary": summary,
        "home_delta_efg": home_delta_efg,
        "away_delta_efg": away_delta_efg,
        "home_delta_oreb": home_delta_oreb,
        "away_delta_oreb": away_delta_oreb,
        "home_total_adj": home_total_adj,
        "away_total_adj": away_total_adj,
        "net_efg_diff": net_efg_diff,
        "net_oreb_diff": net_oreb_diff,
        "net_style_adj": net_style_adj,
        "league_avg": league_avg,
    }

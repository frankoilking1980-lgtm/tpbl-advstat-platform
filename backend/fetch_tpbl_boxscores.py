"""
TPBL 官方 Box Score 與逐球文字直播 (Broadcasts) 彈性抓取腳本
用法範例：
  1. 抓單場: python backend/fetch_tpbl_boxscores.py 27555 -g 14
  2. 連續抓多場並跳過已存在檔案: python backend/fetch_tpbl_boxscores.py 27542 -g 1 -c 14 --skip-existing
"""

import argparse
from datetime import datetime
import json
import re
import time
from pathlib import Path
import requests

CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
RAW_DIR = CURRENT_DIR / "data" / "raw_game_stats"
RAW_DIR.mkdir(parents=True, exist_ok=True)
SEASON2026_DIR = CURRENT_DIR / "data" / "season2026"
ROOT_SEASON2026_DIR = PROJECT_ROOT / "data" / "season2026"


def _fetch_json_with_retry(url: str, headers: dict, retries: int = 3):
    for _ in range(retries):
        try:
            resp = requests.get(url, headers=headers, timeout=12)
            if resp.status_code == 200:
                return resp.json(), 200
            if resp.status_code == 404:
                return None, 404
            time.sleep(0.5)
        except Exception:
            time.sleep(0.8)
    return None, 0


def _extract_team_score(side_data: dict) -> int:
    """從 raw stats JSON 擷取球隊總得分，若 teams.total.won_score 為 0 則加總球員得分。"""
    if not isinstance(side_data, dict):
        return 0
    total_score = (side_data.get("teams") or {}).get("total", {}).get("won_score")
    if total_score is not None:
        try:
            val = int(round(float(total_score)))
            if val > 0:
                return val
        except (TypeError, ValueError):
            pass
    players_total = (side_data.get("players") or {}).get("total") or {}
    return int(
        round(
            sum(
                float(p.get("score") or 0)
                for p in players_total.values()
                if isinstance(p, dict)
            )
        )
    )


def _load_upcoming_map() -> dict[int, dict]:
    """讀取 season2026/upcoming_schedule.json，建立 official_id -> 賽程中繼資料對照表。"""
    mapping: dict[int, dict] = {}
    for cand in (
        SEASON2026_DIR / "upcoming_schedule.json",
        ROOT_SEASON2026_DIR / "upcoming_schedule.json",
    ):
        if cand.exists():
            try:
                items = json.loads(cand.read_text(encoding="utf-8"))
                if isinstance(items, list):
                    for it in items:
                        oid = it.get("official_id")
                        if oid is not None:
                            mapping[int(oid)] = it
                    break
            except Exception:
                pass
    return mapping


def _upsert_season2026_schedule(
    schedule_id: int,
    fallback_g_num: int,
    stats_data: dict,
    bcast_data: dict | None,
    upcoming_map: dict[int, dict],
) -> str:
    """
    從 raw JSON 與 upcoming_schedule.json 擷取隊伍、日期、比分與場次編號 (Gxx)，
    並同步寫入 season2026/schedule.json（若有根目錄 data/season2026 亦同步更新）。
    """
    home_team = str((stats_data.get("home_team") or {}).get("name") or "").strip()
    away_team = str((stats_data.get("away_team") or {}).get("name") or "").strip()
    if not home_team or not away_team:
        return f"G{fallback_g_num:02d}"

    home_score = _extract_team_score(stats_data.get("home_team") or {})
    away_score = _extract_team_score(stats_data.get("away_team") or {})
    if home_score == 0 and away_score == 0:
        return f"G{fallback_g_num:02d}"

    rounds_cnt = len((bcast_data or {}).get("rounds") or [])
    if rounds_cnt == 5:
        status = "FINAL (OT)"
    elif rounds_cnt > 5:
        status = f"FINAL ({rounds_cnt - 4}OT)"
    else:
        status = "FINAL"

    up_info = upcoming_map.get(schedule_id, {})
    gdate = str(up_info.get("date") or datetime.now().strftime("%Y-%m-%d"))[:10].replace("-", ".")
    gtime = str(up_info.get("time") or "17:00")

    target_files = [SEASON2026_DIR / "schedule.json"]
    if ROOT_SEASON2026_DIR.exists():
        target_files.append(ROOT_SEASON2026_DIR / "schedule.json")

    resolved_gid = str(up_info.get("game_id") or "").strip().upper()

    for sched_path in target_files:
        sched_path.parent.mkdir(parents=True, exist_ok=True)
        items: list[dict] = []
        if sched_path.exists():
            try:
                loaded = json.loads(sched_path.read_text(encoding="utf-8"))
                if isinstance(loaded, list):
                    items = loaded
            except Exception:
                items = []

        # 尋找是否已存在相同 schedule_id 或相同日期+對戰組合
        existing_idx = None
        max_g_num = 0
        for idx, it in enumerate(items):
            gm = re.search(r"G(\d+)", str(it.get("game_id", "")), re.IGNORECASE)
            if gm:
                max_g_num = max(max_g_num, int(gm.group(1)))
            it_sid = it.get("schedule_id")
            if it_sid is not None and int(it_sid) == schedule_id:
                existing_idx = idx
                if not resolved_gid and it.get("game_id"):
                    resolved_gid = str(it["game_id"]).upper()
                break
            if (
                str(it.get("date", ""))[:10].replace("-", ".") == gdate
                and str(it.get("home_team", "")) == home_team
                and str(it.get("away_team", "")) == away_team
            ):
                existing_idx = idx
                if not resolved_gid and it.get("game_id"):
                    resolved_gid = str(it["game_id"]).upper()
                break

        if not resolved_gid:
            # 若未從 upcoming_schedule 取得 Gxx，依當季已有場次順序自動遞補（或採用不重複的 fallback_g_num）
            used_gids = {str(it.get("game_id", "")).upper() for it in items}
            cand_gid = f"G{fallback_g_num:02d}"
            if fallback_g_num > max_g_num and cand_gid not in used_gids:
                resolved_gid = cand_gid
            else:
                resolved_gid = f"G{max_g_num + 1:02d}"

        entry = {
            "game_id": resolved_gid,
            "schedule_id": schedule_id,
            "date": gdate,
            "time": gtime,
            "away_team": away_team,
            "away_score": away_score,
            "home_team": home_team,
            "home_score": home_score,
            "sheet_name": f"{gdate} {resolved_gid} {away_team} vs {home_team}",
            "status": status,
        }

        if existing_idx is not None:
            items[existing_idx].update(entry)
        else:
            items.append(entry)

        def _sort_key(x: dict) -> tuple:
            m = re.search(r"G(\d+)", str(x.get("game_id", "")), re.IGNORECASE)
            return (0, int(m.group(1))) if m else (1, str(x.get("date", "")))

        items.sort(key=_sort_key)
        sched_path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")

    return resolved_gid


def fetch_box_scores(start_id: int, start_g_num: int, count: int, skip_existing: bool = False):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://tpbl.basketball",
        "Referer": "https://tpbl.basketball/",
    }
    upcoming_map = _load_upcoming_map()

    print(f"🚀 開始透過 TPBL 官方 API 抓取 {count} 場比賽數據 (Stats + Broadcasts)...")
    print(f"📌 起始官網 ID: {start_id} | 起始場次: G{start_g_num:02d} | 跳過已存在: {skip_existing}")
    print(f"📁 存檔目錄: {RAW_DIR}")
    print("-" * 60)

    for i in range(count):
        schedule_id = start_id + i
        g_num = start_g_num + i
        gid_str = f"G{g_num:02d}"

        stats_file = RAW_DIR / f"game_{schedule_id}_stats.json"
        bcast_file = RAW_DIR / f"game_{schedule_id}_broadcasts.json"

        # 1. 抓取 Stats
        stats_data = None
        if skip_existing and stats_file.exists() and stats_file.stat().st_size > 500:
            try:
                stats_data = json.loads(stats_file.read_text(encoding="utf-8"))
                stats_status = "cached"
            except Exception:
                stats_data = None
                stats_status = "error"
        else:
            stats_url = f"https://api.tpbl.basketball/api/games/{schedule_id}/stats"
            data, code = _fetch_json_with_retry(stats_url, headers)
            if (
                code == 200
                and isinstance(data, dict)
                and data.get("home_team", {}).get("name")
                and data.get("away_team", {}).get("name")
            ):
                stats_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
                stats_data = data
                stats_status = "downloaded"
            elif code == 404:
                stats_status = "404"
            else:
                stats_status = "empty/fail"

        if stats_status in ("404", "empty/fail"):
            print(f"[{i+1:02d}/{count:02d}] ⚠️ {gid_str} (ID {schedule_id}) Stats {stats_status}，略過")
            time.sleep(0.2)
            continue

        # 2. 抓取 Broadcasts (Play-by-Play)
        bcast_data = None
        if skip_existing and bcast_file.exists() and bcast_file.stat().st_size > 500:
            try:
                bcast_data = json.loads(bcast_file.read_text(encoding="utf-8"))
            except Exception:
                bcast_data = None
            bcast_status = "cached"
        else:
            bcast_url = f"https://api.tpbl.basketball/api/games/{schedule_id}/broadcasts"
            bdata, bcode = _fetch_json_with_retry(bcast_url, headers)
            if bcode == 200 and isinstance(bdata, dict) and len(bdata.get("rounds", [])) > 0:
                bcast_file.write_text(json.dumps(bdata, ensure_ascii=False, indent=2), encoding="utf-8")
                bcast_data = bdata
                bcast_status = f"downloaded ({len(bdata.get('rounds', []))}Q)"
            elif bcode == 404:
                bcast_status = "404"
            else:
                bcast_status = "empty/fail"

        synced_gid = gid_str
        if isinstance(stats_data, dict):
            synced_gid = _upsert_season2026_schedule(
                schedule_id=schedule_id,
                fallback_g_num=g_num,
                stats_data=stats_data,
                bcast_data=bcast_data,
                upcoming_map=upcoming_map,
            )

        home_name = (stats_data or {}).get("home_team", {}).get("name", "主隊")
        away_name = (stats_data or {}).get("away_team", {}).get("name", "客隊")
        print(
            f"[{i+1:02d}/{count:02d}] ✅ {synced_gid} (ID {schedule_id}): {away_name} vs {home_name} "
            f"| Stats: {stats_status} | Broadcasts: {bcast_status}"
        )
        if stats_status == "downloaded" or bcast_status.startswith("downloaded"):
            time.sleep(0.3)

    print("-" * 60)
    print("🎉 全部場次抓取與存檔完成！")


SEASON_API_DIV_MAP = {
    "season2024": (1, 2),
    "season2025": (2, 9),
    "playin2025": (2, 11),
    "playoff2025": (2, 12),
    "final20252026": (2, 35),
    "preseason2026": (3, 655),
    "season2026": (3, 656),
}

TEAM_ALIASES_MAP = {
    "新竹御嵿攻城獅": ["新竹御嵿攻城獅", "新竹御頂攻城獅", "新竹攻城獅", "攻城獅"],
    "福爾摩沙夢想家": ["福爾摩沙夢想家", "福爾摩沙台新夢想家", "夢想家"],
    "桃園台啤永豐雲豹": ["桃園台啤永豐雲豹", "台啤永豐雲豹", "桃園雲豹", "台啤雲豹", "雲豹"],
    "高雄全家海神": ["高雄全家海神", "全家海神", "高雄海神", "海神"],
    "新北中信特攻": ["新北中信特攻", "中信特攻", "新北特攻", "特攻"],
    "臺北台新戰神": ["臺北台新戰神", "台北台新戰神", "台北戰神", "臺北戰神", "台新戰神", "戰神"],
    "新北國王": ["新北國王", "國王"],
}


def _normalize_team_name(raw: str) -> str:
    c = str(raw or "").strip()
    for std, aliases in TEAM_ALIASES_MAP.items():
        if c in aliases or any(a in c for a in aliases):
            return std
    return c


def _normalize_game_code(raw_code: str) -> str:
    """將 'G01', '1', 'G1', 'Group A-G01', 'AG1' 正規化為可比對的代碼"""
    s = str(raw_code or "").strip().upper()
    if not s:
        return ""
    m_grp = re.match(r"GROUP\s*([A-Z])\s*-\s*G?0*(\d+)", s)
    if m_grp:
        return f"{m_grp.group(1)}G{int(m_grp.group(2))}"
    m_ag = re.match(r"^([A-Z])G0*(\d+)$", s)
    if m_ag:
        return f"{m_ag.group(1)}G{int(m_ag.group(2))}"
    m_g = re.match(r"^G?0*(\d+)$", s)
    if m_g:
        return f"G{int(m_g.group(1))}"
    return s


def _backfill_schedule_ids_from_api(season: str, items: list[dict], headers: dict) -> tuple[int, list[dict]]:
    """
    若 schedule.json 場次缺少 schedule_id，透過 TPBL 官方賽程 API (/api/seasons/{id}/games)
    依 division_id + (正規化場次代碼 / 日期) + 主客隊名稱自動反查並回填 schedule_id。
    """
    api_info = SEASON_API_DIV_MAP.get(season)
    if not api_info:
        return 0, []

    api_season_id, target_div_id = api_info
    url = f"https://api.tpbl.basketball/api/seasons/{api_season_id}/games"
    data, code = _fetch_json_with_retry(url, headers)
    if code != 200 or not isinstance(data, list):
        print(f"  ⚠️ 無法取得 TPBL 官方賽程 API ({url}, status={code})，略過自動反查 schedule_id")
        return 0, []

    div_games = [g for g in data if g.get("division_id") == target_div_id]
    by_code_teams: dict[tuple[str, str, str], int] = {}
    by_date_teams: dict[tuple[str, str, str], int] = {}

    for g in div_games:
        sid = g.get("id")
        if sid is None:
            continue
        a_name = _normalize_team_name((g.get("away_team") or {}).get("name", ""))
        h_name = _normalize_team_name((g.get("home_team") or {}).get("name", ""))
        g_code = _normalize_game_code(g.get("code", ""))
        g_date = str(g.get("game_date", ""))[:10].replace("-", ".")
        if g_code and a_name and h_name:
            by_code_teams[(g_code, a_name, h_name)] = int(sid)
        if g_date and a_name and h_name:
            by_date_teams[(g_date, a_name, h_name)] = int(sid)

    backfilled = 0
    unmatched: list[dict] = []
    for it in items:
        if it.get("schedule_id") is not None or it.get("official_id") is not None:
            if it.get("schedule_id") is None and it.get("official_id") is not None:
                it["schedule_id"] = int(it["official_id"])
                backfilled += 1
            continue

        status_str = str(it.get("status", "")).upper()
        a_score = int(it.get("away_score") or 0)
        h_score = int(it.get("home_score") or 0)
        if "FINAL" not in status_str and a_score == 0 and h_score == 0:
            continue

        a_name = _normalize_team_name(it.get("away_team", ""))
        h_name = _normalize_team_name(it.get("home_team", ""))
        g_code = _normalize_game_code(it.get("game_id", ""))
        g_date = str(it.get("date", ""))[:10].replace("-", ".")

        matched_sid = by_code_teams.get((g_code, a_name, h_name))
        if matched_sid is None and g_date:
            matched_sid = by_date_teams.get((g_date, a_name, h_name))

        if matched_sid is not None:
            it["schedule_id"] = matched_sid
            backfilled += 1
        else:
            unmatched.append({
                "game_id": it.get("game_id"),
                "date": it.get("date"),
                "away_team": it.get("away_team"),
                "home_team": it.get("home_team"),
            })

    return backfilled, unmatched


def sync_missing_from_schedule(season: str) -> dict:
    """
    依 backend/data/{season}/schedule.json 掃描所有已完賽場次，
    若缺少 schedule_id 則自動向 TPBL 官方賽程 API 反查回填，
    再檢查 raw_game_stats/ 下缺漏或 < 500 bytes 的 stats.json 與 broadcasts.json 並補下載。
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://tpbl.basketball",
        "Referer": "https://tpbl.basketball/",
    }
    sched_path = CURRENT_DIR / "data" / season / "schedule.json"
    if not sched_path.exists():
        alt = PROJECT_ROOT / "data" / season / "schedule.json"
        if alt.exists():
            sched_path = alt
        else:
            print(f"⚠️ [{season}] 找不到 schedule.json: {sched_path}")
            return {"season": season, "error": "schedule.json not found"}

    items = json.loads(sched_path.read_text(encoding="utf-8"))
    if not isinstance(items, list):
        return {"season": season, "error": "invalid schedule.json"}

    print("=" * 60)
    print(f"🔄 [{season}] 檢查 schedule.json ({len(items)} 場) 並補抓缺漏 Raw JSON...")

    backfilled, unmatched = _backfill_schedule_ids_from_api(season, items, headers)
    if backfilled > 0:
        sched_path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
        root_sched = PROJECT_ROOT / "data" / season / "schedule.json"
        if root_sched.exists() and root_sched != sched_path:
            root_sched.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  📌 已透過 TPBL 官方賽程 API 自動回填 {backfilled} 筆 schedule_id 至 {sched_path.name}")

    downloaded_stats = 0
    downloaded_bcast = 0
    skipped_complete = 0
    failed_downloads: list[dict] = []
    finished_count = 0

    for idx, it in enumerate(items, 1):
        status_str = str(it.get("status", "")).upper()
        a_score = int(it.get("away_score") or 0)
        h_score = int(it.get("home_score") or 0)
        if "FINAL" not in status_str and a_score == 0 and h_score == 0:
            continue

        finished_count += 1
        sid = it.get("schedule_id") or it.get("official_id")
        if sid is None:
            continue
        sid = int(sid)
        gid = it.get("game_id", f"ID:{sid}")

        stats_file = RAW_DIR / f"game_{sid}_stats.json"
        bcast_file = RAW_DIR / f"game_{sid}_broadcasts.json"

        need_stats = (not stats_file.exists()) or stats_file.stat().st_size < 500
        need_bcast = (not bcast_file.exists()) or bcast_file.stat().st_size < 500

        if not need_stats and not need_bcast:
            skipped_complete += 1
            continue

        did_req = False
        if need_stats:
            stats_url = f"https://api.tpbl.basketball/api/games/{sid}/stats"
            data, code = _fetch_json_with_retry(stats_url, headers)
            did_req = True
            if (
                code == 200
                and isinstance(data, dict)
                and data.get("home_team", {}).get("name")
                and data.get("away_team", {}).get("name")
            ):
                stats_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
                downloaded_stats += 1
                print(f"  [{idx}/{len(items)}] ✅ {gid} (sid={sid}) 已補抓 stats.json")
            else:
                failed_downloads.append({"game_id": gid, "schedule_id": sid, "type": "stats", "code": code})
                print(f"  [{idx}/{len(items)}] ⚠️ {gid} (sid={sid}) stats.json 補抓失敗 (HTTP {code})")

        if need_bcast:
            bcast_url = f"https://api.tpbl.basketball/api/games/{sid}/broadcasts"
            bdata, bcode = _fetch_json_with_retry(bcast_url, headers)
            did_req = True
            if bcode == 200 and isinstance(bdata, dict) and len(bdata.get("rounds", [])) > 0:
                bcast_file.write_text(json.dumps(bdata, ensure_ascii=False, indent=2), encoding="utf-8")
                downloaded_bcast += 1
                print(f"  [{idx}/{len(items)}] ✅ {gid} (sid={sid}) 已補抓 broadcasts.json ({len(bdata.get('rounds', []))}Q)")
            else:
                failed_downloads.append({"game_id": gid, "schedule_id": sid, "type": "broadcasts", "code": bcode})
                print(f"  [{idx}/{len(items)}] ⚠️ {gid} (sid={sid}) broadcasts.json 補抓失敗 (HTTP {bcode})")

        if did_req:
            time.sleep(0.25)

    if unmatched:
        print(f"  ⚠️ [{season}] 以下 {len(unmatched)} 場無法從官方賽程 API 自動匹配 schedule_id，請手動確認：")
        for u in unmatched:
            print(f"     - {u['game_id']} ({u['date']}) {u['away_team']} vs {u['home_team']}")

    summary = {
        "season": season,
        "finished_games": finished_count,
        "backfilled_schedule_ids": backfilled,
        "skipped_complete": skipped_complete,
        "downloaded_stats": downloaded_stats,
        "downloaded_broadcasts": downloaded_bcast,
        "unmatched_games": unmatched,
        "failed_downloads": failed_downloads,
    }
    print(
        f"📊 [{season}] 補抓完成：已完賽 {finished_count} 場 | 完整跳過 {skipped_complete} 場 | "
        f"補抓 stats {downloaded_stats} / broadcasts {downloaded_bcast} | 缺 schedule_id {len(unmatched)} 場"
    )
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TPBL 官方 Box Score 與 Broadcasts 彈性抓取腳本")
    parser.add_argument("start_id", nargs="?", type=int, default=None, help="起始比賽的官網 Schedule ID (例如: 27542)")
    parser.add_argument("-g", "--g_num", type=int, default=1, help="對應的比賽編號 Gxx (預設為 1，即 G01)")
    parser.add_argument("-c", "--count", type=int, default=1, help="要連續抓取的場數 (預設為 1 場)")
    parser.add_argument("--skip-existing", action="store_true", help="跳過已存在的 stats / broadcasts 檔案")
    parser.add_argument("--sync-missing-from-schedule", type=str, default=None, help="依指定賽季資料夾的 schedule.json 自動補抓缺漏檔案 (例如: season2024)")
    parser.add_argument("--all-seasons", action="store_true", help="搭配 --sync-missing-from-schedule 或單獨使用：遍歷所有具備 schedule.json 的賽季補抓缺漏")

    args = parser.parse_args()
    if args.sync_missing_from_schedule:
        sync_missing_from_schedule(args.sync_missing_from_schedule)
    elif args.all_seasons:
        data_root = CURRENT_DIR / "data"
        for d in sorted(data_root.iterdir()):
            if d.is_dir() and (d / "schedule.json").exists():
                sync_missing_from_schedule(d.name)
    elif args.start_id is not None:
        fetch_box_scores(args.start_id, args.g_num, args.count, skip_existing=args.skip_existing)
    else:
        parser.error("請提供 start_id，或使用 --sync-missing-from-schedule <season> / --all-seasons")

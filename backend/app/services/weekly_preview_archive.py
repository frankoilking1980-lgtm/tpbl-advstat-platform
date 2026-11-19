import json
import os
import re
import shutil
import sqlite3
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.database import BACKEND_DIR, DATA_DIR, db_session

PROJECT_ROOT = BACKEND_DIR.parent
BACKEND_PREVIEWS_DIR = DATA_DIR / "weekly_previews"
FRONTEND_PREVIEWS_DIR = PROJECT_ROOT / "frontend" / "public" / "weekly_previews"
RESERVED_FILES = {"index.json", "team_playbook_library.json"}
PREVIEW_FILE_LOCK = threading.RLock()


def atomic_write_text(target: Path, content: str) -> None:
    """以暫存檔 + os.replace 進行原子寫入，避免併發讀寫造成 JSON 毀損"""
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = target.with_name(f".{target.name}.{uuid.uuid4().hex[:8]}.tmp")
    tmp_path.write_text(content, encoding="utf-8")
    os.replace(tmp_path, target)


def _has_frontend_dir() -> bool:
    return (PROJECT_ROOT / "frontend").exists()


def _ensure_preview_dirs() -> None:
    BACKEND_PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)
    if _has_frontend_dir():
        FRONTEND_PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)


def _format_short_date(date_str: str) -> str:
    """將 YYYY-MM-DD 轉為 MM/DD"""
    parts = (date_str or "").split("-")
    if len(parts) == 3:
        return f"{int(parts[1])}/{int(parts[2])}"
    return date_str


def _iso_week_key(date_str: str) -> Optional[tuple]:
    """以週一為一週起點 (ISO Week)，確保同一個週末的週六與週日永遠歸屬同一週"""
    try:
        dt = datetime.strptime((date_str or "").strip(), "%Y-%m-%d")
        iso = dt.isocalendar()
        return (iso.year, iso.week)
    except Exception:
        return None


def _derive_week_meta(items: List[Dict[str, Any]], fallback_stage: str = "2026-2027 例行賽") -> Dict[str, str]:
    stage = next((it.get("season_stage") for it in items if it.get("season_stage")), fallback_stage)
    season_match = re.match(r"(\d{4})-(\d{4})", stage)
    season_short = f"{season_match.group(1)}-{season_match.group(2)[2:]}" if season_match else "TPBL"

    valid_dates = sorted({it.get("game_date", "") for it in items if re.match(r"^\d{4}-\d{2}-\d{2}$", it.get("game_date", ""))})
    # 依 ISO Week（週一起算）確認最新週次範圍，確保週六與週日合併於同一組週報
    week_groups: Dict[tuple, List[str]] = {}
    for d in valid_dates:
        wk = _iso_week_key(d)
        if wk:
            week_groups.setdefault(wk, []).append(d)

    if week_groups:
        latest_wk = max(week_groups.keys())
        wk_dates = sorted(week_groups[latest_wk])
        start_s = _format_short_date(wk_dates[0])
        end_s = _format_short_date(wk_dates[-1])
        date_range = start_s if start_s == end_s else f"{start_s}–{end_s}"
    elif valid_dates:
        start_s = _format_short_date(valid_dates[0])
        end_s = _format_short_date(valid_dates[-1])
        date_range = start_s if start_s == end_s else f"{start_s}–{end_s}"
    else:
        date_range = datetime.now().strftime("%m/%d")

    week_label = f"{season_short} ({date_range})"
    title = f"{stage} {date_range} 焦點戰役前瞻 ({len(items)} 場)"
    return {"stage": stage, "week_label": week_label, "title": title}


def _collect_files_snapshot() -> Dict[str, Any]:
    """從 backend/data/weekly_previews/*.json 收集當前檔案系統中的週報摘要與完整內容"""
    _ensure_preview_dirs()
    items: List[Dict[str, Any]] = []
    reports: Dict[str, Dict[str, Any]] = {}

    for p in sorted(BACKEND_PREVIEWS_DIR.glob("*.json"), reverse=True):
        if p.name in RESERVED_FILES:
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        slug = data.get("slug") or p.stem
        reports[slug] = data
        items.append({
            "slug": slug,
            "game_date": data.get("game_date", ""),
            "game_label": data.get("game_label", ""),
            "season_stage": data.get("season_stage", ""),
            "home_team": data.get("home_team", ""),
            "away_team": data.get("away_team", ""),
            "headline": data.get("headline", ""),
            "subheadline": data.get("subheadline", ""),
            "home_win_prob": data.get("home_win_prob", 50),
            "away_win_prob": data.get("away_win_prob", 50),
            "style_matchup_tags": data.get("style_matchup_tags", []),
            "generated_at": data.get("generated_at", ""),
            "model_used": data.get("model_used", ""),
        })

    items.sort(key=lambda x: (x.get("game_date", ""), x.get("generated_at", "")), reverse=True)
    return {"items": items, "reports": reports}


def _clear_active_preview_files() -> None:
    """封存後清空當前線上的單場 JSON 檔（保留 team_playbook_library.json 與 backup/），並將 index.json 設為 []"""
    with PREVIEW_FILE_LOCK:
        _ensure_preview_dirs()
        for directory in [BACKEND_PREVIEWS_DIR] + ([FRONTEND_PREVIEWS_DIR] if _has_frontend_dir() else []):
            for p in directory.glob("*.json"):
                if p.name in RESERVED_FILES:
                    continue
                p.unlink(missing_ok=True)
            atomic_write_text(directory / "index.json", "[]")


def _restore_preview_files(content: Dict[str, Any]) -> None:
    """取消封存時，將 content_json 內的單場 JSON 還原至 filesystem 並重建 index.json"""
    with PREVIEW_FILE_LOCK:
        _clear_active_preview_files()
        reports: Dict[str, Dict[str, Any]] = content.get("reports") or {}
        items: List[Dict[str, Any]] = content.get("items") or []

        for slug, report_data in reports.items():
            safe_slug = re.sub(r"[^a-zA-Z0-9_\-]", "", slug)
            if not safe_slug:
                continue
            json_str = json.dumps(report_data, ensure_ascii=False, indent=2)
            backend_file = BACKEND_PREVIEWS_DIR / f"{safe_slug}.json"
            atomic_write_text(backend_file, json_str)
            if _has_frontend_dir():
                frontend_file = FRONTEND_PREVIEWS_DIR / f"{safe_slug}.json"
                atomic_write_text(frontend_file, json_str)

        items_sorted = sorted(items, key=lambda x: (x.get("game_date", ""), x.get("generated_at", "")), reverse=True)
        index_text = json.dumps(items_sorted, ensure_ascii=False, indent=2)
        atomic_write_text(BACKEND_PREVIEWS_DIR / "index.json", index_text)
        if _has_frontend_dir():
            atomic_write_text(FRONTEND_PREVIEWS_DIR / "index.json", index_text)


def ensure_weekly_previews_table(conn: sqlite3.Connection) -> None:
    """確保 weekly_previews 資料表存在，若為空且檔案系統有現存週報則自動遷移為第一筆資料"""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS weekly_previews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            week_label TEXT NOT NULL,
            stage TEXT NOT NULL,
            title TEXT NOT NULL,
            content_json TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            archived_at TEXT
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_weekly_previews_status ON weekly_previews(status)"
    )

    count_row = conn.execute("SELECT COUNT(*) AS cnt FROM weekly_previews").fetchone()
    if count_row and count_row["cnt"] == 0:
        snapshot = _collect_files_snapshot()
        if snapshot["items"]:
            meta = _derive_week_meta(snapshot["items"])
            now_iso = datetime.now().isoformat(timespec="seconds")
            conn.execute(
                """
                INSERT INTO weekly_previews (week_label, stage, title, content_json, status, created_at, archived_at)
                VALUES (?, ?, ?, ?, 'active', ?, NULL)
                """,
                (
                    meta["week_label"],
                    meta["stage"],
                    meta["title"],
                    json.dumps(snapshot, ensure_ascii=False),
                    now_iso,
                ),
            )
    conn.commit()


def sync_active_weekly_preview_from_files() -> None:
    """在新增或刪除單場週報後，同步更新資料庫中 status='active' 的週報快照"""
    with PREVIEW_FILE_LOCK:
        snapshot = _collect_files_snapshot()
        with db_session() as conn:
            ensure_weekly_previews_table(conn)
            active_row = conn.execute(
                "SELECT id, week_label, title FROM weekly_previews WHERE status = 'active' ORDER BY id DESC LIMIT 1"
            ).fetchone()

            if not snapshot["items"]:
                if active_row:
                    conn.execute("DELETE FROM weekly_previews WHERE id = ?", (active_row["id"],))
                    conn.commit()
                return

            meta = _derive_week_meta(snapshot["items"])
            content_str = json.dumps(snapshot, ensure_ascii=False)
            if active_row:
                conn.execute(
                    """
                    UPDATE weekly_previews
                    SET week_label = ?, stage = ?, title = ?, content_json = ?
                    WHERE id = ?
                    """,
                    (meta["week_label"], meta["stage"], meta["title"], content_str, active_row["id"]),
                )
            else:
                now_iso = datetime.now().isoformat(timespec="seconds")
                conn.execute(
                    """
                    INSERT INTO weekly_previews (week_label, stage, title, content_json, status, created_at, archived_at)
                    VALUES (?, ?, ?, ?, 'active', ?, NULL)
                    """,
                    (meta["week_label"], meta["stage"], meta["title"], content_str, now_iso),
                )
            conn.commit()


def _row_to_meta(row: sqlite3.Row) -> Dict[str, Any]:
    game_count = 0
    try:
        parsed = json.loads(row["content_json"])
        game_count = len(parsed.get("items") or [])
    except Exception:
        pass
    return {
        "id": row["id"],
        "week_label": row["week_label"],
        "stage": row["stage"],
        "title": row["title"],
        "status": row["status"],
        "created_at": row["created_at"],
        "archived_at": row["archived_at"],
        "game_count": game_count,
    }


def _row_to_full(row: sqlite3.Row) -> Dict[str, Any]:
    meta = _row_to_meta(row)
    try:
        content = json.loads(row["content_json"])
    except Exception:
        content = {"items": [], "reports": {}}
    return {
        **meta,
        "content": content,
    }


def get_weekly_previews_overview(preview_id: Optional[int] = None) -> Dict[str, Any]:
    """取得當前 active 週報、所有已封存週報清單，以及指定 id（或當前/最新封存）的完整內容"""
    with db_session() as conn:
        ensure_weekly_previews_table(conn)
        active_row = conn.execute(
            "SELECT * FROM weekly_previews WHERE status = 'active' ORDER BY id DESC LIMIT 1"
        ).fetchone()
        archived_rows = conn.execute(
            "SELECT * FROM weekly_previews WHERE status = 'archived' ORDER BY COALESCE(archived_at, created_at) DESC, id DESC"
        ).fetchall()

        active_meta = _row_to_meta(active_row) if active_row else None
        archived_list = [_row_to_meta(r) for r in archived_rows]

        selected_preview = None
        if preview_id is not None:
            target_row = conn.execute(
                "SELECT * FROM weekly_previews WHERE id = ?", (preview_id,)
            ).fetchone()
            if target_row:
                selected_preview = _row_to_full(target_row)
        elif active_row is not None:
            selected_preview = _row_to_full(active_row)

        latest_archived = None
        if active_row is None and archived_rows:
            latest_archived = _row_to_full(archived_rows[0])

        items = []
        if selected_preview is not None:
            items = selected_preview["content"].get("items") or []
        elif active_row is not None:
            items = _row_to_full(active_row)["content"].get("items") or []

        return {
            "items": items,
            "active": active_meta,
            "archived": archived_list,
            "selected_preview": selected_preview,
            "latest_archived": latest_archived,
        }


def get_preview_report_by_slug(slug: str, preview_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """依 slug 取得單場球探報告，支援從指定 preview_id 或資料庫所有歷史封存中讀取"""
    safe_slug = re.sub(r"[^a-zA-Z0-9_\-]", "", slug)
    if not safe_slug:
        return None

    with db_session() as conn:
        ensure_weekly_previews_table(conn)
        if preview_id is not None:
            row = conn.execute(
                "SELECT content_json FROM weekly_previews WHERE id = ?", (preview_id,)
            ).fetchone()
            if row:
                content = json.loads(row["content_json"])
                report = (content.get("reports") or {}).get(safe_slug)
                if report:
                    return report

        # 優先檢查檔案系統
        target = BACKEND_PREVIEWS_DIR / f"{safe_slug}.json"
        if target.exists():
            return json.loads(target.read_text(encoding="utf-8"))

        # 再從資料庫（active -> archived）搜尋
        rows = conn.execute(
            "SELECT content_json FROM weekly_previews ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id DESC"
        ).fetchall()
        for row in rows:
            try:
                content = json.loads(row["content_json"])
                report = (content.get("reports") or {}).get(safe_slug)
                if report:
                    return report
            except Exception:
                continue
    return None


def set_weekly_preview_archive_status(
    preview_id: int,
    action: str = "archive",
    week_label: Optional[str] = None,
    title: Optional[str] = None,
) -> Dict[str, Any]:
    """將指定 id 的週報切換為 'archived' 或恢復為 'active'"""
    normalized_action = (action or "archive").strip().lower()
    if normalized_action not in {"archive", "unarchive"}:
        raise ValueError("action 必須為 'archive' 或 'unarchive'")

    with db_session() as conn:
        ensure_weekly_previews_table(conn)
        row = conn.execute("SELECT * FROM weekly_previews WHERE id = ?", (preview_id,)).fetchone()
        if not row:
            raise KeyError(f"找不到週報存檔 ID: {preview_id}")

        now_iso = datetime.now().isoformat(timespec="seconds")
        new_label = week_label.strip() if week_label and week_label.strip() else row["week_label"]
        new_title = title.strip() if title and title.strip() else row["title"]

        if normalized_action == "archive":
            conn.execute(
                """
                UPDATE weekly_previews
                SET status = 'archived', archived_at = ?, week_label = ?, title = ?
                WHERE id = ?
                """,
                (now_iso, new_label, new_title, preview_id),
            )
            conn.commit()
            # 若剛封存的是目前線上唯一 active 週報，清空當前線上單場 JSON 檔
            remaining_active = conn.execute(
                "SELECT COUNT(*) AS cnt FROM weekly_previews WHERE status = 'active'"
            ).fetchone()
            if remaining_active and remaining_active["cnt"] == 0:
                _clear_active_preview_files()
        else:
            # 取消封存 / 設為當前顯示：先將其他 active 週報自動封存，確保同時僅有一份 active
            conn.execute(
                """
                UPDATE weekly_previews
                SET status = 'archived', archived_at = COALESCE(archived_at, ?)
                WHERE status = 'active' AND id != ?
                """,
                (now_iso, preview_id),
            )
            conn.execute(
                """
                UPDATE weekly_previews
                SET status = 'active', archived_at = NULL, week_label = ?, title = ?
                WHERE id = ?
                """,
                (new_label, new_title, preview_id),
            )
            conn.commit()
            content = json.loads(row["content_json"])
            _restore_preview_files(content)

        updated = conn.execute("SELECT * FROM weekly_previews WHERE id = ?", (preview_id,)).fetchone()
        return _row_to_meta(updated)

import hashlib
import os
import threading
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple
from fastapi import Response

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent
BACKEND_DATA_DIR = BACKEND_DIR / "data"
ROOT_DATA_DIR = PROJECT_ROOT / "data"

_CACHE_LOCK = threading.RLock()

# In-memory caches keyed with data_version_hash
_ADVANCED_PLAYERS_CACHE: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
_PLAYER_CARD_CACHE: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
_CLUTCH_LEADERBOARD_CACHE: Dict[Tuple[str, str, str, int, float, int, str], Dict[str, Any]] = {}

_EXTERNAL_CLEAR_CALLBACKS: List[Callable[[], None]] = []
_WARMUP_CALLBACK: Optional[Callable[[], None]] = None


def register_clear_callback(cb: Callable[[], None]) -> None:
    if cb not in _EXTERNAL_CLEAR_CALLBACKS:
        _EXTERNAL_CLEAR_CALLBACKS.append(cb)


def register_warmup_callback(cb: Callable[[], None]) -> None:
    global _WARMUP_CALLBACK
    _WARMUP_CALLBACK = cb


def _iter_core_data_stats(base_dir: Path, prefix: str) -> List[str]:
    if not base_dir.exists():
        return []
    entries: List[str] = []
    skip_dirs = {"backups", "raw_game_stats", "backup", "__pycache__"}
    for root, dirs, files in os.walk(base_dir):
        dirs[:] = [d for d in dirs if d not in skip_dirs and not d.startswith(".")]
        for fname in files:
            if fname.startswith("~$") or fname.startswith("."):
                continue
            ext = os.path.splitext(fname)[1].lower()
            if ext not in {".xlsx", ".json", ".db"}:
                continue
            full_path = os.path.join(root, fname)
            try:
                st = os.stat(full_path)
                rel = os.path.relpath(full_path, base_dir).replace("\\", "/")
                entries.append(f"{prefix}:{rel}:{st.st_mtime_ns}:{st.st_size}")
            except OSError:
                continue
    return entries


def get_data_version_hash() -> str:
    """計算 backend/data/ (及專案 data/) 核心資料檔案之 mtime 組合指紋。"""
    entries: List[str] = []
    entries.extend(_iter_core_data_stats(BACKEND_DATA_DIR, "bd"))
    if ROOT_DATA_DIR.exists() and ROOT_DATA_DIR.resolve() != BACKEND_DATA_DIR.resolve():
        entries.extend(_iter_core_data_stats(ROOT_DATA_DIR, "rd"))
    entries.sort()
    payload = "|".join(entries).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:16]


def get_cached_advanced_players(stage: str, version_hash: str) -> Optional[List[Dict[str, Any]]]:
    with _CACHE_LOCK:
        return _ADVANCED_PLAYERS_CACHE.get((stage, version_hash))


def set_cached_advanced_players(stage: str, version_hash: str, data: List[Dict[str, Any]]) -> None:
    with _CACHE_LOCK:
        # Evict stale versions for this stage to keep memory bounded
        stale_keys = [k for k in _ADVANCED_PLAYERS_CACHE if k[0] == stage and k[1] != version_hash]
        for k in stale_keys:
            _ADVANCED_PLAYERS_CACHE.pop(k, None)
        _ADVANCED_PLAYERS_CACHE[(stage, version_hash)] = data


def get_cached_player_card(stage: str, player_key: str, version_hash: str) -> Optional[Dict[str, Any]]:
    with _CACHE_LOCK:
        return _PLAYER_CARD_CACHE.get((stage, player_key, version_hash))


def set_cached_player_card(stage: str, player_key: str, version_hash: str, data: Dict[str, Any]) -> None:
    with _CACHE_LOCK:
        stale_keys = [k for k in _PLAYER_CARD_CACHE if k[2] != version_hash]
        for k in stale_keys:
            _PLAYER_CARD_CACHE.pop(k, None)
        _PLAYER_CARD_CACHE[(stage, player_key, version_hash)] = data


def get_cached_clutch_leaderboard(
    key: Tuple[str, str, str, int, float, int, str]
) -> Optional[Dict[str, Any]]:
    with _CACHE_LOCK:
        return _CLUTCH_LEADERBOARD_CACHE.get(key)


def set_cached_clutch_leaderboard(
    key: Tuple[str, str, str, int, float, int, str], data: Dict[str, Any]
) -> None:
    with _CACHE_LOCK:
        version_hash = key[-1]
        stale_keys = [k for k in _CLUTCH_LEADERBOARD_CACHE if k[-1] != version_hash]
        for k in stale_keys:
            _CLUTCH_LEADERBOARD_CACHE.pop(k, None)
        _CLUTCH_LEADERBOARD_CACHE[key] = data


def clear_all_data_caches(re_warmup: bool = False) -> None:
    """清除所有記憶體快取，並可選擇在背景立即預熱最新資料。"""
    with _CACHE_LOCK:
        _ADVANCED_PLAYERS_CACHE.clear()
        _PLAYER_CARD_CACHE.clear()
        _CLUTCH_LEADERBOARD_CACHE.clear()
    for cb in list(_EXTERNAL_CLEAR_CALLBACKS):
        try:
            cb()
        except Exception:
            pass
    if re_warmup and _WARMUP_CALLBACK is not None:
        threading.Thread(target=_WARMUP_CALLBACK, daemon=True).start()


def apply_versioned_etag(
    response: Response,
    version_hash: str,
    if_none_match: Optional[str] = None,
) -> Optional[Response]:
    """設定 Cache-Control: no-cache 與 ETag，若 If-None-Match 命中則回傳 304 Not Modified。"""
    etag_value = f'"{version_hash}"'
    response.headers["Cache-Control"] = "no-cache"
    response.headers["ETag"] = etag_value
    if if_none_match:
        candidates = [
            tag.strip().removeprefix("W/").strip().strip('"')
            for tag in if_none_match.split(",")
        ]
        if version_hash in candidates or "*" in candidates:
            return Response(
                status_code=304,
                headers={
                    "Cache-Control": "no-cache",
                    "ETag": etag_value,
                },
            )
    return None

from contextlib import contextmanager
import os
import sqlite3
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
DB_PATH = DATA_DIR / "tpbl_stats.db"


def get_db_connection() -> sqlite3.Connection:
    """建立 SQLite 資料庫連線，開啟 WAL 模式、鎖等待超時與 Row 物件"""
    conn = sqlite3.connect(DB_PATH, timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 30000;")
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    return conn


@contextmanager
def db_session():
    """資料庫交易上下文管理器：確保例外自動 rollback 並必定關閉連線"""
    conn = get_db_connection()
    try:
        yield conn
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
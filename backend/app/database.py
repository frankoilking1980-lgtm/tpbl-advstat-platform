import os
import sqlite3
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
DB_PATH = DATA_DIR / "tpbl_stats.db"


def get_db_connection() -> sqlite3.Connection:
    """建立 SQLite 資料庫連線，並開啟 Row 物件方便按欄位取值"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn
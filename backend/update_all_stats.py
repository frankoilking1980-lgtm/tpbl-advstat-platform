"""
TPBL 賽後全自動數據精算一鍵入口腳本
----------------------------------------------------------------
用法範例：
  1. 僅重算所有進階 JSON（使用現有 raw_game_stats 與 DB）：
     python backend/update_all_stats.py

  2. 先抓最新官方比賽 (Stats + Broadcasts) 再一次重算全部 JSON：
     python backend/update_all_stats.py --fetch 27556 -g 15 -c 1

  3. 補抓多場並跳過已存在檔案後重算：
     python backend/update_all_stats.py --fetch 27542 -g 1 -c 16 --skip-existing
"""

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
STAGING_DIR = BACKEND_DIR / "data" / "staging"

CALC_STEPS = [
    ("calculate_pbp_lineups.py", "真實 PBP On/Off 與五人陣容"),
    ("calculate_player_situations.py", "球員得分構成與 Q4 抗壓"),
    ("calculate_team_situations.py", "團隊先發/替補與本土/洋將結構"),
    ("calculate_player_pr.py", "全聯盟 PR 百分位"),
]


def sync_season_data_to_backend():
    """確保 data/season2026 的最新 Excel/JSON 同步至 backend/data/season2026，讓 Docker / Cloud Run 打包一致"""
    src_dir = PROJECT_ROOT / "data" / "season2026"
    dst_dir = BACKEND_DIR / "data" / "season2026"
    if not src_dir.exists():
        return
    dst_dir.mkdir(parents=True, exist_ok=True)
    copied = 0
    for f in src_dir.iterdir():
        if f.is_file() and not f.name.startswith("~$"):
            shutil.copy2(f, dst_dir / f.name)
            copied += 1
    print(f"📦 已同步 {copied} 個 season2026 檔案至 {dst_dir}")


def run_step(label: str, cmd: list[str], env: dict | None = None):
    print(f"\n▶ {label}")
    print(f"  指令: {' '.join(cmd)}")
    t0 = time.time()
    subprocess.run(cmd, cwd=str(BACKEND_DIR), env=env, check=True)
    print(f"✅ 完成 ({time.time() - t0:.2f}s)")


def main():
    parser = argparse.ArgumentParser(description="TPBL 賽後全自動數據精算一鍵腳本")
    parser.add_argument("--fetch", type=int, default=None, help="起始官網 Schedule ID（有指定時先執行官方資料抓取）")
    parser.add_argument("-g", "--g_num", type=int, default=1, help="起始場次編號 Gxx（預設 1）")
    parser.add_argument("-c", "--count", type=int, default=1, help="連續抓取場數（預設 1）")
    parser.add_argument("--skip-existing", action="store_true", help="抓取時跳過已存在的 stats / broadcasts 檔案")
    parser.add_argument("--staging", action="store_true", help="預覽暫存模式：讀取 staging DB 並輸出 JSON 至 backend/data/staging/")
    args = parser.parse_args()

    total_t0 = time.time()
    print("=" * 64)
    print("🏀 TPBL 賽後全自動數據精算一鍵流程啟動" + (" [STAGING 預覽模式]" if args.staging else ""))
    print("=" * 64)

    sub_env = os.environ.copy()
    if args.staging:
        STAGING_DIR.mkdir(parents=True, exist_ok=True)
        sub_env["TPBL_DB_PATH"] = str(STAGING_DIR / "tpbl_stats_staging.db")
        sub_env["TPBL_STAGING_OUT_DIR"] = str(STAGING_DIR)
    else:
        sync_season_data_to_backend()

    if args.fetch is not None:
        fetch_cmd = [
            sys.executable,
            str(BACKEND_DIR / "fetch_tpbl_boxscores.py"),
            str(args.fetch),
            "-g",
            str(args.g_num),
            "-c",
            str(args.count),
        ]
        if args.skip_existing:
            fetch_cmd.append("--skip-existing")
        run_step("步驟 0：抓取官方 Stats 與 Broadcasts", fetch_cmd, env=sub_env)

    total_steps = len(CALC_STEPS)
    for idx, (script_name, desc) in enumerate(CALC_STEPS, start=1):
        script_path = BACKEND_DIR / script_name
        if not script_path.exists():
            raise FileNotFoundError(f"找不到精算腳本：{script_path}")
        run_step(f"步驟 [{idx}/{total_steps}]：{desc} ({script_name})", [sys.executable, str(script_path)], env=sub_env)

    print("\n" + "=" * 64)
    print(f"🎉 全部精算與前後端 JSON 同步完成！總耗時：{time.time() - total_t0:.2f}s")
    print("=" * 64)


if __name__ == "__main__":
    main()

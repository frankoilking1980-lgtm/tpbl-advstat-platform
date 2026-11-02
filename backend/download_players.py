import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import requests

CURRENT_DIR = Path.cwd()
if CURRENT_DIR.name == "backend":
    OUTPUT_DIR = CURRENT_DIR.parent / "frontend" / "public" / "players"
else:
    OUTPUT_DIR = CURRENT_DIR / "frontend" / "public" / "players"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0"
}

def fetch_and_save(pid: int):
    api_url = f"https://api.tpbl.basketball/api/players/{pid}"
    try:
        res = requests.get(api_url, headers=HEADERS, timeout=4)
        if res.status_code == 200:
            data = res.json()
            player_name = data.get("name", "").strip()
            team_info = data.get("team", {})
            team_name = team_info.get("name", "未分配隊伍") if isinstance(team_info, dict) else "未分配隊伍"

            images = data.get("images", [])
            target_url = ""
            for img in images:
                if img.get("key") in ["xl", "lg"]:
                    target_url = img.get("url")
                    if img.get("key") == "xl":
                        break
            if not target_url and images:
                target_url = images[-1].get("url", "")

            if player_name and target_url:
                target_file = OUTPUT_DIR / f"{player_name}.png"
                if target_file.exists():
                    print(f"[{pid}] [已存在] {player_name}")
                    return

                img_res = requests.get(target_url.split("?")[0], headers=HEADERS, timeout=10)
                if img_res.status_code == 200 and len(img_res.content) > 3000:
                    with open(target_file, "wb") as f:
                        f.write(img_res.content)
                    print(f"[{pid}] [✓ 下載成功] {player_name} ({team_name}) -> {player_name}.png ({len(img_res.content)//1024} KB)")
    except Exception as e:
        pass

def main():
    print("=" * 65)
    print("🏀 下載 1~99 核心頂級球星照片 (林書豪/林書緯/蔣淯安/謝亞軒等)")
    print(f"📁 儲存路徑: {OUTPUT_DIR.resolve()}")
    print("=" * 65)

    pids = list(range(1, 100))
    with ThreadPoolExecutor(max_workers=20) as executor:
        executor.map(fetch_and_save, pids)

    total_pngs = len(list(OUTPUT_DIR.glob("*.png")))
    print("\n" + "=" * 65)
    print(f"🎉 補齊完成！目前本地球員庫總數已達: {total_pngs} 位球員！")
    print("=" * 65)

if __name__ == "__main__":
    main()
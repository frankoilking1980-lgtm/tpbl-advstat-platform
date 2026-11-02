import requests
from concurrent.futures import ThreadPoolExecutor

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

# 鎖定未排查的極小區間 (1~99) 與 17400~18500
check_ids = list(range(1, 100)) + list(range(17400, 18500))

def scan(pid):
    try:
        r = requests.get(f"https://api.tpbl.basketball/api/players/{pid}", headers=headers, timeout=2.5)
        if r.status_code == 200:
            d = r.json()
            name = d.get("name", "").strip()
            team = d.get("team", {}).get("name", "未分配") if isinstance(d.get("team"), dict) else "未分配"
            alt = d.get("meta", {}).get("alt_name", "")
            print(f"[{pid}] 姓名: {name} | 英文/別名: {alt} | 球隊: {team}")
    except Exception:
        pass

def main():
    print(f"[*] 正在無條件掃描 ID 1~99 與 17400~18500 (共 {len(check_ids)} 個 ID)...")
    with ThreadPoolExecutor(max_workers=35) as ex:
        ex.map(scan, check_ids)
    print("[*] 掃描完畢。")

if __name__ == "__main__":
    main()
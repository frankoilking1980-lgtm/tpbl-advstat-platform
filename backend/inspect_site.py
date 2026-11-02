import re
import requests

headers = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
}

print("[*] 正在解析 https://kings.tpbl.basketball/team ...")
r = requests.get("https://kings.tpbl.basketball/team", headers=headers)

# 搜尋 HTML 內嵌數據中的圖片字串
img_candidates = re.findall(r'["\']([^"\']+\.(?:png|jpg|jpeg|webp))["\']', r.text, re.I)
player_imgs = [
    img for img in img_candidates
    if not any(x in img.lower() for x in ['noise', 'bg-', 'empty-', 'border', 'logo', 'nuxt'])
]

unique_imgs = list(set(player_imgs))
print(f"\n[*] 成功擷取潛在球員圖片 ({len(unique_imgs)} 個):")
for img in unique_imgs:
    print("  ->", img)

# 印出包含這些圖片網址附近的原始文字片段，查看球員姓名如何對應
if unique_imgs:
    sample_img = unique_imgs[0].split("/")[-1]
    print(f"\n[*] 範例圖片 [{sample_img}] 在原始碼周邊的文本片段:")
    pos = r.text.find(sample_img)
    if pos != -1:
        start = max(0, pos - 150)
        end = min(len(r.text), pos + 150)
        print(r.text[start:end])
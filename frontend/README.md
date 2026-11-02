# TPBL 進階籃球數據與戰術焦點分析平台 - 前端工程

本專案為 TPBL (Taiwan Professional Basketball League) 總冠軍賽進階數據平台之現代化前端介面，基於 **Next.js (App Router, TypeScript)** 與 **Tailwind CSS (深色模式)** 建構，串接本地 FastAPI 後端 (`http://localhost:8000`)。

---

## 一、專案目錄結構

```text
frontend/
├── app/
│   ├── layout.tsx         # 全域深色主題、頂部導航與頁尾佈局
│   ├── page.tsx           # 首頁：總冠軍系列賽戰況、G01~G07 賽事実況與戰力洞察
│   ├── games/
│   │   └── [id]/
│   │       └── page.tsx   # 單場賽事深度覆盤頁 (重點核心頁面)
│   └── globals.css        # 全域深色樣式與平滑滾動設定
├── components/
│   ├── Navbar.tsx         # 頂部導航列與 API 狀態標籤
│   ├── ScoreBanner.tsx    # 主客隊大比分實況橫幅與勝負高亮
│   ├── TacticsCard.tsx    # 焦點對位卡片 (徹底解決文字截斷、支援自動換行)
│   └── FourFactorsBar.tsx # 雙向團隊攻防四要素對決條 (Dean Oliver)
├── package.json
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
└── next.config.js
```

---

## 二、重點功能與排版亮點

1. **單場焦點對位交鋒 (WOWY Matchup) 徹底解決文字截斷**：
   - 位於 [`components/TacticsCard.tsx`](file:///c:/Project/tpbl-advstats/tpbl-platform/frontend/components/TacticsCard.tsx) 與 [`app/games/[id]/page.tsx`](file:///c:/Project/tpbl-advstats/tpbl-platform/frontend/app/games/%5Bid%5D/page.tsx)。
   - 採用雙欄左右排版（客隊焦點 vs 主隊焦點）。
   - 長文本採用 `whitespace-normal break-words leading-relaxed` 排版，直接完整展開展示文字，絕不被表格或單元格遮蔽，亦無須點擊才能閱讀。
   - 單場關鍵總結 (`is_summary == true`) 具備醒目的綠色/橘色外框與發光徽章強調。

2. **Dean Oliver 攻防四大要素條 ([`FourFactorsBar.tsx`](file:///c:/Project/tpbl-advstats/tpbl-platform/frontend/components/FourFactorsBar.tsx))**：
   - 雙向直觀比較兩隊：有效命中率 (eFG%)、失誤次數 (TOV)、進攻籃板率 (ORB%) 與罰球率 (FTr)。

3. **單場球員 Boxscore 與進階數據表**：
   - 支援主客隊一鍵切換。
   - 呈現出賽時間、傳統攻守數據，以及進階指標 **eFG%**、**TS%**、**USG%** 與 **Game Score (GmSc)**。

---

## 三、快速啟動指南

### 步驟 1：啟動後端 API 服務

請先確認後端服務已在另一個終端機視窗中啟動：

```powershell
cd c:\Project\tpbl-advstats\tpbl-platform\backend
uvicorn app.main:app --reload --port 8000
```

> 後端 API 文件位於：[http://localhost:8000/docs](http://localhost:8000/docs)

### 步驟 2：啟動前端開發伺服器

打開另一個終端機視窗，進入 `frontend` 目錄執行：

```powershell
cd c:\Project\tpbl-advstats\tpbl-platform\frontend
npm run dev
```

### 步驟 3：在瀏覽器中瀏覽

- **首頁 (賽事總覽)**：[http://localhost:3000](http://localhost:3000)
- **單場深度覆盤 (G07 冠軍戰)**：[http://localhost:3000/games/G07](http://localhost:3000/games/G07)
- **單場深度覆盤 (G01 首戰)**：[http://localhost:3000/games/G01](http://localhost:3000/games/G01)

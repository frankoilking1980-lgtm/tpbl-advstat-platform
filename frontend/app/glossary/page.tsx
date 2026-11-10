'use client';

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import {
  BookOpen,
  HelpCircle,
  Calculator,
  Compass,
  Zap,
  Target,
  Sparkles,
  ChevronRight,
  Clock,
  Crosshair,
  BarChart3,
  Layers,
  Swords,
  Shield,
  Users,
  Activity,
} from 'lucide-react';

interface GlossaryData {
  four_factors: Array<{
    term: string;
    formula: string;
    description: string;
    benchmark: string;
  }>;
  advanced_metrics: Array<{
    term: string;
    formula: string;
    description: string;
    benchmark: string;
  }>;
  pbp_wowy: Array<{
    term: string;
    description: string;
    interpretation: string;
  }>;
}

export default function GlossaryPage() {
  const [activeTab, setActiveTab] = useState<'factors' | 'metrics' | 'tabs' | 'matchup' | 'pbp' | 'scout'>('factors');
  const { data, isLoading } = useSWR<GlossaryData>('/api/glossary', fetcher);

  // 監聽網址 Hash 錨點 (例如從對決模擬器點擊「模型依據」直達 #matchup-model)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash === '#matchup-model' || hash === '#matchup') {
        setActiveTab('matchup');
        setTimeout(() => {
          const el = document.getElementById('matchup-model');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 150);
      }
    }
  }, []);

  return (
    <div className="space-y-10">
      {/* 標題與引言 */}
      <div className="relative overflow-hidden rounded-3xl border border-[#30363D] bg-[#161B22] p-6 sm:p-8 shadow-2xl">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#00E676]/15 border border-[#00E676]/30 text-[#00E676] text-xs font-black uppercase tracking-wider">
            <BookOpen className="w-4 h-4" />
            <span>TPBL 進階數據判讀指引與公式寶典</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            📚 進階籃球數據辭典 (Analytics Glossary)
          </h1>
          <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
            現代籃球數據分析不再僅停留在傳統得分與命中率。本辭典詳解 Dean Oliver 四大要素、球隊對決模擬推演引擎、PBP With-Or-Without-You (WOWY) 淨影響力、球員卡三大進階分頁之運算邏輯與球探基準標準。
          </p>
        </div>
      </div>

      {/* Tab 切換器 */}
      <div className="flex flex-wrap gap-2 border-b border-[#21262D] pb-3">
        <button
          onClick={() => setActiveTab('factors')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === 'factors'
              ? 'bg-[#161B22] text-[#00E676] border border-[#00E676]/40 shadow'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Target className="w-4 h-4" />
          <span>團隊四大要素 (Four Factors)</span>
        </button>

        <button
          onClick={() => setActiveTab('matchup')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === 'matchup'
              ? 'bg-[#161B22] text-[#FF9100] border border-[#FF9100]/40 shadow'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Swords className="w-4 h-4" />
          <span>⚔️ 球隊對決模擬模型 (Matchup Engine)</span>
        </button>

        <button
          onClick={() => setActiveTab('metrics')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === 'metrics'
              ? 'bg-[#161B22] text-amber-400 border border-amber-400/40 shadow'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span>核心進階指標 (TS%, USG%, GmSc, ORtg)</span>
        </button>

        <button
          onClick={() => setActiveTab('tabs')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === 'tabs'
              ? 'bg-[#161B22] text-cyan-400 border border-cyan-400/40 shadow'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>🎴 球員卡三大分頁解析 (Tabs Guide)</span>
        </button>

        <button
          onClick={() => setActiveTab('pbp')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === 'pbp'
              ? 'bg-[#161B22] text-sky-400 border border-sky-400/40 shadow'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>PBP 原理與 WOWY 影響力</span>
        </button>

        <button
          onClick={() => setActiveTab('scout')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === 'scout'
              ? 'bg-[#161B22] text-emerald-400 border border-emerald-400/40 shadow'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Compass className="w-4 h-4" />
          <span>球探判讀指引與實戰基準</span>
        </button>
      </div>

      {/* 1. 四大要素 */}
      {activeTab === 'factors' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {data?.four_factors.map((item, idx) => (
            <div
              key={idx}
              className="p-6 rounded-3xl border border-[#30363D] bg-[#161B22] shadow-xl space-y-4 hover:border-[#00E676]/40 transition-all"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#21262D]">
                <h3 className="text-lg font-black text-white">{item.term}</h3>
                <span className="text-xs px-2.5 py-1 rounded-full bg-[#00E676]/10 text-[#00E676] font-mono font-bold">
                  權重指標
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#0E1117] border border-[#21262D] font-mono text-xs text-[#00E676] font-bold">
                公式: {item.formula}
              </div>

              <p className="text-sm text-gray-300 leading-relaxed">{item.description}</p>

              <div className="pt-3 border-t border-[#21262D] flex items-center justify-between text-xs">
                <span className="text-gray-500 font-bold">判讀基準:</span>
                <span className="text-amber-300 font-semibold">{item.benchmark}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2. 專屬新增：球隊深度對決模擬器 (Matchup Simulator) 核心演算法 */}
      {activeTab === 'matchup' && (
        <div id="matchup-model" className="space-y-8 scroll-mt-24">
          <div className="p-6 sm:p-8 rounded-3xl border border-[#FF9100]/40 bg-[#161B22] shadow-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#21262D]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-[#FF9100]/15 border border-[#FF9100]/30 text-[#FF9100]">
                  <Swords className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-white">
                    球隊深度對決模擬器 (Head-to-Head Lineup Matchup) 核心演算法
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    基於真實攻防交互對衝、Dean Oliver 四要素加權與主力輪替分級之預測模型
                  </p>
                </div>
              </div>
              <span className="text-xs px-3 py-1 rounded-full bg-[#FF9100]/10 text-[#FF9100] font-mono font-bold self-start sm:self-auto border border-[#FF9100]/30">
                TPBL 2026-2027 專用模型
              </span>
            </div>

            <p className="text-sm text-gray-300 leading-relaxed">
              傳統陣容模擬最常見的致命錯誤是「將 5 名先發球員的場均得分簡單相加」，這會完全忽略球權排擠、輪替出場時間折算，以及最關鍵的<strong className="text-white">「對手防守壓迫（Opponent Defense）」</strong>。本平台對決模擬器採用自底向上的交叉對抗架構，確保所有數據指標前後邏輯一致，絕不憑空臆測。
            </p>

            {/* 六大核心維度卡牌 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {/* 1. 交叉防守壓制 */}
              <div className="bg-[#0E1117] p-5 sm:p-6 rounded-2xl border border-[#21262D] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-[#FF9100] flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    <span>1. 雙向防守對衝與命中率壓制 (Defensive Disruption)</span>
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#FF9100]/10 text-[#FF9100] font-mono">
                    消除虛胖
                  </span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  若只看進攻數據，帳面得分高的球隊往往會產生大勝 10+ 分的數值通膨。本模型加入<strong className="text-gray-200">防守對位折算</strong>：隊 A 之實質投籃效率（Real eFG%），將受到隊 B 之抄截與阻攻壓迫（Stocks = STL + BLK）實時扣減；若隊 A 之先發球權集中度（USG%）過高且缺乏專職組織者，面對外圍大鎖時將被加計失誤懲罰，避免攻強守弱球隊失真獲勝。
                </p>
              </div>

              {/* 2. 8~9人核心輪替分級 */}
              <div className="bg-[#0E1117] p-5 sm:p-6 rounded-2xl border border-[#21262D] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-[#00E676] flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <span>2. 8~9 人智慧分級輪替 (Core Rotation Model)</span>
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#00E676]/10 text-[#00E676] font-mono">
                    防止腰斬
                  </span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  現代職業籃球勝負約 90% 取決於先發 5 人加 3~4 名主力替補。系統自動依據球員歷史出場時間（MPG）與表現（GmSC）分級：
                  <strong className="text-white">先發 5 人享有 1.0 滿額權重</strong>；
                  <strong className="text-white">板凳前 4 位核心替補（第 6~9 人）享有 0.80 實質發揮權重</strong>；
                  深層替補（第 10~14 人）僅佔 0.20 應急權重。如此可防止板凳名單人數變動而惡意稀釋核心主力（如第六人溫布許）的出場時間。
                </p>
              </div>

              {/* 3. 先發救急保底機制 */}
              <div className="bg-[#0E1117] p-5 sm:p-6 rounded-2xl border border-[#21262D] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-[#2979FF] flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    <span>3. 傷兵殘陣先發保底 (Replacement Level Floor)</span>
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#2979FF]/10 text-[#2979FF] font-mono">
                    極端情境抗壓
                  </span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  針對季初樣本不足、或主力受傷導致「0 分 / 邊緣綠葉球員被頂上先發」之極端情境（如遭遇傷兵潮），模型引入替補救急底限（Floor Adjustment）。凡被指派為先發者，保底賦予基礎出賽時間與職籃先發最低貢獻（5.0 分、2.5 籃板、1.2 助攻），精準反映出陣容深度受損，同時避免系統判定為「少打一人」之離譜低分。
                </p>
              </div>

              {/* 4. 團隊籃板與戰術傳導常態化 */}
              <div className="bg-[#0E1117] p-5 sm:p-6 rounded-2xl border border-[#21262D] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-cyan-400 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    <span>4. 團隊籃板與戰術傳導常態化 (Team Boxscore Baseline)</span>
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-400/10 text-cyan-400 font-mono">
                    全場 48 分鐘校準
                  </span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  官方 Boxscore 中每場固定存在 8~10 個未歸屬於任何個人之「團隊籃板（Team Rebounds：投籃未碰出界、罰球進攻違例等）」。本模型在計算全隊 14 人數據時，自動納入團隊籃板基準（+8.5 個）與戰術體系流動助攻補償（+5.5 次），使整場數據客觀回歸至全隊約 44~48 顆籃板、20~24 次助攻之真實職籃比賽常態。
                </p>
              </div>

              {/* 5. 四要素加權矩陣 */}
              <div className="bg-[#0E1117] p-5 sm:p-6 rounded-2xl border border-[#21262D] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-amber-300 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    <span>5. Dean Oliver 四要素加權淨勝分權重</span>
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-400/10 text-amber-300 font-mono">
                    標準權重
                  </span>
                </div>
                <div className="space-y-1.5 text-xs font-mono text-gray-300">
                  <div className="flex justify-between"><span>• 投籃真實效率差 (Shooting / eFG%)</span><strong className="text-[#00E676]">權重 40%</strong></div>
                  <div className="flex justify-between"><span>• 傳導組織與失誤控制 (Playmaking / AST)</span><strong className="text-sky-400">權重 25%</strong></div>
                  <div className="flex justify-between"><span>• 禁區制空與籃板衝搶 (Rebounding / REB)</span><strong className="text-amber-400">權重 20%</strong></div>
                  <div className="flex justify-between"><span>• 防守干擾與壓迫破壞 (Stocks / STL+BLK)</span><strong className="text-purple-400">權重 15%</strong></div>
                </div>
              </div>

              {/* 6. TPBL 規則硬限制與勝率推算 */}
              <div className="bg-[#0E1117] p-5 sm:p-6 rounded-2xl border border-[#21262D] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-purple-400 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4" />
                    <span>6. TPBL 規則檢驗與勝率推算公式</span>
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-purple-400/10 text-purple-400 font-mono">
                    聯盟官方標準
                  </span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  <strong className="text-white">洋將鐵律防呆：</strong>先發 5 人洋將上限 2 名；14 人登錄名單洋將總計上限 3 名，超額直接反灰鎖定。<br />
                  <strong className="text-white">勝率推導（Pythagorean Expectation）：</strong>將四要素綜合淨效率差（NetDiff）以阻尼函數壓縮（杜絕 10+ 分暴衝），並帶入常規職籃轉換公式：<code className="text-amber-300">Win% = 50% + NetDiff × 3.8%</code>（限制在 18%～82% 競爭區間）。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. 核心進階指標 */}
      {activeTab === 'metrics' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {data?.advanced_metrics.map((item, idx) => (
            <div
              key={idx}
              className="p-6 rounded-3xl border border-[#30363D] bg-[#161B22] shadow-xl space-y-4 hover:border-[#FF9100]/40 transition-all"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#21262D]">
                <h3 className="text-lg font-black text-white">{item.term}</h3>
                <span className="text-xs px-2.5 py-1 rounded-full bg-[#FF9100]/10 text-[#FF9100] font-mono font-bold">
                  進階指標
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#0E1117] border border-[#21262D] font-mono text-xs text-[#FF9100] font-bold overflow-x-auto">
                公式: {item.formula}
              </div>

              <p className="text-sm text-gray-300 leading-relaxed">{item.description}</p>

              <div className="pt-3 border-t border-[#21262D] flex items-center justify-between text-xs">
                <span className="text-gray-500 font-bold">評級標準:</span>
                <span className="text-[#00E676] font-semibold">{item.benchmark}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4. 球員卡三大分頁解析 (Tabs Guide) */}
      {activeTab === 'tabs' && (
        <div className="space-y-8">
          {/* 總覽說明 */}
          <div className="p-6 rounded-3xl border border-[#30363D] bg-[#161B22] shadow-xl space-y-3">
            <h3 className="text-xl font-black text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-cyan-400" />
              <span>球員戰力卡三大分頁架構設計哲學</span>
            </h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              為避免球員卡被繁雜的傳統數據淹沒，平台採用分層透視架構：
              <span className="text-amber-400 font-bold">「綜合戰力 (Overview)」</span>提供全能六維與常模位階；
              <span className="text-cyan-400 font-bold">「得分情境與終結 (Scoring & Finishing)」</span>將得分拆解為互斥幾何分佈與戰術武器庫；
              <span className="text-emerald-400 font-bold">「末節決勝抗壓 (Q4 Crunch Time)」</span>則專注檢驗比賽最白熱化階段的抗壓心臟。
            </p>
          </div>

          {/* Tab 1: 綜合戰力 (Overview) */}
          <div className="p-6 sm:p-7 rounded-3xl border border-amber-500/30 bg-[#161B22] shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#21262D] pb-3">
              <div className="flex items-center gap-2 text-amber-400 font-black text-lg">
                <BarChart3 className="w-5 h-5" />
                <span>分頁一：綜合戰力 (Overview) — 六維雷達與全聯盟常模</span>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 font-mono font-bold">
                全季標準化
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-[#0E1117] p-4 rounded-2xl border border-gray-800 space-y-2">
                <span className="font-bold text-amber-300 text-sm block">六維戰力雷達評分維度</span>
                <ul className="space-y-1.5 text-gray-300 font-mono">
                  <li><span className="text-white font-bold font-sans">得分 (Scoring)：</span>結合 PPG 與 USG%，評估主動持球產能爆發力。</li>
                  <li><span className="text-white font-bold font-sans">投射 (Shooting)：</span>以 eFG% 與三分把握度為核心的空間威脅。</li>
                  <li><span className="text-white font-bold font-sans">組織 (Playmaking)：</span>場均助攻 (APG) 與助攻失誤比的視野穿透力。</li>
                  <li><span className="text-white font-bold font-sans">籃板 (Rebounding)：</span>進攻與防守籃板率（ORB% / DRB%）的衝搶力。</li>
                  <li><span className="text-white font-bold font-sans">防守 (Defense)：</span>抄截、阻攻、犯規控制及個人防守評級。</li>
                  <li><span className="text-white font-bold font-sans">效率 (Efficiency)：</span>真實命中率 TS% 與單場貢獻值 GmSc 的綜合品質。</li>
                </ul>
              </div>

              <div className="bg-[#0E1117] p-4 rounded-2xl border border-gray-800 space-y-2">
                <span className="font-bold text-amber-300 text-sm block">Percentile Ranking (PR 值) 標籤</span>
                <p className="text-gray-300 leading-relaxed font-sans">
                  以各隊出賽達標且場均時間 ≥ 8 分鐘之輪替球員為全體常模，數值代表<span className="text-amber-400 font-bold">「超越全聯盟百分之幾的球員」</span>：
                </p>
                <div className="space-y-1.5 font-mono pt-1">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/50">PR 90+</span>
                    <span className="text-gray-300 font-sans">聯盟頂尖菁英（全聯盟前 10%）</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/50">PR 75-89</span>
                    <span className="text-gray-300 font-sans">各隊核心主力／優秀先發</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/50">PR 50-74</span>
                    <span className="text-gray-300 font-sans">合格主要輪替球員</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/50">PR &lt; 25</span>
                    <span className="text-gray-300 font-sans">聯盟後段班，該項表現需強化</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tab 2: 得分情境與終結 (Scoring & Finishing) */}
          <div className="p-6 sm:p-7 rounded-3xl border border-cyan-500/30 bg-[#161B22] shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#21262D] pb-3">
              <div className="flex items-center gap-2 text-cyan-400 font-black text-lg">
                <Target className="w-5 h-5" />
                <span>分頁二：得分情境與終結 (Scoring & Finishing) — 戰術武器庫拆解</span>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 font-mono font-bold">
                137 項官方 PBP 指標提煉
              </span>
            </div>

            {/* 1. 得分分佈比例 */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                <span>1. 得分分佈比例 (Scoring Distribution) — 幾何互斥加總 100%</span>
              </h4>
              <p className="text-xs text-gray-300 leading-relaxed">
                將球員的全季總得分，按照球場上的「幾何空間與取分方式」嚴格劃分成四種<strong className="text-white">互不重疊</strong>的板塊。長條圖總和剛好 100%：
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="bg-[#0E1117] p-3.5 rounded-2xl border border-amber-500/30 space-y-1">
                  <span className="text-amber-400 font-bold block">禁區 (Paint PTS %)</span>
                  <div className="font-mono text-gray-400 text-[11px]">公式: 禁區得分 ÷ 總得分</div>
                  <p className="text-gray-300 text-[11px] leading-relaxed pt-1">
                    油漆區內之上籃、低位單打、勾射與灌籃所得分數。佔比高代表以衝擊籃框、空手走位或身材碾壓為主。
                  </p>
                </div>

                <div className="bg-[#0E1117] p-3.5 rounded-2xl border border-sky-500/30 space-y-1">
                  <span className="text-sky-400 font-bold block">三分外線 (3-Point PTS %)</span>
                  <div className="font-mono text-gray-400 text-[11px]">公式: (三分命中 × 3) ÷ 總得分</div>
                  <p className="text-gray-300 text-[11px] leading-relaxed pt-1">
                    三分球進球折算得分。佔比高代表其進攻偏向外線拉開空間，若命中率高則是空間型重砲。
                  </p>
                </div>

                <div className="bg-[#0E1117] p-3.5 rounded-2xl border border-purple-500/30 space-y-1">
                  <span className="text-purple-400 font-bold block">中距離 (Mid-Range PTS %)</span>
                  <div className="font-mono text-gray-400 text-[11px]">公式: 中距跳投得分 ÷ 總得分</div>
                  <p className="text-gray-300 text-[11px] leading-relaxed pt-1">
                    三分線內、禁區外之長兩分或急停跳投。在防守緊縮禁區與三分線時，為王牌單打的硬解指標。
                  </p>
                </div>

                <div className="bg-[#0E1117] p-3.5 rounded-2xl border border-emerald-500/30 space-y-1">
                  <span className="text-emerald-400 font-bold block">罰球 (Free Throw PTS %)</span>
                  <div className="font-mono text-gray-400 text-[11px]">公式: (罰球命中 × 1) ÷ 總得分</div>
                  <p className="text-gray-300 text-[11px] leading-relaxed pt-1">
                    站上罰球線之取分。反映切入撕裂防線、身體碰撞造犯規之能力，亦是陷入得分荒時的止血手段。
                  </p>
                </div>
              </div>
            </div>

            {/* 2. 戰術推進與反擊情境 */}
            <div className="space-y-3 pt-2">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                <span>2. 戰術推進與反擊情境 (Tactical Play Types) — 具重疊特性之情境產出</span>
              </h4>
              <p className="text-xs text-gray-300 leading-relaxed">
                這是官方記錄員在比賽現場標註的「戰術情境」。<strong className="text-white">請注意：這三項可能同時重疊發生</strong>（例如快攻上籃同時算「快攻」也算「抓失誤」）：
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="bg-[#0E1117] p-4 rounded-2xl border border-gray-800 space-y-2">
                  <div className="text-cyan-400 font-bold text-sm">⚡ 快攻轉換 (Fast Break)</div>
                  <div className="space-y-1 text-gray-300 font-mono text-[11px]">
                    <div>• <strong className="text-white">PPG</strong>：全季快攻總得分 ÷ 出賽場次</div>
                    <div>• <strong className="text-white">命中率</strong>：快攻進球數 ÷ 快攻出手數</div>
                  </div>
                  <p className="text-gray-400 text-[11px] leading-relaxed pt-1">
                    <strong className="text-cyan-300">戰術意涵：</strong>衡量推動推進速度、第一拍前場奔襲或快攻追身三分的威脅性。
                  </p>
                </div>

                <div className="bg-[#0E1117] p-4 rounded-2xl border border-gray-800 space-y-2">
                  <div className="text-emerald-400 font-bold text-sm">🔄 二次進攻 (2nd Chance)</div>
                  <div className="space-y-1 text-gray-300 font-mono text-[11px]">
                    <div>• <strong className="text-white">PPG</strong>：進攻籃板後總得分 ÷ 出賽場次</div>
                    <div>• <strong className="text-white">命中率</strong>：二次進攻進球 ÷ 二次進攻出手</div>
                  </div>
                  <p className="text-gray-400 text-[11px] leading-relaxed pt-1">
                    <strong className="text-emerald-300">戰術意涵：</strong>考驗禁區球員跟進衝搶、補籃與二波反應之拼勁及籃下放進效率。
                  </p>
                </div>

                <div className="bg-[#0E1117] p-4 rounded-2xl border border-gray-800 space-y-2">
                  <div className="text-purple-400 font-bold text-sm">🎯 抓失誤反擊 (Off TOV)</div>
                  <div className="space-y-1 text-gray-300 font-mono text-[11px]">
                    <div>• <strong className="text-white">PPG</strong>：抓對手失誤總得分 ÷ 出賽場次</div>
                    <div>• <strong className="text-white">佔比 %</strong>：抓失誤得分 ÷ 個人全季總得分</div>
                  </div>
                  <p className="text-gray-400 text-[11px] leading-relaxed pt-1">
                    <strong className="text-purple-300">戰術意涵：</strong>佔比代表球員有多高比例的得分仰賴對手失誤轉守為攻。
                  </p>
                </div>
              </div>
            </div>

            {/* 3. 終結手段與把握度 */}
            <div className="space-y-3 pt-2">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                <span>3. 終結手段與把握度 (Finishing Breakdown) — 動作命中率 (FG%)</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                <div className="bg-[#0E1117] p-3.5 rounded-2xl border border-purple-500/30">
                  <span className="text-purple-400 font-bold block mb-1">兩分中距跳投</span>
                  <p className="text-gray-400 text-[11px] leading-relaxed">
                    兩分定點跳投、中距急停跳投與翻身後仰之合計把握度。
                  </p>
                </div>

                <div className="bg-[#0E1117] p-3.5 rounded-2xl border border-sky-500/30">
                  <span className="text-sky-400 font-bold block mb-1">三分外線 (全部)</span>
                  <p className="text-gray-400 text-[11px] leading-relaxed">
                    包含定點接球三分、持球急停三分及後撤步三分之全量命中與出手。
                  </p>
                </div>

                <div className="bg-[#0E1117] p-3.5 rounded-2xl border border-blue-500/40 bg-blue-500/5">
                  <span className="text-blue-300 font-bold block mb-1">總跳投合計 (Total JS)</span>
                  <p className="text-gray-400 text-[11px] leading-relaxed">
                    (兩分跳投命中 + 三分命中) ÷ (兩分跳投出手 + 三分出手)。衡量球員純跳投產能之總體把握度。
                  </p>
                </div>

                <div className="bg-[#0E1117] p-3.5 rounded-2xl border border-emerald-500/30">
                  <span className="text-emerald-400 font-bold block mb-1">突破 / 上籃 (Layup)</span>
                  <p className="text-gray-400 text-[11px] leading-relaxed">
                    包含行進間上籃（Layup）與切入突破對抗放籃之籃框終結率。
                  </p>
                </div>

                <div className="bg-[#0E1117] p-3.5 rounded-2xl border border-amber-500/30">
                  <span className="text-amber-400 font-bold block mb-1">禁區灌籃 (Dunk)</span>
                  <p className="text-gray-400 text-[11px] leading-relaxed">
                    快攻單手/雙手暴扣、空中接力與二波補灌之絕對高成功率終結。
                  </p>
                </div>

                <div className="bg-[#0E1117] p-3.5 rounded-2xl border border-rose-500/30">
                  <span className="text-rose-400 font-bold block mb-1">單打自創 (Pull-up / Step-back / Fade)</span>
                  <p className="text-gray-400 text-[11px] leading-relaxed">
                    自主持球急停、後撤步與後仰跳投等不經戰術受助攻之硬解命中率。
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Tab 3: 末節決勝抗壓 (Q4 Crunch Time) */}
          <div className="p-6 sm:p-7 rounded-3xl border border-emerald-500/30 bg-[#161B22] shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#21262D] pb-3">
              <div className="flex items-center gap-2 text-emerald-400 font-black text-lg">
                <Clock className="w-5 h-5" />
                <span>分頁三：末節決勝抗壓 (Q4 Crunch Time) — 關鍵大心臟實證</span>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 font-mono font-bold">
                純第四節獨立篩選
              </span>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              籃球比賽在第四節面臨防守加壓、戰術預讀與體力下滑，數據往往產生劇烈質變。本分頁直接過濾 Round 4 節次數據：
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="bg-[#0E1117] p-4 rounded-2xl border border-gray-800 space-y-1">
                <span className="text-amber-400 font-bold text-sm block">Q4 場均得分 (Q4 PPG)</span>
                <p className="text-gray-300 text-[11px] leading-relaxed">
                  第四節總得分 ÷ 實際出戰第四節場次。評估球員在膠著末節是否具備教練團最高優先級之開火權。
                </p>
              </div>

              <div className="bg-[#0E1117] p-4 rounded-2xl border border-gray-800 space-y-1">
                <span className="text-emerald-400 font-bold text-sm block">Q4 真實命中率 (Q4 TS%)</span>
                <p className="text-gray-300 text-[11px] leading-relaxed">
                  公式: Q4 得分 ÷ [2 × (Q4 出手 + 0.44 × Q4 罰球)]。若高於全場平均，代表具備「抗壓越打越準」大心臟特質。
                </p>
              </div>

              <div className="bg-[#0E1117] p-4 rounded-2xl border border-cyan-400 font-bold text-sm block">
                <span className="text-cyan-400 font-bold text-sm block">Q4 場均正負值 (Q4 +/-)</span>
                <p className="text-gray-300 text-[11px] leading-relaxed">
                  第四節在場時球隊的淨勝分傾向。正值代表末節攻防兩端能實質帶領球隊拉開或守住領先分差。
                </p>
              </div>

              <div className="bg-[#0E1117] p-4 rounded-2xl border border-gray-800 space-y-1">
                <span className="text-rose-400 font-bold text-sm block">Q4 失誤控管 (Q4 TOV/節)</span>
                <p className="text-gray-300 text-[11px] leading-relaxed">
                  第四節平均每節失誤次數。面對末節全場壓迫防守，主要控球者此數值若 ≤ 0.8 次，代表極高之持球安全性。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. PBP 原理與 WOWY */}
      {activeTab === 'pbp' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {data?.pbp_wowy.map((item, idx) => (
              <div
                key={idx}
                className="p-6 rounded-3xl border border-[#30363D] bg-[#161B22] shadow-xl space-y-4 hover:border-sky-500/40 transition-all"
              >
                <div className="flex items-center justify-between pb-3 border-b border-[#21262D]">
                  <h3 className="text-lg font-black text-white">{item.term}</h3>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-400 font-mono font-bold">
                    PBP 陣容指標
                  </span>
                </div>

                <p className="text-sm text-gray-300 leading-relaxed">{item.description}</p>

                <div className="p-4 rounded-2xl bg-[#0E1117] border border-[#21262D] text-xs text-sky-300 leading-relaxed">
                  <span className="font-bold text-white block mb-1">💡 實務判讀指引:</span>
                  {item.interpretation}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. 球探判讀指引與實戰基準 */}
      {activeTab === 'scout' && (
        <div className="space-y-6">
          <div className="p-8 rounded-3xl border border-[#30363D] bg-[#161B22] shadow-xl space-y-6">
            <h3 className="text-xl font-black text-white flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <span>職業球探三維度交叉評定準則</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs sm:text-sm">
              <div className="p-5 rounded-2xl bg-[#0E1117] border border-[#21262D] space-y-2">
                <span className="text-[#00E676] font-black text-sm block">1. 終結 vs 發動 (USG% vs TS%)</span>
                <p className="text-gray-300 leading-relaxed">
                  單看得分難以區分「大量出手堆砌出的低效得分手」與「真正的高效發動機」。高 USG% (&gt; 25%) 同時維持高 TS% (&gt; 58%) 者為年度 MVP 與爭冠體系唯一基石。
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#0E1117] border border-[#21262D] space-y-2">
                <span className="text-[#FF9100] font-black text-sm block">2. 隱形影響力 (Diff NetRtg)</span>
                <p className="text-gray-300 leading-relaxed">
                  許多頂級防守球員在個人傳統攻守表格上數據平平，但其在場與下場時團隊淨評分差 (Diff NetRtg) 可高達 +10 以上，反映出無可替代的體系支柱價值。
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#0E1117] border border-[#21262D] space-y-2">
                <span className="text-sky-400 font-black text-sm block">3. 決勝五人 (Closing Lineup)</span>
                <p className="text-gray-300 leading-relaxed">
                  關鍵第四節最後五分鐘，教練團會優先指派 Lineup NetRtg 為正且失誤率低之組合。透過五人陣容與雙洋將搭檔矩陣，可快速找出攻守最平衡之致命配置。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
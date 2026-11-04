'use client';

import React, { useState } from 'react';
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
  const [activeTab, setActiveTab] = useState<'factors' | 'metrics' | 'pbp' | 'tabs' | 'scout'>('factors');
  const { data, isLoading } = useSWR<GlossaryData>('/api/glossary', fetcher);

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
            現代籃球數據分析不再僅停留在傳統得分與命中率。本辭典詳解 Dean Oliver 四大要素、PBP With-Or-Without-You (WOWY) 淨影響力、球員卡三大進階分頁（得分情境/終結手段/末節抗壓）之運算邏輯與球探基準標準。
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
          onClick={() => setActiveTab('metrics')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === 'metrics'
              ? 'bg-[#161B22] text-[#FF9100] border border-[#FF9100]/40 shadow'
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
              ? 'bg-[#161B22] text-amber-300 border border-amber-300/40 shadow'
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

      {/* 2. 核心進階指標 */}
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

      {/* 3. 專屬新增：球員卡三大分頁解析 (Tabs Guide) */}
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

            {/* 1. 得分分佈比例 (加總 100%) */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                <span>1. 得分分佈比例 (Scoring Distribution) — 幾何互斥加總 100%</span>
              </h4>
              <p className="text-xs text-gray-300 leading-relaxed">
                將球員的全季總得分，按照球場上的「幾何空間與取分方式」嚴格劃分成四種<strong className="text-white">互不重疊</strong>的板塊。長條圖總和剛好 100%，清楚回答「這名球員每場得的分數到底從哪裡來」：
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="bg-[#0E1117] p-3.5 rounded-2xl border border-amber-500/30 space-y-1">
                  <span className="text-amber-400 font-bold block">禁區 (Paint PTS %)</span>
                  <div className="font-mono text-gray-400 text-[11px]">公式: 禁區得分 ÷ 總得分</div>
                  <p className="text-gray-300 text-[11px] leading-relaxed pt-1">
                    油漆區內之上籃、低位單打、勾射與灌籃所得分數。佔比高代表球員以衝擊籃框、空手走位或身材碾壓為主。
                  </p>
                </div>

                <div className="bg-[#0E1117] p-3.5 rounded-2xl border border-sky-500/30 space-y-1">
                  <span className="text-sky-400 font-bold block">三分外線 (3-Point PTS %)</span>
                  <div className="font-mono text-gray-400 text-[11px]">公式: (三分命中 × 3) ÷ 總得分</div>
                  <p className="text-gray-300 text-[11px] leading-relaxed pt-1">
                    三分球進球折算得分。佔比高代表其進攻重力偏向外線拉開空間，若命中率高則是致命的空間型重砲。
                  </p>
                </div>

                <div className="bg-[#0E1117] p-3.5 rounded-2xl border border-purple-500/30 space-y-1">
                  <span className="text-purple-400 font-bold block">中距離 (Mid-Range PTS %)</span>
                  <div className="font-mono text-gray-400 text-[11px]">公式: 中距跳投得分 ÷ 總得分</div>
                  <p className="text-gray-300 text-[11px] leading-relaxed pt-1">
                    三分線內、禁區外之長兩分或急停跳投。在季後賽防守緊縮禁區與三分線時，為頂級王牌單打的硬解指標。
                  </p>
                </div>

                <div className="bg-[#0E1117] p-3.5 rounded-2xl border border-emerald-500/30 space-y-1">
                  <span className="text-emerald-400 font-bold block">罰球 (Free Throw PTS %)</span>
                  <div className="font-mono text-gray-400 text-[11px]">公式: (罰球命中 × 1) ÷ 總得分</div>
                  <p className="text-gray-300 text-[11px] leading-relaxed pt-1">
                    站上罰球線之取分。反映切入撕裂防線、身體碰撞造犯規之能力，亦是進攻陷入冰河期時的重要止血手段。
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
                這是官方記錄員在比賽現場標註的「戰術情境」。<strong className="text-white">請注意：這三項可能同時重疊發生</strong>（例如快攻上籃同時算「快攻」也算「抓失誤」），因此各自獨立統計，不應拼成 100%：
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
                    <strong className="text-purple-300">戰術意涵：</strong>佔比代表球員有多高比例的得分仰賴對手失誤轉守為攻（抄截反擊型前鋒/後衛之典型指標）。
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
              <p className="text-xs text-gray-300 leading-relaxed">
                本區塊呈現球員各類出手動作的<strong className="text-white">「進球數 / 出手數」與「真實投籃命中率 (FG%)」</strong>。我們將跳投完整拆解為兩分與三分，同時保留總和，避免遺漏：
              </p>

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
                    包含定點接球三分、持球急停三分及後撤步三分之全量命中與出手，與官方 Box Score 完全吻合。
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
                    包含行進間上籃（Layup）與切入突破對抗放籃（Driving Layup）之籃框終結率。
                  </p>
                </div>

                <div className="bg-[#0E1117] p-3.5 rounded-2xl border border-amber-500/30">
                  <span className="text-amber-400 font-bold block mb-1">禁區灌籃 (Dunk)</span>
                  <p className="text-gray-400 text-[11px] leading-relaxed">
                    快攻單手/雙手暴扣、空中接力 (Alley-oop) 與二波補灌之絕對高成功率終結。
                  </p>
                </div>

                <div className="bg-[#0E1117] p-3.5 rounded-2xl border border-rose-500/30">
                  <span className="text-rose-400 font-bold block mb-1">單打自創 (Pull-up / Step-back / Fade)</span>
                  <p className="text-gray-400 text-[11px] leading-relaxed">
                    自主持球急停（Pull-up）、後撤步（Step-back）與後仰跳投（Fadeaway）等不經戰術受助攻之硬解命中率。
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
              籃球比賽在第四節面臨防守加壓、戰術預讀與體力下滑，數據往往產生劇烈質變。本分頁直接過濾 Round 4 節次數據，並排除垃圾時間未登板者：
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="bg-[#0E1117] p-4 rounded-2xl border border-gray-800 space-y-1">
                <span className="text-amber-400 font-bold text-sm block">Q4 場均得分 (Q4 PPG)</span>
                <p className="text-gray-300 text-[11px] leading-relaxed">
                  第四節總得分 ÷ 實際出戰第四節場次。搭配 Q4 MPG 可評估球員在膠著末節是否具備教練團最高優先級之開火權。
                </p>
              </div>

              <div className="bg-[#0E1117] p-4 rounded-2xl border border-gray-800 space-y-1">
                <span className="text-emerald-400 font-bold text-sm block">Q4 真實命中率 (Q4 TS%)</span>
                <p className="text-gray-300 text-[11px] leading-relaxed">
                  公式: Q4 得分 ÷ [2 × (Q4 出手 + 0.44 × Q4 罰球)]。若 Q4 TS% 高於全場平均，代表該球員具備「抗壓越打越準」的大心臟特質。
                </p>
              </div>

              <div className="bg-[#0E1117] p-4 rounded-2xl border border-gray-800 space-y-1">
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

      {/* 4. PBP 原理與 WOWY */}
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

      {/* 5. 球探判讀指引與實戰基準 */}
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
                  許多頂級防守球員（如第一線纏鬥大鎖、協防護框者）在個人傳統攻守表格上數據平平，但其在場與下場時團隊淨評分差 (Diff NetRtg) 可高達 +10 以上，反映出無可替代的體系支柱價值。
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
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
  const [activeTab, setActiveTab] = useState<'factors' | 'metrics' | 'pbp' | 'scout'>('factors');
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
            現代籃球數據分析不再僅停留在傳統得分與命中率。本辭典詳解 Dean Oliver 四大要素、PBP With-Or-Without-You (WOWY) 淨影響力、真實命中率 (TS%) 與球權使用率 (USG%) 之運算邏輯與球探基準標準。
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

      {/* 3. PBP 原理與 WOWY */}
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

      {/* 4. 球探判讀指引與實戰基準 */}
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

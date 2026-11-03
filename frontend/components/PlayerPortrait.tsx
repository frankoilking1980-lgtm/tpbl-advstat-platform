'use client';

import React, { useState, useEffect } from 'react';

interface PlayerPortraitProps {
  playerName?: string;
  stage?: string;
  isRightSide?: boolean;
}

interface PlayerPRData {
  badges: {
    [key: string]: {
      val: number;
      pr: number;
    };
  };
}

export function PlayerPortrait({ playerName, stage, isRightSide = false }: PlayerPortraitProps) {
  const [hasError, setHasError] = useState(false);
  const [prData, setPrData] = useState<PlayerPRData | null>(null);

  useEffect(() => {
    if (!playerName) {
      setPrData(null);
      return;
    }

    fetch('/player_pr_stats.json')
      .then((res) => res.json())
      .then((data) => {
        const cleanName = playerName.trim();
        const prStage = data?.meta?.stage || '2026-2027 例行賽';

        // 核心檢查：如果選擇的不是有 PR 數據的賽季 (如 2025-2026)，立刻清空，絕對不顯示！
        if (stage && stage !== prStage) {
          setPrData(null);
          return;
        }

        const playersMap = data?.players || data;
        if (playersMap && playersMap[cleanName]) {
          setPrData(playersMap[cleanName]);
        } else {
          setPrData(null);
        }
      })
      .catch((err) => {
        console.error('PR JSON 讀取失敗:', err);
        setPrData(null);
      });
  }, [playerName, stage]); // 當 playerName 或 stage 切換時重新判定

  if (!playerName) return null;

  // 取得核心指標 (優先 GmSc，其次 PTS)
  const coreMetric = prData?.badges?.['GmSC'] 
    ? { label: 'GmSc', ...prData.badges['GmSC'] }
    : prData?.badges?.['PTS']
    ? { label: 'PTS', ...prData.badges['PTS'] }
    : null;

  // PR 色彩與光暈樣式
  const getBadgeStyle = (pr: number) => {
    if (pr >= 90) {
      return 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.25)]';
    }
    if (pr >= 75) {
      return 'bg-gradient-to-r from-blue-600/25 to-indigo-600/25 text-blue-300 border-blue-400/50 shadow-[0_0_15px_rgba(59,130,246,0.25)]';
    }
    if (pr >= 50) {
      return 'bg-gradient-to-r from-emerald-600/20 to-teal-600/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]';
    }
    if (pr >= 25) {
      return 'bg-slate-800/80 text-slate-300 border-slate-600/50';
    }
    return 'bg-rose-950/40 text-rose-300 border-rose-500/30';
  };

  // 渲染帶有 Tooltip 的 PR 膠囊組件
  const renderPRBadge = () => {
    // 只有在當季有 PR 數值時才渲染，歷史賽季回傳佔位空 div 保持版面高度穩定
    if (!coreMetric) return <div className="h-7 mt-2" />;

    return (
      <div className="relative mt-2 flex flex-col items-center group/tooltip cursor-help select-none">
        {/* 膠囊本體 */}
        <div className={`px-4 py-1 rounded-full border backdrop-blur-md flex items-center gap-2 transition-transform duration-200 group-hover/tooltip:scale-105 ${getBadgeStyle(coreMetric.pr)}`}>
          <span className="text-[11px] font-sans font-semibold opacity-75 uppercase tracking-wider">
            {coreMetric.label}
          </span>
          <span className="text-sm font-mono font-extrabold tracking-tight">
            PR {coreMetric.pr}
          </span>
        </div>

        {/* Mouse Hover 浮動提示框 (Tooltip) */}
        <div className="absolute bottom-full mb-2 hidden group-hover/tooltip:flex flex-col items-center z-50 pointer-events-none animate-fadeIn">
          <div className="bg-[#1C2128]/95 border border-white/15 text-gray-200 text-xs px-3 py-1.5 rounded-lg shadow-2xl backdrop-blur-md whitespace-nowrap text-center">
            <div className="font-semibold text-slate-100 flex items-center justify-center gap-1">
              <span>{coreMetric.label}</span>
              <span className="text-amber-400">PR {coreMetric.pr}</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5 font-normal">
              勝過聯盟 <span className="text-slate-200 font-bold">{coreMetric.pr}%</span> 的輪替球員
            </p>
          </div>
          <div className="w-2 h-2 bg-[#1C2128] border-r border-b border-white/15 rotate-45 -mt-1" />
        </div>
      </div>
    );
  };

  // 1. 照片載入失敗時的預設相框
  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center flex-shrink-0 animate-fadeIn">
        <div className="w-44 h-64 sm:w-52 sm:h-72 rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-[#161B22]/50 p-2 flex items-center justify-center">
          <img
            src="/players/player.png"
            alt="預設剪影"
            className="w-full h-full object-contain"
          />
        </div>
        {renderPRBadge()}
      </div>
    );
  }

  // 2. 正常半身像模式
  return (
    <div className="relative flex flex-col items-center justify-end flex-shrink-0 group">
      {/* 底部投射環境光 */}
      <div className="absolute bottom-6 w-36 h-12 bg-amber-500/10 blur-xl rounded-full pointer-events-none" />

      {/* 球員去背半身像 */}
      <div className="relative w-48 h-64 sm:w-56 sm:h-80 flex items-end justify-center overflow-visible">
        <img
          src={`/players/${encodeURIComponent(playerName.trim())}.png`}
          alt={playerName}
          className={`h-full w-auto max-w-none object-contain select-none transition-all duration-300 group-hover:scale-105 filter drop-shadow-[0_12px_24px_rgba(0,0,0,0.75)] ${
            isRightSide ? '-scale-x-100' : ''
          }`}
          onError={() => setHasError(true)}
        />
      </div>

      {/* 底部 PR 膠囊 */}
      {renderPRBadge()}
    </div>
  );
}
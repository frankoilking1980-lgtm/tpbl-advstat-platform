'use client';

import React from 'react';
import { getTeamLogo } from '@/lib/teamLogos';

interface ScoreBannerProps {
  // 同時支援兩種命名格式，避免 props 傳入不匹配
  homeTeam?: string;
  home_team?: string;
  awayTeam?: string;
  away_team?: string;
  homeScore?: number;
  home_score?: number;
  awayScore?: number;
  away_score?: number;
  date?: string;
  venue?: string;
  status?: string;
  [key: string]: any;
}

export default function ScoreBanner(props: ScoreBannerProps) {
  const home = props.homeTeam || props.home_team || '主隊';
  const away = props.awayTeam || props.away_team || '客隊';
  const hScore = Number(props.homeScore ?? props.home_score ?? 0);
  const aScore = Number(props.awayScore ?? props.away_score ?? 0);
  const matchDate = props.date || '';
  const matchVenue = props.venue || '';

  const isAwayWin = aScore > hScore && (aScore > 0 || hScore > 0);
  const isHomeWin = hScore > aScore && (aScore > 0 || hScore > 0);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-[#30363D] bg-gradient-to-b from-[#161B22] to-[#0E1117] p-6 sm:p-8 shadow-2xl">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        
        {/* 客隊區域 */}
        <div className="flex items-center gap-4 w-full md:w-auto justify-end">
          {isAwayWin && (
            <span className="px-2.5 py-1 rounded-md bg-[#FF9100]/20 text-[#FF9100] text-xs font-black border border-[#FF9100]/40">
              WIN
            </span>
          )}
          <div className="text-right">
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {away}
            </h2>
            <span className="text-xs text-gray-400 font-medium">客隊 (Away)</span>
          </div>

          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#0E1117] border border-[#30363D] p-1.5 flex items-center justify-center flex-shrink-0 shadow-lg">
            <img
              src={getTeamLogo(away)}
              alt={away}
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        {/* 比分顯示核心 */}
        <div className="flex flex-col items-center px-4">
          <div className="flex items-center gap-3 font-mono">
            <span
              className={`text-4xl sm:text-5xl font-black ${
                isAwayWin ? 'text-[#FF9100]' : 'text-gray-300'
              }`}
            >
              {aScore}
            </span>
            <span className="text-3xl text-gray-600 font-light">:</span>
            <span
              className={`text-4xl sm:text-5xl font-black ${
                isHomeWin ? 'text-[#00E676]' : 'text-gray-300'
              }`}
            >
              {hScore}
            </span>
          </div>
          <span className="text-xs text-gray-400 uppercase tracking-widest font-bold mt-1">
            終場比分
          </span>
          {matchDate && (
            <span className="text-[11px] text-gray-500 font-mono mt-0.5">
              {matchDate} {matchVenue ? `• ${matchVenue}` : ''}
            </span>
          )}
        </div>

        {/* 主隊區域 */}
        <div className="flex items-center gap-4 w-full md:w-auto justify-start">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#0E1117] border border-[#30363D] p-1.5 flex items-center justify-center flex-shrink-0 shadow-lg">
            <img
              src={getTeamLogo(home)}
              alt={home}
              className="w-full h-full object-contain"
            />
          </div>

          <div className="text-left">
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {home}
            </h2>
            <span className="text-xs text-gray-400 font-medium">主隊 (Home)</span>
          </div>
          {isHomeWin && (
            <span className="px-2.5 py-1 rounded-md bg-[#00E676]/20 text-[#00E676] text-xs font-black border border-[#00E676]/40">
              WIN
            </span>
          )}
        </div>

      </div>
    </div>
  );
}
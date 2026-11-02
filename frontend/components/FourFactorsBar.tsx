'use client';

import React from 'react';
import { BarChart3, Zap } from 'lucide-react';

interface FactorItem {
  label: string;
  subLabel: string;
  awayVal: number;
  homeVal: number;
  format: (v: number) => string;
  higherIsBetter: boolean;
}

export interface FourFactorsBarProps {
  awayTeam: string;
  homeTeam: string;
  factors?: {
    efg?: { away: number; home: number };
    tov?: { away: number; home: number };
    orb?: { away: number; home: number };
    ftr?: { away: number; home: number };
  };
}

export default function FourFactorsBar({
  awayTeam,
  homeTeam,
  factors,
}: FourFactorsBarProps) {
  // 預設或由單場統計計算之四大要素
  const items: FactorItem[] = [
    {
      label: '有效命中率 (eFG%)',
      subLabel: '投籃效率基礎',
      awayVal: factors?.efg?.away ?? 47.8,
      homeVal: factors?.efg?.home ?? 53.2,
      format: (v) => `${v.toFixed(1)}%`,
      higherIsBetter: true,
    },
    {
      label: '失誤次數 (Turnovers)',
      subLabel: '持球與球權保護',
      awayVal: factors?.tov?.away ?? 16,
      homeVal: factors?.tov?.home ?? 11,
      format: (v) => `${v}`,
      higherIsBetter: false, // 失誤越低越好
    },
    {
      label: '進攻籃板率 (ORB%)',
      subLabel: '二次進攻機會爭搶',
      awayVal: factors?.orb?.away ?? 24.5,
      homeVal: factors?.orb?.home ?? 34.8,
      format: (v) => `${v.toFixed(1)}%`,
      higherIsBetter: true,
    },
    {
      label: '罰球製造率 (FTr)',
      subLabel: '造犯規與站上罰球線能力',
      awayVal: factors?.ftr?.away ?? 22.4,
      homeVal: factors?.ftr?.home ?? 28.6,
      format: (v) => `${v.toFixed(1)}%`,
      higherIsBetter: true,
    },
  ];

  return (
    <div className="rounded-3xl border border-cardBorder bg-card/60 p-6 sm:p-7 shadow-xl">
      <div className="flex items-center justify-between mb-6 pb-3 border-b border-cardBorder/60">
        <div className="flex items-center space-x-2">
          <Zap className="w-5 h-5 text-amber-400" />
          <h3 className="text-lg font-bold text-white tracking-tight">
            團隊攻防四大要素對決 (Dean Oliver Four Factors)
          </h3>
        </div>
        <div className="flex items-center space-x-4 text-xs font-semibold">
          <span className="text-amber-400">{awayTeam}</span>
          <span className="text-gray-500">vs</span>
          <span className="text-emerald-400">{homeTeam}</span>
        </div>
      </div>

      <div className="space-y-5">
        {items.map((item, idx) => {
          const isAwayBetter = item.higherIsBetter
            ? item.awayVal > item.homeVal
            : item.awayVal < item.homeVal;
          const isHomeBetter = item.higherIsBetter
            ? item.homeVal > item.awayVal
            : item.homeVal < item.awayVal;

          const total = item.awayVal + item.homeVal;
          const awayPercent = total > 0 ? (item.awayVal / total) * 100 : 50;
          const homePercent = 100 - awayPercent;

          return (
            <div key={idx} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span
                  className={`font-mono font-bold ${
                    isAwayBetter ? 'text-amber-400' : 'text-gray-400'
                  }`}
                >
                  {item.format(item.awayVal)}
                </span>
                <span className="text-gray-300 font-semibold tracking-wide">
                  {item.label}
                </span>
                <span
                  className={`font-mono font-bold ${
                    isHomeBetter ? 'text-emerald-400' : 'text-gray-400'
                  }`}
                >
                  {item.format(item.homeVal)}
                </span>
              </div>

              {/* 雙向進度條 */}
              <div className="h-3 w-full bg-gray-900 rounded-full overflow-hidden flex p-0.5 border border-cardBorder/80">
                <div
                  style={{ width: `${awayPercent}%` }}
                  className={`h-full rounded-l-full transition-all duration-500 ${
                    isAwayBetter
                      ? 'bg-gradient-to-r from-amber-600 to-amber-400 shadow-sm'
                      : 'bg-gray-700'
                  }`}
                />
                <div
                  style={{ width: `${homePercent}%` }}
                  className={`h-full rounded-r-full transition-all duration-500 ${
                    isHomeBetter
                      ? 'bg-gradient-to-l from-emerald-600 to-emerald-400 shadow-sm'
                      : 'bg-gray-700'
                  }`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

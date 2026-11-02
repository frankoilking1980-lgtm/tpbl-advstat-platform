'use client';

import React from 'react';
import { Target, Flag, Sparkles, CheckCircle2 } from 'lucide-react';

export interface TacticsCardProps {
  id?: number;
  team_name: string;
  category: string;
  description: string;
  is_summary: boolean;
  display_order?: number;
}

export default function TacticsCard({
  team_name,
  category,
  description,
  is_summary,
  display_order,
}: TacticsCardProps) {
  const isKings = team_name.includes('國王');
  const isDreamers = team_name.includes('夢想家');

  // 戰術結論與常規對位項目的樣式區分
  const containerClasses = is_summary
    ? 'relative p-5 rounded-2xl border-2 transition-all duration-200 shadow-lg ' +
      (isDreamers
        ? 'border-emerald-500/70 bg-gradient-to-br from-emerald-950/40 via-card to-card shadow-emerald-500/10'
        : 'border-amber-500/70 bg-gradient-to-br from-amber-950/40 via-card to-card shadow-amber-500/10')
    : 'relative p-5 rounded-2xl border border-cardBorder bg-card/80 hover:border-gray-600 transition-all duration-200 shadow-md';

  return (
    <div className={containerClasses}>
      {/* 頂部標籤區 */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center space-x-2">
          {is_summary ? (
            <span
              className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                isDreamers
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>單場勝負關鍵總結</span>
            </span>
          ) : (
            <span
              className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                isKings
                  ? 'bg-amber-400/10 text-amber-300 border border-amber-400/20'
                  : 'bg-emerald-400/10 text-emerald-300 border border-emerald-400/20'
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              <span>{team_name} 焦點對位</span>
            </span>
          )}
        </div>

        {display_order !== undefined && (
          <span className="text-xs font-mono text-gray-500">#{display_order}</span>
        )}
      </div>

      {/* 對位標題 (category) */}
      <h4 className="text-base sm:text-lg font-bold text-white mb-2 leading-snug tracking-tight">
        {category}
      </h4>

      {/* 攻防表現與命中率變化長文本 (徹底解決截斷問題，自動完整展開換行) */}
      <p className="text-sm sm:text-base text-gray-300 whitespace-normal break-words leading-relaxed select-text">
        {description}
      </p>

      {/* 底部強調橫條 */}
      {is_summary && (
        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-gray-400 font-medium">
          <div className="flex items-center space-x-1.5 text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>冠軍系列賽關鍵走勢判定</span>
          </div>
          <span className="text-gray-500">自動排版・完整呈現</span>
        </div>
      )}
    </div>
  );
}

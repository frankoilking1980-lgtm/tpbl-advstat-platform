'use client';

import React from 'react';
import Link from 'next/link';
import { useStage } from '@/context/StageContext';
import { Database, BookOpen, Swords } from 'lucide-react';

export default function Footer() {
  const { stage, lastUpdated, globalLastUpdated, gameCount } = useStage();

  // 從目前賽季名稱萃取出精簡賽季標籤（例如 "2026-2027 例行賽" -> "2026-27"）
  const rawYear = stage.split(' ')[0] || '2026-2027';
  const shortYear = rawYear.includes('-')
    ? `${rawYear.split('-')[0]}-${rawYear.split('-')[1].slice(-2)}`
    : rawYear;

  const displayDate = lastUpdated || globalLastUpdated || '2026-11-08';

  return (
    <footer className="border-t border-[#21262D] bg-[#0B0E14] text-gray-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-center sm:text-left">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#00E676]/10 border border-[#00E676]/25 text-[#00E676] font-semibold">
            <Database className="w-3.5 h-3.5" />
            <span>
              數據已同步至：{displayDate}（TPBL {shortYear} 賽季
              {gameCount > 0 ? `・已收錄 ${gameCount} 場` : ''}）
            </span>
          </span>
          <span className="text-gray-600 hidden sm:inline">|</span>
          <span className="text-gray-400 font-medium">獨立開發維護</span>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/glossary"
            className="inline-flex items-center gap-1.5 text-gray-400 hover:text-[#00E676] transition-colors font-medium"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>進階數據辭典</span>
          </Link>
          <Link
            href="/glossary#matchup-logic"
            className="inline-flex items-center gap-1.5 text-gray-400 hover:text-[#FF9100] transition-colors font-medium"
          >
            <Swords className="w-3.5 h-3.5" />
            <span>模擬器推演邏輯</span>
          </Link>
        </div>
      </div>
    </footer>
  );
}

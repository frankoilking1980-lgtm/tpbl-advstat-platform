'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStage } from '@/context/StageContext';
import {
  Trophy,
  ScatterChart,
  CalendarDays,
  Zap,
  Users,
  Swords,
  BookOpen,
  ChevronDown,
  Sparkles,
} from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const { stage, setStage, stagesList } = useStage();

  const navItems = [
    {
      label: '7隊戰力評級',
      href: '/',
      icon: Trophy,
      exact: true,
    },
    {
      label: '主力效率象限圖',
      href: '/scatter',
      icon: ScatterChart,
      exact: false,
    },
    {
      label: '逐場賽事覆盤',
      href: '/games',
      icon: CalendarDays,
      exact: false,
    },
    {
      label: '各隊 PBP 與 On/Off',
      href: '/pbp',
      icon: Zap,
      exact: false,
    },
    {
      label: '球員戰力卡與對決',
      href: '/player-cards',
      icon: Users,
      exact: false,
    },
    {
      label: '球隊對決模擬',
      href: '/matchup',
      icon: Swords,
      exact: false,
    },
    {
      label: '本週有趣預測',
      href: '/weekly-preview',
      icon: Sparkles,
      exact: false,
    },
    {
      label: '進階數據辭典',
      href: '/glossary',
      icon: BookOpen,
      exact: false,
    },
  ];

  const isLinkActive = (item: (typeof navItems)[0]) => {
    if (item.exact) {
      return pathname === '/';
    }
    return pathname.startsWith(item.href);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#21262D] bg-[#0E1117] shadow-2xl">
      
      {/* ============================================================== */}
      {/* 1. 上層 Banner 專屬區塊 (專門容納吉祥物背景圖，不被任何按鈕遮擋) */}
      {/* ============================================================== */}
      <div className="relative w-full h-16 sm:h-20 overflow-hidden border-b border-white/10 bg-black">
        
        {/* 吉祥物滿版背景 */}
        <div className="absolute inset-0 pointer-events-none select-none z-0">
          <img
            src="/logos/mascots.jpg"
            alt="TPBL Mascots Banner"
            className="w-full h-full object-cover object-center opacity-85"
          />
          {/* 兩側微弱淡入，保護左側 TPBL Logo 與右側選單 */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-black/80" />
        </div>

        {/* 上層內容 (Logo 與 賽季選單) */}
        <div className="relative z-10 max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          {/* TPBL 官方 Logo */}
          <Link href="/" className="flex items-center space-x-3 group flex-shrink-0">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-white p-1 flex items-center justify-center shadow-lg shadow-[#FF9100]/20 group-hover:scale-105 transition-transform duration-200 border border-[#30363D]">
              <img
                src="/logos/tpbl.jpg"
                alt="TPBL Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-black text-xl tracking-tight text-white drop-shadow-md">TPBL</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#00E676]/20 text-[#00E676] border border-[#00E676]/40 backdrop-blur-sm">
                  AdvStats Pro
                </span>
              </div>
              <p className="text-[11px] text-gray-300 font-medium hidden sm:block drop-shadow">
                臺灣職業籃球大聯盟・進階攻防數據平台
              </p>
            </div>
          </Link>

          {/* 右側：賽季階段下拉切換器 */}
          <div className="flex items-center space-x-3 flex-shrink-0">
            <div className="relative">
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className="appearance-none bg-[#161B22]/90 backdrop-blur-md border border-[#30363D] hover:border-[#FF9100] text-gray-100 text-xs sm:text-sm font-bold py-2 pl-3.5 pr-8 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FF9100]/50 transition-all cursor-pointer shadow-xl"
              >
                {stagesList.map((s) => (
                  <option key={s.id} value={s.id} className="bg-[#161B22] text-white">
                    {s.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. 下層 導航按鈕專屬區塊 (獨立深底，按鈕排在吉祥物下方) */}
      {/* ============================================================== */}
      <div className="w-full bg-[#0E1117]/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto py-2.5 scrollbar-none">
            {navItems.map((item) => {
              const active = isLinkActive(item);
              const IconComponent = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-200 ${
                    active
                      ? 'bg-[#161B22] text-[#FF9100] border border-[#FF9100]/60 shadow-md shadow-[#FF9100]/10'
                      : 'text-gray-400 hover:text-white hover:bg-[#161B22]/60'
                  }`}
                >
                  <IconComponent
                    className={`w-4 h-4 transition-colors ${
                      active ? 'text-[#FF9100]' : 'text-gray-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

    </header>
  );
}
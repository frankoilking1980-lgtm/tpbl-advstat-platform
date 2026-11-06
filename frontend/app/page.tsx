'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import Image from 'next/image';
import { useStage } from '@/context/StageContext';
import { fetcher } from '@/lib/api';
import { getTeamLogo } from '@/lib/teamLogos';
import {
  Trophy,
  ShieldAlert,
  Flame,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Info,
  Layers,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';

interface TeamSummary {
  team_name: string;
  games_played: number;
  record: string;
  total_time: number;
  pts: number;
  fga: number;
  fg_pct: number;
  three_par: number;
  efg_pct: number;
  possessions: number;
  pace: number;
  ortg: number;
  drtg: number;
  net_rtg: number;
  tov_pct: number;
  orb_pct: number;
  ftr: number;
  high_usg_core: string;
  high_eff_finisher: string;
  system_notes: string;
  rank: number;
}

export default function TeamRatingsPage() {
  const { stage } = useStage();
  const { data: teams, error, isLoading } = useSWR<TeamSummary[]>(
    `/api/teams/summary?stage=${encodeURIComponent(stage)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  const [sortField, setSortField] = useState<keyof TeamSummary | 'record'>('net_rtg');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // 點擊後高亮發光的球隊狀態
  const [highlightedTeam, setHighlightedTeam] = useState<string | null>(null);

  const handleSort = (field: keyof TeamSummary | 'record') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // 點擊球隊平滑滾動並觸發邊框發光
  const scrollToTeamCard = (teamName: string) => {
    setHighlightedTeam(teamName);
    const cardEl = document.getElementById(`team-card-${encodeURIComponent(teamName.trim())}`);
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // 2.5 秒後自動解除高亮狀態
    setTimeout(() => {
      setHighlightedTeam((curr) => (curr === teamName ? null : curr));
    }, 2500);
  };

  // 解析戰績字串 (如 "2勝-2敗") 計算勝率數值以供排序
  const getWinPct = (recordStr: string): number => {
    if (!recordStr) return 0;
    const wMatch = recordStr.match(/(\d+)勝/);
    const lMatch = recordStr.match(/(\d+)敗/);
    const w = wMatch ? parseInt(wMatch[1], 10) : 0;
    const l = lMatch ? parseInt(lMatch[1], 10) : 0;
    const total = w + l;
    return total > 0 ? (w / total) + (w * 0.001) : 0;
  };

  const sortedTeams = teams
    ? [...teams].sort((a, b) => {
        if (sortField === 'record') {
          const pctA = getWinPct(a.record);
          const pctB = getWinPct(b.record);
          return sortAsc ? pctA - pctB : pctB - pctA;
        }

        const valA = a[sortField];
        const valB = b[sortField];
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortAsc ? valA - valB : valB - valA;
        }
        return sortAsc
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      })
    : [];

  const renderSortableTh = (
    field: keyof TeamSummary | 'record',
    label: string,
    alignClass: string = 'text-right',
    extraClass: string = ''
  ) => {
    const isCurrent = sortField === field;
    return (
      <th
        onClick={() => handleSort(field)}
        className={`py-3.5 px-3 font-semibold select-none cursor-pointer transition-colors hover:text-white ${alignClass} ${extraClass} ${
          isCurrent ? 'text-[#FF9100]' : 'text-gray-400'
        }`}
      >
        <div className={`inline-flex items-center space-x-1 ${alignClass.includes('right') ? 'justify-end' : alignClass.includes('center') ? 'justify-center' : 'justify-start'}`}>
          <span>{label}</span>
          {isCurrent ? (
            sortAsc ? (
              <ArrowUp className="w-3.5 h-3.5 text-[#FF9100]" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-[#FF9100]" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 opacity-30 hover:opacity-100" />
          )}
        </div>
      </th>
    );
  };

  return (
    <div className="space-y-10">
      {/* 頂部賽季宣告橫幅 */}
      <div className="relative overflow-hidden rounded-3xl border border-[#30363D] bg-[#0E1117] p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#FF9100]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-[#00E676]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="absolute right-0 top-0 bottom-0 w-full sm:w-4/5 lg:w-3/4 pointer-events-none select-none overflow-hidden z-0 flex justify-end">
          <img
            src="/logos/logo_all.jpg"
            alt="TPBL Teams"
            className="h-full w-full object-cover object-right opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0E1117] via-[#0E1117]/65 to-transparent" />
        </div>

        <div className="relative z-10 max-w-2xl space-y-2.5">
          <div className="flex items-center space-x-2">
            <span className="px-3 py-1 rounded-full bg-[#FF9100]/20 text-[#FF9100] text-xs font-black uppercase tracking-wider border border-[#FF9100]/40 backdrop-blur-sm">
              {stage}
            </span>
            <span className="text-xs text-gray-300/80 font-medium drop-shadow">
              TPBL 全聯盟 7 隊進階攻防評級
            </span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-black text-white/75 tracking-tight drop-shadow-md leading-tight">
            🏆 團隊四大要素與教練體系戰力評級
          </h1>

          <p className="text-gray-200/65 text-sm sm:text-base leading-relaxed drop-shadow-sm font-medium">
            整合 Dean Oliver 四大要素、百回合進攻效率 (ORtg)、防守效率 (DRtg) 與攻防淨評分 (Net Rating)，直觀透視球隊體系優劣勢。
          </p>
        </div>
      </div>

      {/* 1. 7 隊進階四大要素數據指標表格 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-[#00E676]" />
            <h2 className="text-xl font-black text-white tracking-tight">
              團隊四大要素與進階數據總表
            </h2>
          </div>
          <span className="text-xs text-gray-400">點擊表頭排序 • 點擊球隊查看短評</span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[#30363D] bg-[#161B22] shadow-xl">
          <table className="w-full text-left text-xs sm:text-sm whitespace-nowrap">
            <thead className="bg-[#0E1117] text-gray-400 uppercase font-mono tracking-wider border-b border-[#30363D]">
              <tr>
                <th className="py-3.5 px-3 font-bold text-gray-300">#</th>
                {renderSortableTh('team_name', '球隊名稱', 'text-left')}
                {renderSortableTh('record', '戰績', 'text-center')}
                {renderSortableTh('pace', 'Pace')}
                {renderSortableTh('ortg', 'ORtg', 'text-right font-bold text-[#FF9100]')}
                {renderSortableTh('drtg', 'DRtg', 'text-right font-bold text-sky-400')}
                {renderSortableTh('net_rtg', 'NetRtg', 'text-right font-black text-[#00E676] bg-[#0E1117]')}
                {renderSortableTh('efg_pct', 'eFG%', 'text-right text-amber-300 font-bold')}
                {renderSortableTh('three_par', '3PAr')}
                {renderSortableTh('tov_pct', 'TOV%')}
                {renderSortableTh('orb_pct', 'ORB%')}
                {renderSortableTh('ftr', 'FTr')}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#21262D] font-mono">
              {isLoading ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-gray-500 font-sans">
                    正在載入 7 隊進階四大要素評級...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-red-400 font-sans">
                    載入失敗，請確認後端已在 localhost:8000 運行。
                  </td>
                </tr>
              ) : (
                sortedTeams.map((t, idx) => (
                  <tr
                    key={t.team_name}
                    onClick={() => scrollToTeamCard(t.team_name)}
                    className="hover:bg-[#21262D]/60 transition-colors group cursor-pointer"
                    title="點擊可直接滾動至下方查看該隊戰力短評"
                  >
                    <td className="py-3.5 px-3 text-gray-500 font-bold">{idx + 1}</td>
                    <td className="py-3.5 px-3 font-sans font-bold text-white group-hover:text-[#00E676] transition-colors">
                      <div className="flex items-center space-x-2.5">
                        <div className="relative w-6 h-6 rounded-full overflow-hidden bg-[#0E1117] border border-[#30363D] flex-shrink-0">
                          <Image
                            src={getTeamLogo(t.team_name)}
                            alt={t.team_name}
                            fill
                            className="object-contain p-0.5"
                          />
                        </div>
                        <span>{t.team_name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-center text-gray-300 font-medium">
                      {t.record}
                    </td>
                    <td className="py-3.5 px-3 text-right text-gray-400">{t.pace.toFixed(1)}</td>
                    <td className="py-3.5 px-3 text-right font-bold text-[#FF9100]">
                      {t.ortg.toFixed(1)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-bold text-sky-400">
                      {t.drtg.toFixed(1)}
                    </td>
                    <td
                      className={`py-3.5 px-3 text-right font-black ${
                        t.net_rtg > 0
                          ? 'text-[#00E676]'
                          : t.net_rtg < 0
                          ? 'text-red-400'
                          : 'text-gray-400'
                      }`}
                    >
                      {t.net_rtg > 0 ? `+${t.net_rtg.toFixed(1)}` : t.net_rtg.toFixed(1)}
                    </td>
                    <td className="py-3.5 px-3 text-right text-amber-300 font-bold">
                      {t.efg_pct.toFixed(1)}%
                    </td>
                    <td className="py-3.5 px-3 text-right text-gray-400">{t.three_par.toFixed(1)}%</td>
                    <td className="py-3.5 px-3 text-right text-gray-400">{t.tov_pct.toFixed(1)}%</td>
                    <td className="py-3.5 px-3 text-right text-gray-300">{t.orb_pct.toFixed(1)}%</td>
                    <td className="py-3.5 px-3 text-right text-gray-300">{t.ftr.toFixed(1)}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. 重點球員洞察與戰力短評卡片 */}
      <section className="space-y-6 pt-4">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-5 h-5 text-[#FF9100]" />
          <h2 className="text-xl font-black text-white tracking-tight">
            重點球員洞察與教練體系戰力短評
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {sortedTeams.map((t) => {
            const isHighlighted = highlightedTeam === t.team_name;
            const cardId = `team-card-${encodeURIComponent(t.team_name.trim())}`;

            return (
              <div
                key={t.team_name}
                id={cardId}
                className={`p-6 rounded-3xl border bg-[#161B22] shadow-xl transition-all duration-500 flex flex-col justify-between space-y-4 ${
                  isHighlighted
                    ? 'border-[#FF9100] ring-2 ring-[#FF9100] shadow-[0_0_25px_rgba(255,145,0,0.35)] scale-[1.01]'
                    : 'border-[#30363D] hover:border-[#FF9100]/40'
                }`}
              >
                <div>
                  {/* 球隊抬頭與戰績 */}
                  <div className="flex items-center justify-between pb-3 border-b border-[#21262D]">
                    <div className="flex items-center space-x-3">
                      <div className="relative w-8 h-8 rounded-full overflow-hidden bg-[#0E1117] border border-[#30363D] flex-shrink-0">
                        <Image
                          src={getTeamLogo(t.team_name)}
                          alt={t.team_name}
                          fill
                          className="object-contain p-0.5"
                        />
                      </div>
                      <h3 className="text-lg font-black text-white tracking-tight">
                        {t.team_name}
                      </h3>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-[#0E1117] text-gray-300 font-mono text-xs font-bold border border-[#30363D]">
                      {t.record}
                    </span>
                  </div>

                  {/* 高球權核心 & 高效終結者標籤 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-3">
                    <div className="p-3 rounded-xl bg-[#0E1117] border border-[#21262D]">
                      <span className="text-[11px] font-bold text-[#FF9100] uppercase block mb-1">
                        🔥 高球權核心 (USG &gt; 25% 且 TS &gt; 55%)
                      </span>
                      <p className="text-xs text-gray-200 font-medium">{t.high_usg_core || '無'}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-[#0E1117] border border-[#21262D]">
                      <span className="text-[11px] font-bold text-[#00E676] uppercase block mb-1">
                        ⚡ 高效終結者 (GmSc 前二且 eFG &gt; 60%)
                      </span>
                      <p className="text-xs text-gray-200 font-medium">{t.high_eff_finisher || '無'}</p>
                    </div>
                  </div>

                  {/* 戰力短評長文本 */}
                  <div className="mt-3">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                      戰力短評與攻防體系洞察
                    </h4>
                    <p className="text-xs sm:text-sm text-gray-300 whitespace-normal break-words leading-relaxed select-text">
                      {t.system_notes}
                    </p>
                  </div>
                </div>

                {/* 底部功能跳轉 (修正為 /pbp 並帶入 team 參數) */}
                <div className="pt-3 border-t border-[#21262D] flex items-center justify-between text-xs">
                  <span className="text-gray-500 font-mono">NetRtg: {t.net_rtg > 0 ? `+${t.net_rtg}` : t.net_rtg}</span>
                  <Link
                    href={`/pbp?team=${encodeURIComponent(t.team_name)}`}
                    className="inline-flex items-center space-x-1 text-[#00E676] hover:text-white font-bold transition-colors"
                  >
                    <span>查看 PBP On/Off 陣容</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
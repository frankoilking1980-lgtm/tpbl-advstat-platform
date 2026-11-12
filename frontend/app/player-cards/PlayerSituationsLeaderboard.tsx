'use client';

import React, { useMemo, useState } from 'react';
import { PlayerSituationsData } from './PlayerSituationsTab';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import { ChevronDown, ChevronUp, Zap, Clock, Target, Shield, Flame } from 'lucide-react';

export type LeaderboardMetric = 'q4' | 'fast_break' | 'self_created' | 'paint' | 'clutch';

interface ClutchRow {
  rank: number;
  player_name: string;
  team_name: string;
  identity?: string;
  identity_group?: string;
  games_played: number;
  mpg: number;
  ppg_5min: number;
  usg_pct: number;
  ts_pct: number;
  ft_pct: number;
  clutch_score: number;
  tag: string;
}

interface ClutchResponse {
  total: number;
  min_games: number;
  min_mpg: number;
  players: ClutchRow[];
}

type ClutchSort = 'score' | 'ts';

const toFiniteNum = (val: unknown, fallback = 0): number => {
  const n = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(n) ? n : fallback;
};

const getPrimarySortValue = (p: PlayerSituationsData, m: LeaderboardMetric): number => {
  switch (m) {
    case 'q4':
      return toFiniteNum(p.q4_crunch_time?.q4_ppg, 0);
    case 'fast_break':
      return toFiniteNum(p.tactical_situations?.fast_break?.ppg, 0);
    case 'self_created':
      return toFiniteNum(p.finishing_breakdown?.self_created?.fga, 0);
    case 'paint':
      return toFiniteNum(p.point_composition?.paint_ppg, 0);
    default:
      return 0;
  }
};

interface Props {
  situationsData: Record<string, PlayerSituationsData>;
  selectedPlayerName: string;
  onSelectPlayer: (name: string, team: string) => void;
  isOpen?: boolean;
  setIsOpen?: (open: boolean) => void;
  metric?: LeaderboardMetric;
  setMetric?: (metric: LeaderboardMetric) => void;
  focusedPlayer?: string | null;
  poolMode?: 'all' | 'local' | 'import';
  identityMap?: Record<string, { identity?: string; identity_group?: string }>;
  stage?: string;
}

const isImportByIdentity = (identity?: string, identityGroup?: string): boolean => {
  if (identityGroup === 'import') return true;
  if (identityGroup === 'local') return false;
  const ident = (identity || '').trim();
  return ident.includes('洋將') || ident.includes('外籍生') || ident.includes('歸化');
};

export default function PlayerSituationsLeaderboard({
  situationsData,
  selectedPlayerName,
  onSelectPlayer,
  isOpen: controlledIsOpen,
  setIsOpen: controlledSetIsOpen,
  metric: controlledMetric,
  setMetric: controlledSetMetric,
  focusedPlayer,
  poolMode = 'all',
  identityMap,
  stage = '2026-2027 例行賽',
}: Props) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [internalMetric, setInternalMetric] = useState<LeaderboardMetric>('q4');
  const [minGames, setMinGames] = useState(2);
  const [clutchSort, setClutchSort] = useState<ClutchSort>('score');

  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = controlledSetIsOpen || setInternalIsOpen;

  const metric = controlledMetric !== undefined ? controlledMetric : internalMetric;
  const setMetric = controlledSetMetric || setInternalMetric;

  const clutchIdentity = poolMode === 'local' ? '本土' : poolMode === 'import' ? '洋將' : '全部';
  const { data: clutchData, isLoading: clutchLoading } = useSWR<ClutchResponse>(
    isOpen && metric === 'clutch'
      ? `/api/players/clutch-leaderboard?stage=${encodeURIComponent(stage)}&identity=${encodeURIComponent(clutchIdentity)}&sort=${clutchSort}&min_gp=${minGames}&limit=50`
      : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000, keepPreviousData: true }
  );
  const clutchRows = useMemo(
    () => (Array.isArray(clutchData?.players) ? clutchData!.players : []),
    [clutchData]
  );

  const rankedList = useMemo(() => {
    if (!situationsData || typeof situationsData !== 'object') return [];

    const list = Object.entries(situationsData)
      .filter(([, stat]) => Boolean(stat && typeof stat === 'object'))
      .map(([name, stat]) => ({
        name,
        ...stat,
      }));

    const filtered = list.filter((p) => {
      if (toFiniteNum(p.games_played, 0) < minGames) return false;
      if (poolMode === 'all' || !identityMap) return true;
      const meta = identityMap[p.name.trim()];
      if (!meta) return true;
      const isImp = isImportByIdentity(meta.identity, meta.identity_group);
      return poolMode === 'import' ? isImp : !isImp;
    });

    return filtered.sort((a, b) => {
      const diffPrimary = getPrimarySortValue(b, metric) - getPrimarySortValue(a, metric);
      if (diffPrimary !== 0) return diffPrimary;

      const diffPpg = toFiniteNum(b.ppg, 0) - toFiniteNum(a.ppg, 0);
      if (diffPpg !== 0) return diffPpg;

      const diffMpg = toFiniteNum(b.mpg, 0) - toFiniteNum(a.mpg, 0);
      if (diffMpg !== 0) return diffMpg;

      return a.name.localeCompare(b.name, 'zh-Hant');
    });
  }, [situationsData, metric, minGames, poolMode, identityMap]);

  const handleRowClick = (name: string, team: string) => {
    onSelectPlayer(name, team);
    window.scrollTo({ top: 120, behavior: 'smooth' });
  };

  return (
    <div className="rounded-3xl border border-[#30363D] bg-[#161B22] shadow-2xl overflow-hidden transition-all">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-5 flex items-center justify-between bg-[#0E1117] hover:bg-[#12161F] transition-colors border-b border-[#30363D]"
      >
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
          <div className="flex items-center flex-wrap gap-2">
            <h3 className="text-lg font-black text-white tracking-wide">
              🔥 進階專題排行榜 (Situations & Clutch Extremes)
            </h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 font-mono font-normal border border-cyan-500/20">
              {rankedList.length} 位達標球員
            </span>
            {poolMode !== 'all' && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#00E676]/15 text-[#00E676] font-mono border border-[#00E676]/30">
                {poolMode === 'local' ? '僅本土池' : '僅洋將池'}
              </span>
            )}
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-800/80 text-gray-400 font-mono border border-gray-700/60">
              達標標準：出賽 ≥ {minGames} 場
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white transition-colors">
          <span>{isOpen ? '收合榜單' : '展開專題榜單 (點選球員可即時切換分析)'}</span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {isOpen && (
        <div className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#21262D] pb-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setMetric('clutch')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                  metric === 'clutch'
                    ? 'bg-orange-500/25 text-orange-200 border border-orange-400 shadow-[0_0_14px_rgba(251,146,60,0.45)]'
                    : 'text-orange-300 bg-orange-500/10 border border-orange-500/40 hover:bg-orange-500/20'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>🔥 關鍵時刻抗壓榜 (Clutch Time 最後 5 分鐘)</span>
              </button>

              <button
                onClick={() => setMetric('q4')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  metric === 'q4'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>⏱️ 末節決勝榜 (Q4 / Clutch)</span>
              </button>

              <button
                onClick={() => setMetric('fast_break')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  metric === 'fast_break'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>⚡ 快攻轉換之王</span>
              </button>

              <button
                onClick={() => setMetric('self_created')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  metric === 'self_created'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <Target className="w-3.5 h-3.5" />
                <span>🗡️ 單打硬解大師</span>
              </button>

              <button
                onClick={() => setMetric('paint')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  metric === 'paint'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>🛡️ 禁區肉搏霸主</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
              <span>調整門檻：出賽 ≥</span>
              <select
                value={minGames}
                onChange={(e) => setMinGames(Number(e.target.value))}
                className="bg-[#0E1117] border border-[#30363D] text-white text-xs font-bold py-1 px-2 rounded-lg"
              >
                <option value={1}>1 場</option>
                <option value={2}>2 場</option>
                <option value={3}>3 場</option>
                <option value={4}>4 場</option>
              </select>
            </div>
          </div>

          {metric === 'clutch' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] text-orange-300/90 font-mono">
                  篩選門檻：出賽 ≥ {minGames} 場 且 場均時間 ≥ {toFiniteNum(clutchData?.min_mpg, 10)} 分（避免極端值洗榜）
                  ・共 {toFiniteNum(clutchData?.total, 0)} 位達標
                  {poolMode !== 'all' && `・${poolMode === 'local' ? '僅本土' : '僅洋將'}`}
                </div>
                <div className="flex gap-1.5">
                  {([
                    ['score', '關鍵效率 / 得分'],
                    ['ts', 'Clutch TS%'],
                  ] as [ClutchSort, string][]).map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => setClutchSort(k)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                        clutchSort === k
                          ? 'bg-orange-500/20 text-orange-200 border-orange-400/60'
                          : 'text-gray-400 border-transparent hover:text-white hover:bg-white/5'
                      }`}
                    >
                      依 {label} 排序
                    </button>
                  ))}
                </div>
              </div>

              {clutchLoading && clutchRows.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">載入關鍵時刻榜單中...</div>
              ) : clutchRows.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">目前無符合門檻的球員</div>
              ) : (
                <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
                  <table className="w-full text-left text-xs font-mono border-collapse whitespace-nowrap">
                    <thead className="sticky top-0 z-20 bg-[#0E1117] border-b-2 border-[#30363D] shadow-md">
                      <tr className="text-xs font-black tracking-wider uppercase text-slate-400">
                        <th className="py-3 px-3">#</th>
                        <th className="py-3 px-3 font-sans text-white">球員</th>
                        <th className="py-3 px-3 text-right text-orange-300 font-black">Clutch PPG / 5min</th>
                        <th className="py-3 px-3 text-right text-amber-300">Clutch USG%</th>
                        <th className="py-3 px-3 text-right text-cyan-300">Clutch TS%</th>
                        <th className="py-3 px-3 text-right text-emerald-300">Clutch FT%</th>
                        <th className="py-3 px-3 font-sans text-slate-300">戰術定位</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#21262D]">
                      {clutchRows.map((p, idx) => {
                        const isImp = isImportByIdentity(p.identity, p.identity_group);
                        const isTarget = selectedPlayerName === p.player_name;
                        return (
                          <tr
                            key={`clutch-rank-${p.player_name}`}
                            onClick={() => handleRowClick(p.player_name, p.team_name)}
                            className={`transition-colors cursor-pointer group ${
                              isTarget
                                ? 'bg-orange-500/20 hover:bg-orange-500/25 ring-1 ring-orange-500/50'
                                : 'hover:bg-white/[0.04]'
                            }`}
                          >
                            <td className="py-3 px-3 font-bold text-gray-500 group-hover:text-orange-400">
                              {toFiniteNum(p.rank, idx + 1)}
                            </td>
                            <td className="py-3 px-3 font-sans">
                              <span className="font-bold text-white text-sm group-hover:text-orange-300 transition-colors">
                                {p.player_name}
                              </span>
                              <span className="ml-2 text-xs text-gray-400">{p.team_name || '-'}</span>
                              <span
                                className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full border ${
                                  isImp
                                    ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                }`}
                              >
                                {isImp ? '洋將' : '本土'}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right text-orange-300 font-bold text-sm">
                              {toFiniteNum(p.ppg_5min, 0).toFixed(1)}
                            </td>
                            <td className="py-3 px-3 text-right text-amber-300">
                              {toFiniteNum(p.usg_pct, 0).toFixed(1)}%
                            </td>
                            <td className="py-3 px-3 text-right text-cyan-300 font-bold">
                              {toFiniteNum(p.ts_pct, 0).toFixed(1)}%
                            </td>
                            <td className="py-3 px-3 text-right text-emerald-300">
                              {toFiniteNum(p.ft_pct, 0).toFixed(1)}%
                            </td>
                            <td className="py-3 px-3 font-sans text-gray-200">{p.tag}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {metric !== 'clutch' && (
          <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
            <table className="w-full text-left text-xs font-mono border-collapse whitespace-nowrap">
              <thead className="sticky top-0 z-20 bg-[#0E1117] border-b-2 border-[#30363D] shadow-md">
                <tr className="text-xs font-black tracking-wider uppercase text-slate-400">
                  <th className="py-3 px-3">#</th>
                  <th className="py-3 px-3 font-sans text-white">球員</th>
                  <th className="py-3 px-3 font-sans text-slate-300">球隊</th>
                  <th className="py-3 px-3 text-center">出賽</th>
                  <th className="py-3 px-3 text-center">場均時間</th>

                  {metric === 'q4' && (
                    <>
                      <th className="py-3 px-3 text-right text-amber-400 font-black">Q4 PPG</th>
                      <th className="py-3 px-3 text-right text-amber-300">Q4 TS%</th>
                      <th className="py-3 px-3 text-right text-cyan-300">Q4 FG%</th>
                      <th className="py-3 px-3 text-right text-emerald-300">Q4 +/-</th>
                      <th className="py-3 px-3 text-right text-rose-300">Q4 TOV</th>
                    </>
                  )}

                  {metric === 'fast_break' && (
                    <>
                      <th className="py-3 px-3 text-right text-cyan-400 font-black">快攻 PPG</th>
                      <th className="py-3 px-3 text-right text-cyan-300">快攻 FG%</th>
                      <th className="py-3 px-3 text-right text-amber-300">佔得分比</th>
                      <th className="py-3 px-3 text-right text-purple-300">抓失誤反擊 PPG</th>
                    </>
                  )}

                  {metric === 'self_created' && (
                    <>
                      <th className="py-3 px-3 text-right text-rose-400 font-black">單打出手 (FGA)</th>
                      <th className="py-3 px-3 text-right text-rose-300">單打進球 (FGM)</th>
                      <th className="py-3 px-3 text-right text-amber-300">單打 FG%</th>
                      <th className="py-3 px-3 text-right text-slate-300">場均總得分</th>
                    </>
                  )}

                  {metric === 'paint' && (
                    <>
                      <th className="py-3 px-3 text-right text-emerald-400 font-black">禁區 PPG</th>
                      <th className="py-3 px-3 text-right text-emerald-300">禁區得分佔比</th>
                      <th className="py-3 px-3 text-right text-amber-300">上籃 FG%</th>
                      <th className="py-3 px-3 text-right text-cyan-300">灌籃次數</th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-[#21262D]">
                {rankedList.map((p, idx) => {
                  const isTarget =
                    (focusedPlayer && focusedPlayer === p.name) ||
                    (!focusedPlayer && selectedPlayerName === p.name);

                  return (
                    <tr
                      key={`sit-rank-${p.name}`}
                      id={`sit-row-${p.name}`}
                      onClick={() => handleRowClick(p.name, p.team)}
                      className={`transition-colors cursor-pointer group ${
                        isTarget
                          ? 'bg-cyan-500/25 hover:bg-cyan-500/30 ring-1 ring-cyan-500/50'
                          : 'hover:bg-white/[0.04]'
                      }`}
                    >
                      <td className="py-3 px-3 font-bold text-gray-500 group-hover:text-cyan-400">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-3 font-sans">
                        <span className="font-bold text-white text-sm group-hover:text-cyan-400 transition-colors">
                          {p.name}
                        </span>
                        {p.number && (
                          <span className="ml-1.5 text-xs text-gray-500 font-mono">
                            #{p.number}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-sans text-gray-400">{p.team || '-'}</td>
                      <td className="py-3 px-3 text-center text-gray-300">{toFiniteNum(p.games_played, 0)}</td>
                      <td className="py-3 px-3 text-center text-gray-300">{toFiniteNum(p.mpg, 0)} 分</td>

                      {metric === 'q4' && (
                        <>
                          <td className="py-3 px-3 text-right text-amber-400 font-bold text-sm">
                            {toFiniteNum(p.q4_crunch_time?.q4_ppg, 0)}
                          </td>
                          <td className="py-3 px-3 text-right text-amber-300">
                            {toFiniteNum(p.q4_crunch_time?.q4_ts_pct, 0)}%
                          </td>
                          <td className="py-3 px-3 text-right text-cyan-300">
                            {toFiniteNum(p.q4_crunch_time?.q4_fg_pct, 0)}%
                          </td>
                          {(() => {
                            const pm = toFiniteNum(p.q4_crunch_time?.q4_plus_minus_pg, 0);
                            return (
                              <td
                                className={`py-3 px-3 text-right font-bold ${
                                  pm >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {pm > 0 ? `+${pm}` : pm}
                              </td>
                            );
                          })()}
                          <td className="py-3 px-3 text-right text-rose-300">
                            {toFiniteNum(p.q4_crunch_time?.q4_tov_pg, 0)}
                          </td>
                        </>
                      )}

                      {metric === 'fast_break' && (
                        <>
                          <td className="py-3 px-3 text-right text-cyan-400 font-bold text-sm">
                            {toFiniteNum(p.tactical_situations?.fast_break?.ppg, 0)}
                          </td>
                          <td className="py-3 px-3 text-right text-cyan-300">
                            {toFiniteNum(p.tactical_situations?.fast_break?.fg_pct, 0)}%
                          </td>
                          <td className="py-3 px-3 text-right text-amber-300">
                            {toFiniteNum(p.tactical_situations?.fast_break?.share_pct, 0)}%
                          </td>
                          <td className="py-3 px-3 text-right text-purple-300">
                            {toFiniteNum(p.tactical_situations?.points_off_tov?.ppg, 0)}
                          </td>
                        </>
                      )}

                      {metric === 'self_created' && (
                        <>
                          <td className="py-3 px-3 text-right text-rose-400 font-bold text-sm">
                            {toFiniteNum(p.finishing_breakdown?.self_created?.fga, 0)} 次
                          </td>
                          <td className="py-3 px-3 text-right text-rose-300">
                            {toFiniteNum(p.finishing_breakdown?.self_created?.fgm, 0)}
                          </td>
                          <td className="py-3 px-3 text-right text-amber-300 font-bold">
                            {toFiniteNum(p.finishing_breakdown?.self_created?.fg_pct, 0)}%
                          </td>
                          <td className="py-3 px-3 text-right text-gray-300">{toFiniteNum(p.ppg, 0)}</td>
                        </>
                      )}

                      {metric === 'paint' && (
                        <>
                          <td className="py-3 px-3 text-right text-emerald-400 font-bold text-sm">
                            {toFiniteNum(p.point_composition?.paint_ppg, 0)}
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-300">
                            {toFiniteNum(p.point_composition?.paint_pct, 0)}%
                          </td>
                          <td className="py-3 px-3 text-right text-amber-300">
                            {toFiniteNum(p.finishing_breakdown?.layup?.fg_pct, 0)}%
                          </td>
                          <td className="py-3 px-3 text-right text-cyan-300">
                            {toFiniteNum(p.finishing_breakdown?.dunk?.fgm, 0)}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
'use client';

import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import { useStage } from '@/context/StageContext';
import { fetcher } from '@/lib/api';
import {
  ScatterChart as ScatterIcon,
  Filter,
  Sparkles,
  Info,
  ChevronRight,
  User,
  Activity,
  Table as TableIcon,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
} from 'lucide-react';
import Link from 'next/link';

interface AdvancedPlayer {
  player_name: string;
  team_name: string;
  jersey_number?: string;
  identity: string;
  position: string;
  games_played: number;
  minutes_str?: string;
  mpg: number;
  ppg: number;
  fgm?: number;
  fga?: number;
  fg_pct?: number;
  p3m?: number;
  p3a?: number;
  p3_pct?: number;
  ftm?: number;
  fta?: number;
  ft_pct?: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  tpg: number;
  plus_minus: number;
  three_par?: number;
  ftr?: number;
  usg_pct: number;
  ast_pct?: number;
  tov_pct?: number;
  ts_pct: number;
  efg_pct: number;
  gmsc: number;
  quadrant: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  quadrant_label: string;
  shot_chart_desc?: string;
  season_notes?: string;
}

export default function ScatterPage() {
  const { stage } = useStage();
  const [minPpg, setMinPpg] = useState<number>(8);
  const [identityFilter, setIdentityFilter] = useState<string>('全部');
  const [selectedPlayer, setSelectedPlayer] = useState<AdvancedPlayer | null>(null);
  const [isTableExpanded, setIsTableExpanded] = useState<boolean>(true);
  const [sortField, setSortField] = useState<keyof AdvancedPlayer>('gmsc');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const { data: rawPlayers, isLoading } = useSWR<AdvancedPlayer[]>(
    `/api/players/advanced?stage=${encodeURIComponent(stage)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  // 1. 座標百分比歸一化（防止熱身賽或小數格式擠在左下角）
  const normalizedPlayers = useMemo(() => {
    if (!rawPlayers) return [];

    const fixPct = (val: number | undefined | null): number => {
      if (val === undefined || val === null) return 0;
      // 若數值介於 0 與 1.0 之間（如 0.235, 0.582, 1.0），統一乘以 100 轉為百分比
      if (val > 0 && val <= 1.0) {
        return Number((val * 100).toFixed(1));
      }
      return Number(val.toFixed(1));
    };

    return rawPlayers.map((p) => ({
      ...p,
      usg_pct: fixPct(p.usg_pct),
      ts_pct: fixPct(p.ts_pct),
      efg_pct: fixPct(p.efg_pct),
      fg_pct: fixPct(p.fg_pct),
      p3_pct: fixPct(p.p3_pct),
      ft_pct: fixPct(p.ft_pct),
      three_par: fixPct(p.three_par),
      ftr: fixPct(p.ftr),
      ast_pct: fixPct(p.ast_pct),
      tov_pct: fixPct(p.tov_pct),
      fgm: Number((p.fgm ?? 0).toFixed(1)),
      fga: Number((p.fga ?? 0).toFixed(1)),
      p3m: Number((p.p3m ?? 0).toFixed(1)),
      p3a: Number((p.p3a ?? 0).toFixed(1)),
      ftm: Number((p.ftm ?? 0).toFixed(1)),
      fta: Number((p.fta ?? 0).toFixed(1)),
    }));
  }, [rawPlayers]);

  // 2. 身分篩選器邏輯校正與過濾得分為 0 的未出賽球員：
  // 「本土」：僅 identity 包含 "本土" 且不含 "洋將"、"外籍生"、"歸化"
  // 「洋將」：包含 "洋將"、"外籍生"、"外籍生/華裔"、"洋將/歸化"
  const filteredPlayers = useMemo(() => {
    if (!normalizedPlayers) return [];
    return normalizedPlayers.filter((p) => {
      // 過濾掉得分為 0 的未出賽球員 (出賽場次為 0 或出賽為 0 且得分為 0)
      if ((p.games_played ?? 0) <= 0 && (p.ppg ?? 0) <= 0) {
        return false;
      }

      const matchPpg = p.ppg >= minPpg;
      const isForeign =
        p.identity.includes('洋將') ||
        p.identity.includes('外籍生') ||
        p.identity.includes('歸化');

      let matchIdentity = true;
      if (identityFilter === '本土') {
        matchIdentity = !isForeign && (p.identity === '本土' || p.identity.includes('本土'));
      } else if (identityFilter === '洋將') {
        matchIdentity = isForeign;
      }

      return matchPpg && matchIdentity;
    });
  }, [normalizedPlayers, minPpg, identityFilter]);

  // 3. 象限動態十字基準線：計算當前篩選球員的 USG% 與 TS% 動態平均值
  const { avgUsg, avgTs } = useMemo(() => {
    if (filteredPlayers.length === 0) {
      return { avgUsg: 20.0, avgTs: 52.0 };
    }
    const sumUsg = filteredPlayers.reduce((acc, p) => acc + (p.usg_pct || 0), 0);
    const sumTs = filteredPlayers.reduce((acc, p) => acc + (p.ts_pct || 0), 0);
    return {
      avgUsg: sumUsg / filteredPlayers.length,
      avgTs: sumTs / filteredPlayers.length,
    };
  }, [filteredPlayers]);

  const baselineUsg = avgUsg;
  const baselineTs = avgTs;

  // 根據動態基準線指派象限
  const getPlayerQuadrant = (p: AdvancedPlayer): 'Q1' | 'Q2' | 'Q3' | 'Q4' => {
    if (p.usg_pct >= baselineUsg && p.ts_pct >= baselineTs) return 'Q1';
    if (p.usg_pct < baselineUsg && p.ts_pct >= baselineTs) return 'Q2';
    if (p.usg_pct < baselineUsg && p.ts_pct < baselineTs) return 'Q3';
    return 'Q4';
  };

  // 4. 動態自適應座標軸邊界與刻度
  const { minUsg, maxUsg, minTs, maxTs, xTicks, yTicks } = useMemo(() => {
    if (filteredPlayers.length === 0) {
      return {
        minUsg: 10,
        maxUsg: 40,
        minTs: 30,
        maxTs: 80,
        xTicks: [10, 15, 20, 25, 30, 35, 40],
        yTicks: [30, 40, 50, 60, 70, 80],
      };
    }
    const usgVals = filteredPlayers.map((p) => p.usg_pct);
    const tsVals = filteredPlayers.map((p) => p.ts_pct);

    const rawMinUsg = Math.min(...usgVals);
    const rawMaxUsg = Math.max(...usgVals);
    const rawMinTs = Math.min(...tsVals);
    const rawMaxTs = Math.max(...tsVals);

    const minU = Math.max(0, Math.min(10, Math.floor((rawMinUsg - 2) / 5) * 5));
    const maxU = Math.max(35, Math.ceil((rawMaxUsg + 3) / 5) * 5);
    const minT = Math.max(0, Math.min(30, Math.floor((rawMinTs - 5) / 10) * 10));
    const maxT = Math.max(75, Math.ceil((rawMaxTs + 5) / 10) * 10);

    const xT: number[] = [];
    for (let u = minU; u <= maxU; u += 5) {
      xT.push(u);
    }
    const yT: number[] = [];
    for (let t = minT; t <= maxT; t += 10) {
      yT.push(t);
    }

    return { minUsg: minU, maxUsg: maxU, minTs: minT, maxTs: maxT, xTicks: xT, yTicks: yT };
  }, [filteredPlayers]);

  // SVG 畫布尺寸
  const width = 800;
  const height = 520;
  const padding = { top: 40, right: 40, bottom: 60, left: 60 };

  const getX = (usg: number) => {
    const clamped = Math.max(minUsg, Math.min(maxUsg, usg));
    return (
      padding.left +
      ((clamped - minUsg) / (maxUsg - minUsg)) *
        (width - padding.left - padding.right)
    );
  };

  const getY = (ts: number) => {
    const clamped = Math.max(minTs, Math.min(maxTs, ts));
    return (
      height -
      padding.bottom -
      ((clamped - minTs) / (maxTs - minTs)) *
        (height - padding.top - padding.bottom)
    );
  };

  const splitX = getX(baselineUsg);
  const splitY = getY(baselineTs);

  // 氣泡半徑大小：舒適溫和區間 6px ~ 12px
  const getBubbleRadius = (gmsc: number) => {
    const clampedGmsc = Math.max(0, Math.min(25, gmsc || 0));
    return 6 + (clampedGmsc / 25) * 6;
  };

  const getQuadrantColor = (q: string) => {
    switch (q) {
      case 'Q1':
        return '#00E676'; // 綠色：高球權・高效率
      case 'Q2':
        return '#38BDF8'; // 天藍：低球權・高效率
      case 'Q3':
        return '#94A3B8'; // 灰藍：低球權・低效率
      case 'Q4':
        return '#FF9100'; // 橘色：高球權・低效率
      default:
        return '#FFFFFF';
    }
  };

  // 表格排序切換
  const handleSort = (field: keyof AdvancedPlayer) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sortedTablePlayers = useMemo(() => {
    return [...filteredPlayers].sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortAsc ? valA - valB : valB - valA;
      }
      return sortAsc
        ? String(valA ?? '').localeCompare(String(valB ?? ''))
        : String(valB ?? '').localeCompare(String(valA ?? ''));
    });
  }, [filteredPlayers, sortField, sortAsc]);

  return (
    <div className="space-y-8">
      {/* 標題與說明 */}
      <div className="relative overflow-hidden rounded-3xl border border-[#30363D] bg-[#161B22] p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <span className="px-3 py-1 rounded-full bg-[#00E676]/15 text-[#00E676] text-xs font-black uppercase tracking-wider border border-[#00E676]/30">
                {stage}
              </span>
              <span className="text-xs text-gray-400 font-medium">球權與真實命中率核心矩陣</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              🎯 主力球員效率象限圖 (USG% vs TS%)
            </h1>
            <p className="text-gray-300 text-sm max-w-2xl leading-relaxed">
              橫軸為球權使用率 (USG%)，縱軸為真實命中率 (TS%)，氣泡大小依單場綜合表現評分 (GmSc) 等比縮放 (6px~12px)。
            </p>
          </div>

          {/* 控制面板：PPG 滑桿與身分篩選 */}
          <div className="p-4 rounded-2xl bg-[#0E1117] border border-[#30363D] space-y-3 min-w-[280px]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400 font-semibold flex items-center space-x-1">
                <Filter className="w-3.5 h-3.5 text-[#FF9100]" />
                <span>最低場均得分:</span>
              </span>
              <span className="font-mono font-bold text-[#FF9100] text-sm">
                ≥ {minPpg} 分
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="25"
              step="1"
              value={minPpg}
              onChange={(e) => setMinPpg(Number(e.target.value))}
              className="w-full accent-[#FF9100] cursor-pointer"
            />

            {/* 本土 / 洋將 切換 */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-gray-400 font-semibold">球員身分:</span>
              <div className="inline-flex p-0.5 rounded-lg bg-[#161B22] border border-[#30363D]">
                {['全部', '本土', '洋將'].map((id) => (
                  <button
                    key={id}
                    onClick={() => setIdentityFilter(id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                      identityFilter === id
                        ? 'bg-[#00E676] text-slate-950 shadow'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {id}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 象限圖本體 (SVG) */}
      <div className="rounded-3xl border border-[#30363D] bg-[#161B22] p-4 sm:p-6 shadow-2xl relative">
        {/* 象限標籤圖例 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 text-xs font-bold">
          <div className="p-2.5 rounded-xl bg-[#00E676]/10 border border-[#00E676]/30 text-[#00E676] flex items-center justify-between">
            <span>Q1: 高球權・高效率 (核心進攻支柱)</span>
            <span className="font-mono text-[11px] opacity-80">
              {filteredPlayers.filter((p) => getPlayerQuadrant(p) === 'Q1').length}人
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center justify-between">
            <span>Q2: 低球權・高效率 (高效終結與奇兵)</span>
            <span className="font-mono text-[11px] opacity-80">
              {filteredPlayers.filter((p) => getPlayerQuadrant(p) === 'Q2').length}人
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-[#FF9100]/10 border border-[#FF9100]/30 text-[#FF9100] flex items-center justify-between">
            <span>Q4: 高球權・低效率 (持球負擔重/待增溫)</span>
            <span className="font-mono text-[11px] opacity-80">
              {filteredPlayers.filter((p) => getPlayerQuadrant(p) === 'Q4').length}人
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-500/10 border border-slate-500/30 text-slate-300 flex items-center justify-between">
            <span>Q3: 低球權・低效率 (體系角色調整中)</span>
            <span className="font-mono text-[11px] opacity-80">
              {filteredPlayers.filter((p) => getPlayerQuadrant(p) === 'Q3').length}人
            </span>
          </div>
        </div>

        {/* SVG 圖表容器 */}
        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto min-w-[700px] select-none"
          >
            {/* 背景分區與四象限底色 */}
            {/* Q1: 右上 */}
            <rect
              x={splitX}
              y={padding.top}
              width={Math.max(0, width - padding.right - splitX)}
              height={Math.max(0, splitY - padding.top)}
              fill="#00E676"
              fillOpacity="0.04"
            />
            {/* Q2: 左上 */}
            <rect
              x={padding.left}
              y={padding.top}
              width={Math.max(0, splitX - padding.left)}
              height={Math.max(0, splitY - padding.top)}
              fill="#38BDF8"
              fillOpacity="0.03"
            />
            {/* Q3: 左下 */}
            <rect
              x={padding.left}
              y={splitY}
              width={Math.max(0, splitX - padding.left)}
              height={Math.max(0, height - padding.bottom - splitY)}
              fill="#64748B"
              fillOpacity="0.03"
            />
            {/* Q4: 右下 */}
            <rect
              x={splitX}
              y={splitY}
              width={Math.max(0, width - padding.right - splitX)}
              height={Math.max(0, height - padding.bottom - splitY)}
              fill="#FF9100"
              fillOpacity="0.04"
            />

            {/* 動態十字基準虛線 */}
            <line
              x1={splitX}
              y1={padding.top}
              x2={splitX}
              y2={height - padding.bottom}
              stroke="#64748B"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <line
              x1={padding.left}
              y1={splitY}
              x2={width - padding.right}
              y2={splitY}
              stroke="#64748B"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />

            {/* 動態基準線文字標註 */}
            <text
              x={splitX + 6}
              y={padding.top + 16}
              fill="#94A3B8"
              fontSize="11"
              fontWeight="bold"
            >
              主力平均 USG% ({baselineUsg.toFixed(1)}%)
            </text>
            <text
              x={width - padding.right - 145}
              y={splitY - 6}
              fill="#94A3B8"
              fontSize="11"
              fontWeight="bold"
            >
              主力平均 TS% ({baselineTs.toFixed(1)}%)
            </text>

            {/* X 軸刻度與標籤 */}
            {xTicks.map((u) => (
              <g key={u}>
                <line
                  x1={getX(u)}
                  y1={height - padding.bottom}
                  x2={getX(u)}
                  y2={height - padding.bottom + 5}
                  stroke="#475569"
                />
                <text
                  x={getX(u)}
                  y={height - padding.bottom + 20}
                  fill="#94A3B8"
                  fontSize="11"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {u}%
                </text>
              </g>
            ))}

            {/* Y 軸刻度與標籤 */}
            {yTicks.map((t) => (
              <g key={t}>
                <line
                  x1={padding.left - 5}
                  y1={getY(t)}
                  x2={padding.left}
                  y2={getY(t)}
                  stroke="#475569"
                />
                <text
                  x={padding.left - 10}
                  y={getY(t) + 4}
                  fill="#94A3B8"
                  fontSize="11"
                  textAnchor="end"
                  fontFamily="monospace"
                >
                  {t}%
                </text>
              </g>
            ))}

            {/* 軸名稱 */}
            <text
              x={width / 2}
              y={height - 15}
              fill="#CBD5E1"
              fontSize="13"
              fontWeight="bold"
              textAnchor="middle"
            >
              球權使用率 (USG%) →
            </text>
            <text
              x={-height / 2}
              y={20}
              transform="rotate(-90)"
              fill="#CBD5E1"
              fontSize="13"
              fontWeight="bold"
              textAnchor="middle"
            >
              真實命中率 (TS%) →
            </text>

            {/* 球員氣泡繪製 */}
            {filteredPlayers.map((p) => {
              const cx = getX(p.usg_pct);
              const cy = getY(p.ts_pct);
              const r = getBubbleRadius(p.gmsc);
              const q = getPlayerQuadrant(p);
              const color = getQuadrantColor(q);
              const isSelected = selectedPlayer?.player_name === p.player_name;
              const shortName = p.player_name.split('(')[0].trim();

              return (
                <g
                  key={`${p.team_name}-${p.player_name}`}
                  className="cursor-pointer transition-all duration-200"
                  onClick={() => setSelectedPlayer(p)}
                >
                  {/* 外圈高亮 */}
                  {isSelected && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r + 5}
                      fill={color}
                      fillOpacity="0.3"
                    />
                  )}
                  {/* 氣泡本體 */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={color}
                    fillOpacity={isSelected ? 0.95 : 0.8}
                    stroke="#FFFFFF"
                    strokeWidth={isSelected ? 2 : 1}
                  />
                  {/* 球員簡稱 */}
                  <text
                    x={cx}
                    y={cy - r - 3}
                    fill={isSelected ? '#FFFFFF' : '#CBD5E1'}
                    fontSize={isSelected ? '11' : '9.5'}
                    fontWeight="bold"
                    textAnchor="middle"
                    className="pointer-events-none drop-shadow select-none"
                  >
                    {shortName}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* 頂部選中球員卡片外層容器 (固定/最小高度 min-h-[76px]，防止內容變動推擠下方表格產生跳動) */}
        <div className="mt-4 min-h-[76px] flex items-center">
          {selectedPlayer ? (
            <div className="w-full min-h-[76px] p-4 rounded-2xl bg-[#0E1117] border border-[#FF9100]/60 shadow-2xl flex flex-wrap items-center justify-between gap-4 animate-in fade-in">
              <div className="flex items-center space-x-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-slate-950 text-sm shadow shrink-0"
                  style={{ backgroundColor: getQuadrantColor(getPlayerQuadrant(selectedPlayer)) }}
                >
                  #{selectedPlayer.jersey_number || '-'}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="text-base font-black text-white">
                      {selectedPlayer.player_name}
                    </h4>
                    <span className="text-xs text-gray-400">
                      ({selectedPlayer.team_name} • {selectedPlayer.identity} • {selectedPlayer.position})
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {getPlayerQuadrant(selectedPlayer) === 'Q1' && '第一象限：高球權・高效率 (核心進攻支柱)'}
                    {getPlayerQuadrant(selectedPlayer) === 'Q2' && '第二象限：低球權・高效率 (高效終結與奇兵)'}
                    {getPlayerQuadrant(selectedPlayer) === 'Q3' && '第三象限：低球權・低效率 (體系角色調整中)'}
                    {getPlayerQuadrant(selectedPlayer) === 'Q4' && '第四象限：高球權・低效率 (持球負擔重/待增溫)'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-5 text-xs font-mono">
                <div>
                  <span className="text-gray-500 block">PPG</span>
                  <span className="text-white font-bold">{selectedPlayer.ppg}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">USG%</span>
                  <span className="text-[#FF9100] font-bold">{selectedPlayer.usg_pct}%</span>
                </div>
                <div>
                  <span className="text-gray-500 block">TS%</span>
                  <span className="text-[#00E676] font-bold">{selectedPlayer.ts_pct}%</span>
                </div>
                <div>
                  <span className="text-gray-500 block">eFG%</span>
                  <span className="text-sky-400 font-bold">{selectedPlayer.efg_pct}%</span>
                </div>
                <div>
                  <span className="text-gray-500 block">GmSc</span>
                  <span className="text-amber-400 font-bold">{selectedPlayer.gmsc}</span>
                </div>
                <Link
                  href={`/player-cards?player=${encodeURIComponent(selectedPlayer.player_name)}`}
                  className="px-3 py-1.5 rounded-lg bg-[#FF9100] text-slate-950 font-black text-xs hover:bg-amber-400 transition-colors"
                >
                  查看球員戰力卡 →
                </Link>
              </div>
            </div>
          ) : (
            <div className="w-full min-h-[76px] p-4 rounded-2xl bg-[#0E1117]/50 border border-dashed border-[#30363D] flex items-center justify-center text-xs text-gray-500">
              點擊下方表格行或象限圖氣泡以選中球員
            </div>
          )}
        </div>
      </div>

      {/* 5. 掛載下方球員詳細數據清單表格（1:1 還原舊版） */}
      <section className="space-y-4">
        <div
          onClick={() => setIsTableExpanded(!isTableExpanded)}
          className="flex items-center justify-between p-4 rounded-2xl border border-[#30363D] bg-[#161B22] cursor-pointer hover:border-[#00E676]/40 transition-all select-none shadow-md"
        >
          <div className="flex items-center space-x-3">
            <TableIcon className="w-5 h-5 text-[#00E676]" />
            <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
              📋 查看象限圖球員詳細數據清單
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-[#0E1117] border border-[#30363D] text-[#00E676] text-xs font-bold font-mono">
              共 {filteredPlayers.length} 位球員（即時連動篩選）
            </span>
          </div>

          <div className="flex items-center space-x-2 text-xs text-gray-400">
            <span>{isTableExpanded ? '收合清單' : '展開完整數據表'}</span>
            {isTableExpanded ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </div>
        </div>

        {isTableExpanded && (
          <div className="overflow-x-auto rounded-2xl border border-[#30363D] bg-[#161B22] shadow-xl animate-in fade-in">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-[#0E1117] text-gray-400 uppercase font-mono tracking-wider border-b border-[#30363D]">
                <tr>
                  <th className="py-3 px-2 text-center">象限</th>
                  <th
                    onClick={() => handleSort('team_name')}
                    className="py-3 px-2 font-bold text-white cursor-pointer hover:text-[#00E676]"
                  >
                    <div className="flex items-center space-x-1">
                      <span>球隊</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-2 text-center">背號</th>
                  <th
                    onClick={() => handleSort('player_name')}
                    className="py-3 px-2 font-bold text-white cursor-pointer hover:text-[#00E676]"
                  >
                    <div className="flex items-center space-x-1">
                      <span>球員名</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-2 text-center">身分</th>
                  <th className="py-3 px-2 text-center">位置</th>
                  <th
                    onClick={() => handleSort('games_played')}
                    className="py-3 px-2 text-center cursor-pointer hover:text-white"
                  >
                    出賽
                  </th>
                  <th className="py-3 px-2 text-center">上場時間</th>
                  <th
                    onClick={() => handleSort('ppg')}
                    className="py-3 px-2 text-right font-bold text-white cursor-pointer hover:text-[#FF9100]"
                  >
                    場均得分
                  </th>
                  <th className="py-3 px-2 text-right">投籃命中/出手</th>
                  <th
                    onClick={() => handleSort('fg_pct')}
                    className="py-3 px-2 text-right cursor-pointer hover:text-white"
                  >
                    命中%
                  </th>
                  <th className="py-3 px-2 text-right">三分命中/出手</th>
                  <th
                    onClick={() => handleSort('p3_pct')}
                    className="py-3 px-2 text-right cursor-pointer hover:text-white"
                  >
                    三分%
                  </th>
                  <th className="py-3 px-2 text-right">罰球命中/出手</th>
                  <th
                    onClick={() => handleSort('ft_pct')}
                    className="py-3 px-2 text-right cursor-pointer hover:text-white"
                  >
                    罰球%
                  </th>
                  <th
                    onClick={() => handleSort('efg_pct')}
                    className="py-3 px-2 text-right text-sky-400 cursor-pointer hover:text-white"
                  >
                    eFG%
                  </th>
                  <th
                    onClick={() => handleSort('ts_pct')}
                    className="py-3 px-2 text-right font-bold text-[#00E676] cursor-pointer hover:text-white"
                  >
                    TS%
                  </th>
                  <th
                    onClick={() => handleSort('three_par')}
                    className="py-3 px-2 text-right cursor-pointer hover:text-white"
                  >
                    3PAr
                  </th>
                  <th
                    onClick={() => handleSort('ftr')}
                    className="py-3 px-2 text-right cursor-pointer hover:text-white"
                  >
                    FTr
                  </th>
                  <th
                    onClick={() => handleSort('usg_pct')}
                    className="py-3 px-2 text-right font-bold text-[#FF9100] cursor-pointer hover:text-white"
                  >
                    USG%
                  </th>
                  <th
                    onClick={() => handleSort('ast_pct')}
                    className="py-3 px-2 text-right cursor-pointer hover:text-white"
                  >
                    AST%
                  </th>
                  <th
                    onClick={() => handleSort('tov_pct')}
                    className="py-3 px-2 text-right cursor-pointer hover:text-white"
                  >
                    TOV%
                  </th>
                  <th
                    onClick={() => handleSort('gmsc')}
                    className="py-3 px-2 text-right font-black text-amber-300 cursor-pointer hover:text-white"
                  >
                    GmSc
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262D] font-mono">
                {isLoading ? (
                  <tr>
                    <td colSpan={22} className="py-8 text-center text-gray-500 font-sans">
                      載入球員數據中...
                    </td>
                  </tr>
                ) : sortedTablePlayers.length === 0 ? (
                  <tr>
                    <td colSpan={22} className="py-8 text-center text-gray-500 font-sans">
                      查無符合篩選條件的球員
                    </td>
                  </tr>
                ) : (
                  sortedTablePlayers.map((player) => {
                    const q = getPlayerQuadrant(player);
                    const qColor = getQuadrantColor(q);
                    const isSelected = selectedPlayer?.player_name === player.player_name;

                    return (
                      <tr
                        key={`${player.team_name}-${player.player_name}`}
                        onClick={() => setSelectedPlayer(player)}
                        className={`transition-colors cursor-pointer ${
                          isSelected ? 'bg-[#21262D]' : 'hover:bg-[#21262D]/50'
                        }`}
                      >
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                            style={{
                              backgroundColor: `${qColor}20`,
                              color: qColor,
                              border: `1px solid ${qColor}40`,
                            }}
                          >
                            {q}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 font-sans font-bold text-gray-200">
                          {player.team_name}
                        </td>
                        <td className="py-2.5 px-2 text-center text-gray-400">
                          {player.jersey_number || '-'}
                        </td>
                        <td className="py-2.5 px-2 font-sans font-bold text-white">
                          <Link
                            href={`/player-cards?player=${encodeURIComponent(player.player_name)}`}
                            className="hover:text-[#00E676] transition-colors"
                          >
                            {player.player_name}
                          </Link>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              player.identity.includes('洋將')
                                ? 'bg-[#FF9100]/15 text-[#FF9100] border border-[#FF9100]/30'
                                : 'bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/30'
                            }`}
                          >
                            {player.identity}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center text-gray-300">
                          {player.position || '-'}
                        </td>
                        <td className="py-2.5 px-2 text-center text-gray-300">
                          {player.games_played}
                        </td>
                        <td className="py-2.5 px-2 text-center text-gray-400">
                          {player.minutes_str || `${player.mpg}分`}
                        </td>
                        <td className="py-2.5 px-2 text-right font-bold text-white">
                          {player.ppg.toFixed(1)}
                        </td>
                        <td className="py-2.5 px-2 text-right text-gray-400">
                          {player.fgm ?? 0}/{player.fga ?? 0}
                        </td>
                        <td className="py-2.5 px-2 text-right text-gray-300">
                          {(player.fg_pct ?? 0).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-2 text-right text-gray-400">
                          {player.p3m ?? 0}/{player.p3a ?? 0}
                        </td>
                        <td className="py-2.5 px-2 text-right text-gray-300">
                          {(player.p3_pct ?? 0).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-2 text-right text-gray-400">
                          {player.ftm ?? 0}/{player.fta ?? 0}
                        </td>
                        <td className="py-2.5 px-2 text-right text-gray-300">
                          {(player.ft_pct ?? 0).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-2 text-right text-sky-400">
                          {(player.efg_pct ?? 0).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-2 text-right font-bold text-[#00E676]">
                          {(player.ts_pct ?? 0).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-2 text-right text-gray-400">
                          {(player.three_par ?? 0).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-2 text-right text-gray-400">
                          {(player.ftr ?? 0).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-2 text-right font-bold text-[#FF9100]">
                          {(player.usg_pct ?? 0).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-2 text-right text-gray-400">
                          {(player.ast_pct ?? 0).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-2 text-right text-gray-400">
                          {(player.tov_pct ?? 0).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-2 text-right font-black text-amber-300">
                          {(player.gmsc ?? 0).toFixed(1)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 四大象限深度解讀與戰術定位 */}
      <section className="space-y-4 pt-2">
        <div className="flex items-center space-x-2">
          <Info className="w-5 h-5 text-[#00E676]" />
          <h2 className="text-xl font-black text-white tracking-tight">
            四大象限深度解讀與戰術定位 (Quadrant Analysis)
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs sm:text-sm">
          <div className="p-5 rounded-2xl bg-[#161B22] border border-[#00E676]/40 space-y-2">
            <span className="px-2.5 py-1 rounded bg-[#00E676]/20 text-[#00E676] font-extrabold text-xs">
              第一象限：高球權・高效率 (核心進攻支柱)
            </span>
            <p className="text-gray-300 leading-relaxed pt-1">
              高於主力平均球權使用率與真實命中率。球隊絕對第一持球進攻箭頭，承擔龐大消化球權壓力的同時，仍能維持頂級終結效率，為半場陣地戰破壞包夾體系的基石。
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#161B22] border border-sky-500/40 space-y-2">
            <span className="px-2.5 py-1 rounded bg-sky-500/20 text-sky-400 font-extrabold text-xs">
              第二象限：低球權・高效率 (高效終結與空檔奇兵)
            </span>
            <p className="text-gray-300 leading-relaxed pt-1">
              不佔用大量戰術發動時間，但每次觸球出手均具備極高把握度。主要為禁區護框吃餅長人或弱側精準空檔射手，極具半場無球戰術價值。
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#161B22] border border-[#FF9100]/40 space-y-2">
            <span className="px-2.5 py-1 rounded bg-[#FF9100]/20 text-[#FF9100] font-extrabold text-xs">
              第四象限：高球權・低效率 (持球負擔重 / 待增溫)
            </span>
            <p className="text-gray-300 leading-relaxed pt-1">
              承擔大量球權發動回合，但在高強度對位防守下命中率受限，或主要持球消化讀秒階段高難度出手。需透過掩護質量與弱側牽制分擔其持球負擔。
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#161B22] border border-slate-500/40 space-y-2">
            <span className="px-2.5 py-1 rounded bg-slate-500/20 text-slate-300 font-extrabold text-xs">
              第三象限：低球權・低效率 (體系角色調整中)
            </span>
            <p className="text-gray-300 leading-relaxed pt-1">
              輪替邊緣或主打防守苦工之球員，在進攻端出手次數少且尚未找到穩定投籃節奏，其主要戰術貢獻在於第一線防守纏鬥、防守籃板保護與轉換快攻偷跑。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

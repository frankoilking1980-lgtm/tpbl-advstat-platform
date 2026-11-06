'use client';

import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import { useStage } from '@/context/StageContext';
import { fetcher } from '@/lib/api';
import { PlayerLink } from '@/components/PlayerLink';
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
  ArrowUp,
  ArrowDown,
  BarChart3,
  SlidersHorizontal,
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
  
  // 雙 Tab 視圖：'traditional' (基礎攻守) | 'advanced' (進階效率)
  const [tableTab, setTableTab] = useState<'traditional' | 'advanced'>('advanced');
  const [sortField, setSortField] = useState<keyof AdvancedPlayer>('gmsc');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const { data: rawPlayers, isLoading } = useSWR<AdvancedPlayer[]>(
    `/api/players/advanced?stage=${encodeURIComponent(stage)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  // 1. 座標百分比歸一化
  const normalizedPlayers = useMemo(() => {
    if (!rawPlayers) return [];

    const fixPct = (val: number | undefined | null): number => {
      if (val === undefined || val === null) return 0;
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

  // 2. 身分篩選器邏輯校正與過濾得分為 0 的未出賽球員
  const filteredPlayers = useMemo(() => {
    if (!normalizedPlayers) return [];
    return normalizedPlayers.filter((p) => {
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

  // 3. 象限動態十字基準線
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

  const getBubbleRadius = (gmsc: number) => {
    const clampedGmsc = Math.max(0, Math.min(25, gmsc || 0));
    return 6 + (clampedGmsc / 25) * 6;
  };

  const getQuadrantColor = (q: string) => {
    switch (q) {
      case 'Q1':
        return '#00E676';
      case 'Q2':
        return '#38BDF8';
      case 'Q3':
        return '#94A3B8';
      case 'Q4':
        return '#FF9100';
      default:
        return '#FFFFFF';
    }
  };

  const handleBubbleClick = (player: AdvancedPlayer) => {
    setSelectedPlayer(player);
    setIsTableExpanded(true);

    setTimeout(() => {
      const rowId = `scatter-row-${encodeURIComponent(player.player_name.trim())}`;
      const rowEl = document.getElementById(rowId);
      if (rowEl) {
        rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
  };

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

  // 排序表頭生成輔助函式
  const renderSortableTh = (
    field: keyof AdvancedPlayer,
    label: string,
    alignClass: string = 'text-right',
    extraClass: string = ''
  ) => {
    const isCurrent = sortField === field;
    return (
      <th
        onClick={() => handleSort(field)}
        className={`py-3 px-3 font-semibold select-none cursor-pointer transition-colors hover:text-white ${alignClass} ${extraClass} ${
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
              橫軸為球權使用率 (USG%)，縱軸為真實命中率 (TS%)，氣泡大小依單場綜合表現評分 (GmSc) 等比縮放。點擊圓圈可直接展開下方數據表並自動定位。
            </p>
          </div>

          {/* 控制面板 */}
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
                  onClick={() => handleBubbleClick(p)}
                >
                  {isSelected && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r + 5}
                      fill={color}
                      fillOpacity="0.3"
                    />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={color}
                    fillOpacity={isSelected ? 0.95 : 0.8}
                    stroke="#FFFFFF"
                    strokeWidth={isSelected ? 2 : 1}
                  />
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

        {/* 頂部選中球員卡片外層容器 */}
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
                <PlayerLink
                  name={selectedPlayer.player_name}
                  stage={stage}
                  className="px-3 py-1.5 rounded-lg bg-[#FF9100] text-slate-950 font-black text-xs hover:bg-amber-400 transition-colors"
                >
                  查看球員戰力卡 →
                </PlayerLink>
              </div>
            </div>
          ) : (
            <div className="w-full min-h-[76px] p-4 rounded-2xl bg-[#0E1117]/50 border border-dashed border-[#30363D] flex items-center justify-center text-xs text-gray-500">
              點擊上方象限圖氣泡或下方表格以選中球員
            </div>
          )}
        </div>
      </div>

      {/* 5. 掛載下方球員詳細數據清單表格 (支援雙 Tab、凍結首欄+首列、全欄位點擊排序) */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border border-[#30363D] bg-[#161B22] shadow-md gap-3">
          <div
            onClick={() => setIsTableExpanded(!isTableExpanded)}
            className="flex items-center space-x-3 cursor-pointer select-none"
          >
            <TableIcon className="w-5 h-5 text-[#00E676]" />
            <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
              📋 查看象限圖球員詳細數據清單
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-[#0E1117] border border-[#30363D] text-[#00E676] text-xs font-bold font-mono">
              共 {filteredPlayers.length} 位球員
            </span>
          </div>

          <div className="flex items-center space-x-3">
            {/* 雙 Tab 切換控制鈕 */}
            <div className="inline-flex p-1 rounded-2xl bg-[#0E1117] border border-[#30363D] shadow-sm shrink-0">
              <button
                onClick={() => setTableTab('traditional')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  tableTab === 'traditional'
                    ? 'bg-amber-500 text-black shadow-sm font-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>基礎攻守</span>
              </button>

              <button
                onClick={() => setTableTab('advanced')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  tableTab === 'advanced'
                    ? 'bg-[#00E676] text-black shadow-sm font-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>進階效率</span>
              </button>
            </div>

            <button
              onClick={() => setIsTableExpanded(!isTableExpanded)}
              className="p-1.5 rounded-xl bg-[#0E1117] border border-[#30363D] text-gray-400 hover:text-white transition-colors"
            >
              {isTableExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {isTableExpanded && (
          <div className="overflow-x-auto max-h-[620px] overflow-y-auto rounded-2xl border border-[#30363D] bg-[#161B22] shadow-2xl relative animate-in fade-in">
            <table className="w-full text-left text-xs whitespace-nowrap border-separate border-spacing-0">
              {/* 凍結表頭 (Sticky Header: top-0 z-30) */}
              <thead className="bg-[#0E1117] text-gray-400 uppercase font-mono tracking-wider sticky top-0 z-30 shadow-md">
                {tableTab === 'traditional' ? (
                  /* 基礎數據表頭 */
                  <tr>
                    {/* 雙重凍結最左欄：球員名稱 (top-0 + left-0 -> z-40) */}
                    <th className="py-3.5 px-4 font-bold text-white sticky top-0 left-0 z-40 bg-[#0E1117] border-b border-r border-[#30363D] shadow-[2px_0_5px_rgba(0,0,0,0.4)]">
                      球員
                    </th>
                    {renderSortableTh('team_name', '球隊', 'text-left')}
                    {renderSortableTh('identity', '身分', 'text-center')}
                    {renderSortableTh('position', '位置', 'text-center')}
                    {renderSortableTh('games_played', '出賽', 'text-center')}
                    {renderSortableTh('mpg', '上場時間', 'text-center')}
                    {renderSortableTh('ppg', '場均得分', 'text-right font-bold text-white')}
                    <th className="py-3 px-3 text-right">投籃命中/出手</th>
                    {renderSortableTh('fg_pct', '命中%')}
                    <th className="py-3 px-3 text-right">三分命中/出手</th>
                    {renderSortableTh('p3_pct', '三分%')}
                    <th className="py-3 px-3 text-right">罰球命中/出手</th>
                    {renderSortableTh('ft_pct', '罰球%')}
                    {renderSortableTh('rpg', '場均籃板', 'text-right font-bold text-white')}
                    {renderSortableTh('apg', '場均助攻', 'text-right font-bold text-sky-400')}
                    {renderSortableTh('spg', '抄截')}
                    {renderSortableTh('bpg', '阻攻')}
                    {renderSortableTh('tpg', '失誤')}
                    {renderSortableTh('plus_minus', '+/-')}
                  </tr>
                ) : (
                  /* 進階數據表頭 */
                  <tr>
                    {/* 雙重凍結最左欄：球員名稱 (top-0 + left-0 -> z-40) */}
                    <th className="py-3.5 px-4 font-bold text-white sticky top-0 left-0 z-40 bg-[#0E1117] border-b border-r border-[#30363D] shadow-[2px_0_5px_rgba(0,0,0,0.4)]">
                      球員
                    </th>
                    {renderSortableTh('team_name', '球隊', 'text-left')}
                    {renderSortableTh('identity', '身分', 'text-center')}
                    {renderSortableTh('position', '位置', 'text-center')}
                    {renderSortableTh('games_played', '出賽', 'text-center')}
                    {renderSortableTh('mpg', '上場時間', 'text-center')}
                    {renderSortableTh('ppg', '場均得分', 'text-right font-bold text-white')}
                    {renderSortableTh('efg_pct', 'eFG%', 'text-right text-[#FF9100]')}
                    {renderSortableTh('ts_pct', 'TS%', 'text-right font-bold text-[#FF9100]')}
                    {renderSortableTh('three_par', '3PAr')}
                    {renderSortableTh('ftr', 'FTr')}
                    {renderSortableTh('usg_pct', 'USG%', 'text-right font-black text-[#00E676]')}
                    {renderSortableTh('ast_pct', 'AST%')}
                    {renderSortableTh('tov_pct', 'TOV%')}
                    {renderSortableTh('gmsc', 'GmSc', 'text-right font-black text-amber-300')}
                    {renderSortableTh('plus_minus', '+/-')}
                  </tr>
                )}
              </thead>

              <tbody className="divide-y divide-[#21262D] font-mono">
                {isLoading ? (
                  <tr>
                    <td colSpan={20} className="py-12 text-center text-gray-500 font-sans">
                      載入球員數據中...
                    </td>
                  </tr>
                ) : sortedTablePlayers.length === 0 ? (
                  <tr>
                    <td colSpan={20} className="py-12 text-center text-gray-500 font-sans">
                      查無符合篩選條件的球員
                    </td>
                  </tr>
                ) : (
                  sortedTablePlayers.map((player) => {
                    const q = getPlayerQuadrant(player);
                    const qColor = getQuadrantColor(q);
                    const isSelected = selectedPlayer?.player_name === player.player_name;
                    const rowId = `scatter-row-${encodeURIComponent(player.player_name.trim())}`;

                    return (
                      <tr
                        key={`${player.team_name}-${player.player_name}`}
                        id={rowId}
                        onClick={() => setSelectedPlayer(player)}
                        className={`transition-colors cursor-pointer group ${
                          isSelected
                            ? 'bg-[#FF9100]/20'
                            : 'hover:bg-[#21262D]/60'
                        }`}
                      >
                        {/* 凍結最左側球員欄 (Sticky Column: left-0 z-20) */}
                        <td className={`py-3 px-4 sticky left-0 z-20 font-sans font-bold text-white border-r border-[#21262D]/40 shadow-[2px_0_5px_rgba(0,0,0,0.3)] transition-colors ${
                          isSelected ? 'bg-[#272118]' : 'bg-[#161B22] group-hover:bg-[#1C2128]'
                        }`}>
                          <div className="flex items-center space-x-2">
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0"
                              style={{
                                backgroundColor: `${qColor}20`,
                                color: qColor,
                                border: `1px solid ${qColor}40`,
                              }}
                            >
                              {q}
                            </span>
                            <span className="text-gray-500 text-xs font-mono w-5 shrink-0">
                              #{player.jersey_number || '-'}
                            </span>
                            <PlayerLink
                              name={player.player_name}
                              stage={stage}
                              className="font-bold text-white group-hover:text-[#00E676] whitespace-nowrap"
                            />
                          </div>
                        </td>

                        <td className="py-3 px-3 font-sans font-bold text-gray-300">
                          {player.team_name}
                        </td>
                        <td className="py-3 px-3 text-center">
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
                        <td className="py-3 px-3 text-center text-gray-400 font-sans">
                          {player.position || '-'}
                        </td>
                        <td className="py-3 px-3 text-center text-gray-300">
                          {player.games_played}
                        </td>
                        <td className="py-3 px-3 text-center text-gray-400">
                          {player.minutes_str || `${player.mpg.toFixed(1)}分`}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-white">
                          {player.ppg.toFixed(1)}
                        </td>

                        {tableTab === 'traditional' ? (
                          /* 基礎攻守數據格 */
                          <>
                            <td className="py-3 px-3 text-right text-gray-300">
                              {player.fgm ?? 0}/{player.fga ?? 0}
                            </td>
                            <td className="py-3 px-3 text-right text-gray-300">
                              {(player.fg_pct ?? 0).toFixed(1)}%
                            </td>
                            <td className="py-3 px-3 text-right text-gray-300">
                              {player.p3m ?? 0}/{player.p3a ?? 0}
                            </td>
                            <td className="py-3 px-3 text-right text-gray-300">
                              {(player.p3_pct ?? 0).toFixed(1)}%
                            </td>
                            <td className="py-3 px-3 text-right text-gray-300">
                              {player.ftm ?? 0}/{player.fta ?? 0}
                            </td>
                            <td className="py-3 px-3 text-right text-gray-300">
                              {(player.ft_pct ?? 0).toFixed(1)}%
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-white">
                              {(player.rpg ?? 0).toFixed(1)}
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-sky-400">
                              {(player.apg ?? 0).toFixed(1)}
                            </td>
                            <td className="py-3 px-3 text-right text-gray-300">
                              {(player.spg ?? 0).toFixed(1)}
                            </td>
                            <td className="py-3 px-3 text-right text-gray-300">
                              {(player.bpg ?? 0).toFixed(1)}
                            </td>
                            <td className="py-3 px-3 text-right text-gray-300">
                              {(player.tpg ?? 0).toFixed(1)}
                            </td>
                            <td className={`py-3 px-3 text-right font-bold ${
                              (player.plus_minus ?? 0) > 0
                                ? 'text-[#00E676]'
                                : (player.plus_minus ?? 0) < 0
                                ? 'text-red-400'
                                : 'text-gray-400'
                            }`}>
                              {player.plus_minus > 0 ? `+${player.plus_minus.toFixed(1)}` : player.plus_minus.toFixed(1)}
                            </td>
                          </>
                        ) : (
                          /* 進階效率數據格 */
                          <>
                            <td className="py-3 px-3 text-right text-[#FF9100] font-bold">
                              {(player.efg_pct ?? 0).toFixed(1)}%
                            </td>
                            <td className="py-3 px-3 text-right text-[#FF9100] font-bold">
                              {(player.ts_pct ?? 0).toFixed(1)}%
                            </td>
                            <td className="py-3 px-3 text-right text-gray-300">
                              {(player.three_par ?? 0).toFixed(1)}%
                            </td>
                            <td className="py-3 px-3 text-right text-gray-300">
                              {(player.ftr ?? 0).toFixed(1)}%
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-[#00E676]">
                              {(player.usg_pct ?? 0).toFixed(1)}%
                            </td>
                            <td className="py-3 px-3 text-right text-gray-300">
                              {(player.ast_pct ?? 0).toFixed(1)}%
                            </td>
                            <td className="py-3 px-3 text-right text-gray-300">
                              {(player.tov_pct ?? 0).toFixed(1)}%
                            </td>
                            <td className="py-3 px-3 text-right font-black text-amber-300">
                              {(player.gmsc ?? 0).toFixed(1)}
                            </td>
                            <td className={`py-3 px-3 text-right font-bold ${
                              (player.plus_minus ?? 0) > 0
                                ? 'text-[#00E676]'
                                : (player.plus_minus ?? 0) < 0
                                ? 'text-red-400'
                                : 'text-gray-400'
                            }`}>
                              {player.plus_minus > 0 ? `+${player.plus_minus.toFixed(1)}` : player.plus_minus.toFixed(1)}
                            </td>
                          </>
                        )}
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
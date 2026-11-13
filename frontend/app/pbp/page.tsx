'use client';

import React, { useMemo, useState, useEffect, Suspense } from 'react';
import useSWR from 'swr';
import { useSearchParams } from 'next/navigation';
import { useStage } from '@/context/StageContext';
import { fetcher } from '@/lib/api';
import { PlayerLink } from '@/components/PlayerLink';
import {
  Zap,
  Users,
  Clock,
  Sparkles,
  Table2,
  BarChart3,
  SlidersHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* 吉祥物透明 PNG 對應設定                                             */
/* ------------------------------------------------------------------ */

interface MascotSetting {
  id: string;
  name: string;
  file: string;
  containerClass: string;
  imgClass: string;
  glowColor: string;
}

const MASCOTS_MAP: Record<string, MascotSetting> = {
  '新北國王': {
    id: 'Hiro',
    name: 'Hiro',
    file: '/mascots/Hiro.png',
    containerClass: '-top-16 sm:-top-20 -bottom-2 right-0 sm:right-2 w-56 sm:w-72 lg:w-80',
    imgClass: 'scale-110 object-contain',
    glowColor: 'rgba(255, 193, 7, 0.45)',
  },
  '新竹御頂攻城獅': {
    id: 'Ready',
    name: 'Ready',
    file: '/mascots/Ready.png',
    containerClass: '-top-12 sm:-top-16 -bottom-2 right-1 sm:right-4 w-52 sm:w-64 lg:w-72',
    imgClass: 'scale-105 object-contain',
    glowColor: 'rgba(168, 85, 247, 0.45)',
  },
  '高雄全家海神': {
    id: 'Brownie',
    name: 'Brownie',
    file: '/mascots/Brownie.png',
    containerClass: '-top-10 sm:-top-14 -bottom-2 right-1 sm:right-4 w-48 sm:w-60 lg:w-68',
    imgClass: 'scale-105 object-contain',
    glowColor: 'rgba(14, 165, 233, 0.45)',
  },
  '桃園台啤永豐雲豹': {
    id: 'LeopardBro',
    name: 'LeopardBro',
    file: '/mascots/LeopardBro.png',
    containerClass: '-top-12 sm:-top-18 -bottom-2 right-1 sm:right-4 w-44 sm:w-56 lg:w-64',
    imgClass: 'scale-115 object-contain',
    glowColor: 'rgba(132, 204, 22, 0.45)',
  },
  '臺北台新戰神': {
    id: 'Richart',
    name: 'Richart',
    file: '/mascots/Richart.png',
    containerClass: '-top-10 sm:-top-14 -bottom-2 right-2 sm:right-6 w-44 sm:w-56 lg:w-64',
    imgClass: 'scale-110 object-contain',
    glowColor: 'rgba(239, 68, 68, 0.45)',
  },
  '新北中信特攻': {
    id: 'Thunder',
    name: 'Thunder',
    file: '/mascots/Thunder.png',
    containerClass: '-top-12 sm:-top-16 -bottom-2 right-2 sm:right-6 w-48 sm:w-60 lg:w-68',
    imgClass: 'scale-115 object-contain',
    glowColor: 'rgba(234, 179, 8, 0.45)',
  },
  '福爾摩沙夢想家': {
    id: 'Unicorn',
    name: 'Unicorn',
    file: '/mascots/Unicorn.png',
    containerClass: '-top-10 sm:-top-14 -bottom-2 right-2 sm:right-6 w-48 sm:w-60 lg:w-68',
    imgClass: 'scale-110 object-contain',
    glowColor: 'rgba(16, 185, 129, 0.45)',
  },
};

function getMascotByTeam(teamName: string): MascotSetting | null {
  if (!teamName) return null;
  for (const [key, config] of Object.entries(MASCOTS_MAP)) {
    if (teamName.includes(key) || key.includes(teamName)) {
      return config;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 型別定義                                                            */
/* ------------------------------------------------------------------ */

interface OnOffPlayer {
  player_name: string;
  total_time: string;
  on_ortg: number;
  on_drtg: number;
  on_netrtg: number;
  off_netrtg: number;
  diff_netrtg: number;
}

interface FiveManLineup {
  lineup_name: string;
  total_time: string;
  total_seconds?: number;
  possessions?: number;
  plus_minus: number;
  ortg: number;
  drtg: number;
  netrtg: number;
}

interface ForeignDuo {
  duo_name: string;
  total_time: string;
  total_seconds?: number;
  possessions?: number;
  plus_minus: number;
  ortg: number;
  drtg: number;
  netrtg: number;
  features_and_advice: string;
}

interface TeamBoxPlayer {
  id?: number | string;
  player_name: string;
  jersey_number?: string | number | null;
  identity?: string | null;
  is_starter?: boolean;
  games_played?: number;
  minutes?: string;
  seconds?: number;
  pts?: number;
  fgm?: number;
  fga?: number;
  fg_pct?: number;
  tpm?: number;
  tpa?: number;
  tp_pct?: number;
  ftm?: number;
  fta?: number;
  ft_pct?: number;
  orb?: number;
  drb?: number;
  reb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  tov?: number;
  pf?: number;
  plus_minus?: number;
  efg_pct?: number;
  ts_pct?: number;
  usg_pct?: number;
  threepar?: number;
  ftr?: number;
  gmsc?: number;
  ortg?: number;
  drtg?: number;
  netrtg?: number;
}

interface PBPResponse {
  team_name: string;
  stage: string;
  exclude_garbage_time?: boolean;
  garbage_time_filter_supported?: boolean;
  data_limitation_note?: string;
  on_off_players: OnOffPlayer[];
  five_man_lineups: FiveManLineup[];
  foreign_duos: ForeignDuo[];
  player_boxscore?: TeamBoxPlayer[];
  player_stats?: TeamBoxPlayer[];
}

/* ------------------------------------------------------------------ */
/* 格式化輔助函式                                                       */
/* ------------------------------------------------------------------ */

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const fx = (v: unknown, d = 1): string => {
  if (!isNum(v)) return '-';
  return v.toFixed(d);
};

const smartPctStr = (v: unknown, d = 1): string => {
  if (v === undefined || v === null || v === '' || v === '-') return '-';
  const num = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(num)) return '-';
  const finalVal = Math.abs(num) > 2 ? num : num * 100;
  return `${finalVal.toFixed(d)}%`;
};

const signed = (n: number | null | undefined, d = 1): string => {
  if (!isNum(n)) return '-';
  return `${n > 0 ? '+' : ''}${n.toFixed(d)}`;
};
const signColor = (n: number | null | undefined): string => {
  if (!isNum(n) || n === 0) return 'text-gray-400';
  return n > 0 ? 'text-[#00E676]' : 'text-red-400';
};

const parseSeconds = (seconds?: number, minutesStr?: string): number => {
  if (isNum(seconds) && seconds >= 0) return seconds;
  if (typeof minutesStr === 'string') {
    const trimmed = minutesStr.trim();
    if (trimmed.includes(':')) {
      const parts = trimmed.split(':').map(Number);
      if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
        return parts[0] === 0 ? parts[1] * 60 + parts[2] : parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return parts[0] * 60 + parts[1];
      }
    } else if (/^\d+(\.\d+)?$/.test(trimmed)) {
      return Math.round(Number(trimmed));
    }
  }
  return 0;
};

const formatLineupTime = (totalTime?: string, totalSeconds?: number): string => {
  if (isNum(totalSeconds) && totalSeconds >= 0) {
    const sec = Math.round(totalSeconds);
    return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  }
  if (typeof totalTime === 'string') {
    const trimmed = totalTime.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const sec = Math.round(Number(trimmed));
      return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    }
    if (trimmed.startsWith('00:') && trimmed.split(':').length === 3) {
      return trimmed.slice(3);
    }
    return trimmed;
  }
  return '00:00';
};

const isSmallSample = (totalTime?: string, possessions?: number, totalSeconds?: number): boolean => {
  if (isNum(possessions) && possessions > 0) {
    return possessions < 80;
  }
  const sec = isNum(totalSeconds) && totalSeconds >= 0 ? totalSeconds : parseSeconds(undefined, totalTime);
  return sec < 35 * 60;
};

function SmallSampleBadge() {
  return (
    <span
      title="累計出賽時間未滿 35 分鐘（約 < 80 回合），樣本數偏低易受短期手感波動影響"
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/40 text-[11px] font-bold cursor-help whitespace-nowrap"
    >
      ⚠️ 小樣本
    </span>
  );
}

const staticJsonFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
};

const TEAMS = [
  '新北國王',
  '福爾摩沙夢想家',
  '高雄全家海神',
  '新北中信特攻',
  '桃園台啤永豐雲豹',
  '新竹御頂攻城獅',
  '臺北台新戰神',
];

/* ------------------------------------------------------------------ */
/* 主要內容組件                                                        */
/* ------------------------------------------------------------------ */

function PBPContent() {
  const { stage } = useStage();
  const searchParams = useSearchParams();
  const urlTeam = searchParams.get('team');

  const [selectedTeam, setSelectedTeam] = useState<string>('新北國王');
  const [activeSubTab, setActiveSubTab] = useState<'duos' | 'onoff' | 'lineups' | 'boxscore'>('duos');
  
  // 網址帶有 ?team= 時自動切換到對應球隊
  useEffect(() => {
    if (urlTeam) {
      const decoded = decodeURIComponent(urlTeam).trim();
      const matched = TEAMS.find((t) => t.includes(decoded) || decoded.includes(t));
      if (matched) {
        setSelectedTeam(matched);
      }
    }
  }, [urlTeam]);

  // Box Score 專屬視圖切換：'traditional' (基礎攻守) | 'advanced' (進階效率)
  const [boxScoreView, setBoxScoreView] = useState<'traditional' | 'advanced'>('advanced');

  // 排除垃圾時間開關
  const [excludeGarbageTime, setExcludeGarbageTime] = useState<boolean>(false);

  // 排序狀態
  const [sortField, setSortField] = useState<string>('pts');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // 主要 PBP 數據
  const { data, isLoading } = useSWR<PBPResponse>(
    `/api/teams/${encodeURIComponent(selectedTeam)}/pbp?stage=${encodeURIComponent(stage)}&exclude_garbage_time=${excludeGarbageTime}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000, keepPreviousData: true }
  );

  // 獨立球員完整進階數據來源 (球隊專屬)
  const { data: teamPlayersData, isLoading: playersLoading } = useSWR<TeamBoxPlayer[]>(
    activeSubTab === 'boxscore'
      ? `/api/teams/${encodeURIComponent(selectedTeam)}/players?stage=${encodeURIComponent(stage)}`
      : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  // 與球員戰力卡完全相同的權威進階數據 API
  const { data: advPlayers } = useSWR<any[]>(
    activeSubTab === 'boxscore'
      ? `/api/players/advanced?stage=${encodeURIComponent(stage)}`
      : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  // 備援權威靜態 PR 數據表
  const { data: prStatsData } = useSWR<any>(
    activeSubTab === 'boxscore' ? '/player_pr_stats.json' : null,
    staticJsonFetcher,
    { revalidateOnFocus: false }
  );

  // 建立與球員卡 100% 同步的 USG% 權威對照表
  const authoritativeUsgMap = useMemo(() => {
    const map = new Map<string, number>();

    const prStage = prStatsData?.meta?.stage || '2026-2027 例行賽';
    if (prStatsData?.players && stage === prStage) {
      Object.entries(prStatsData.players).forEach(([name, pData]: [string, any]) => {
        const val = pData?.badges?.['USG%']?.val;
        if (isNum(val) && val > 0) {
          map.set(name.trim(), val);
        }
      });
    }

    if (Array.isArray(advPlayers)) {
      advPlayers.forEach((p) => {
        const name = (p.player_name || p.name || '').trim();
        const usg = Number(p.usg_pct ?? p.usg ?? 0);
        if (name && Number.isFinite(usg) && usg > 0) {
          map.set(name, usg);
        }
      });
    }

    return map;
  }, [advPlayers, prStatsData, stage]);

  // 聚合球員原始列表
  const rawPlayerList = useMemo(() => {
    if (Array.isArray(teamPlayersData) && teamPlayersData.length > 0) return teamPlayersData;
    if (Array.isArray(data?.player_boxscore) && data.player_boxscore.length > 0) return data.player_boxscore;
    if (Array.isArray(data?.player_stats) && data.player_stats.length > 0) return data.player_stats;
    return [];
  }, [teamPlayersData, data]);

  // 全隊進攻總量統計
  const teamTotals = useMemo(() => {
    return rawPlayerList.reduce(
      (acc, p) => {
        const gp = p.games_played && p.games_played > 0 ? p.games_played : 1;
        const pSec = parseSeconds(p.seconds, p.minutes);
        acc.total_fga += (p.fga || 0) * gp;
        acc.total_fta += (p.fta || 0) * gp;
        acc.total_tov += (p.tov || 0) * gp;
        acc.total_seconds += pSec * gp;
        return acc;
      },
      { total_fga: 0, total_fta: 0, total_tov: 0, total_seconds: 0 }
    );
  }, [rawPlayerList]);

  // 排序後的球員列表
  const hasPlayerRtg = (teamPlayersData ?? []).some((q) => isNum(q.ortg) || isNum(q.drtg) || isNum(q.netrtg));
  const sortedPlayerList = useMemo(() => {
    if (!rawPlayerList || rawPlayerList.length === 0) return [];

    return [...rawPlayerList].sort((a, b) => {
      let valA: number = 0;
      let valB: number = 0;

      const getUsg = (p: TeamBoxPlayer) => {
        const cleanName = (p.player_name || '').trim();
        let usg = authoritativeUsgMap.get(cleanName);
        if (usg === undefined && isNum(p.usg_pct) && p.usg_pct > 0) usg = p.usg_pct;
        return usg ?? 0;
      };

      switch (sortField) {
        case 'player_name':
          return sortDirection === 'asc'
            ? a.player_name.localeCompare(b.player_name)
            : b.player_name.localeCompare(a.player_name);
        case 'games_played':
          valA = a.games_played ?? 0;
          valB = b.games_played ?? 0;
          break;
        case 'minutes':
          valA = parseSeconds(a.seconds, a.minutes);
          valB = parseSeconds(b.seconds, b.minutes);
          break;
        case 'pts':
          valA = a.pts ?? 0;
          valB = b.pts ?? 0;
          break;
        case 'fgm':
          valA = a.fgm ?? 0;
          valB = b.fgm ?? 0;
          break;
        case 'fg_pct':
          valA = a.fg_pct ?? (a.fga ? (a.fgm || 0) / a.fga : 0);
          valB = b.fg_pct ?? (b.fga ? (b.fgm || 0) / b.fga : 0);
          break;
        case 'tpm':
          valA = a.tpm ?? 0;
          valB = b.tpm ?? 0;
          break;
        case 'tp_pct':
          valA = a.tp_pct ?? (a.tpa ? (a.tpm || 0) / a.tpa : 0);
          valB = b.tp_pct ?? (b.tpa ? (b.tpm || 0) / b.tpa : 0);
          break;
        case 'ftm':
          valA = a.ftm ?? 0;
          valB = b.ftm ?? 0;
          break;
        case 'ft_pct':
          valA = a.ft_pct ?? (a.fta ? (a.ftm || 0) / a.fta : 0);
          valB = b.ft_pct ?? (b.fta ? (b.ftm || 0) / b.fta : 0);
          break;
        case 'orb':
          valA = a.orb ?? 0;
          valB = b.orb ?? 0;
          break;
        case 'drb':
          valA = a.drb ?? 0;
          valB = b.drb ?? 0;
          break;
        case 'reb':
          valA = a.reb ?? 0;
          valB = b.reb ?? 0;
          break;
        case 'ast':
          valA = a.ast ?? 0;
          valB = b.ast ?? 0;
          break;
        case 'stl':
          valA = a.stl ?? 0;
          valB = b.stl ?? 0;
          break;
        case 'blk':
          valA = a.blk ?? 0;
          valB = b.blk ?? 0;
          break;
        case 'tov':
          valA = a.tov ?? 0;
          valB = b.tov ?? 0;
          break;
        case 'pf':
          valA = a.pf ?? 0;
          valB = b.pf ?? 0;
          break;
        case 'plus_minus':
          valA = a.plus_minus ?? 0;
          valB = b.plus_minus ?? 0;
          break;
        case 'efg_pct':
          valA = a.efg_pct ?? 0;
          valB = b.efg_pct ?? 0;
          break;
        case 'ts_pct':
          valA = a.ts_pct ?? 0;
          valB = b.ts_pct ?? 0;
          break;
        case 'threepar':
          valA = a.threepar ?? (a.fga ? (a.tpa || 0) / a.fga : 0);
          valB = b.threepar ?? (b.fga ? (b.tpa || 0) / b.fga : 0);
          break;
        case 'ftr':
          valA = a.ftr ?? (a.fga ? (a.fta || 0) / a.fga : 0);
          valB = b.ftr ?? (b.fga ? (b.fta || 0) / b.fga : 0);
          break;
        case 'usg_pct':
          valA = getUsg(a);
          valB = getUsg(b);
          break;
        case 'gmsc':
          valA = a.gmsc ?? 0;
          valB = b.gmsc ?? 0;
          break;
        case 'ortg':
          valA = a.ortg ?? 0;
          valB = b.ortg ?? 0;
          break;
        case 'drtg':
          valA = a.drtg ?? 0;
          valB = b.drtg ?? 0;
          break;
        case 'netrtg':
          valA = a.netrtg ?? 0;
          valB = b.netrtg ?? 0;
          break;
        default:
          valA = a.pts ?? 0;
          valB = b.pts ?? 0;
      }

      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });
  }, [rawPlayerList, sortField, sortDirection, authoritativeUsgMap]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const renderSortableHeader = (
    field: string,
    label: string,
    className: string = 'text-right',
    alignRight: boolean = true
  ) => {
    const isCurrent = sortField === field;
    return (
      <th
        onClick={() => handleSort(field)}
        className={`py-3.5 px-3 font-semibold select-none cursor-pointer transition-colors hover:text-white ${className} ${
          isCurrent ? 'text-[#FF9100]' : 'text-gray-400'
        }`}
      >
        <div className={`inline-flex items-center space-x-1 ${alignRight ? 'justify-end' : 'justify-start'}`}>
          <span>{label}</span>
          {isCurrent ? (
            sortDirection === 'desc' ? (
              <ArrowDown className="w-3.5 h-3.5 text-[#FF9100]" />
            ) : (
              <ArrowUp className="w-3.5 h-3.5 text-[#FF9100]" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 opacity-30 hover:opacity-100" />
          )}
        </div>
      </th>
    );
  };

  const currentMascot = getMascotByTeam(selectedTeam);

  return (
    <div className="space-y-10">
      <div className="pt-10">
        <div className="relative rounded-3xl border border-[#30363D] bg-gradient-to-r from-[#161B22] via-[#161B22] to-[#0E1117] p-6 sm:p-8 shadow-2xl">
          <div className="absolute top-0 right-1/4 w-80 h-80 bg-[#FF9100]/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-20 flex flex-col lg:flex-row lg:items-center justify-between gap-6 pr-0 lg:pr-72">
            <div className="space-y-2 max-w-xl">
              <div className="flex items-center space-x-2">
                <span className="px-3 py-1 rounded-full bg-[#00E676]/15 text-[#00E676] text-xs font-black uppercase tracking-wider border border-[#00E676]/30 backdrop-blur-sm">
                  {stage}
                </span>
                <span className="text-xs text-gray-400 font-medium">Play-By-Play 深度陣容數據庫</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight drop-shadow-md">
                ⚡ 各隊 PBP 陣容與 On/Off 淨影響力
              </h1>
              <p className="text-gray-300 text-sm leading-relaxed">
                追蹤球員在場與下場的淨效率差距 (With-Or-Without-You, WOWY)、五人組合攻防淨評分、雙洋將搭檔化學效應矩陣與球隊完整進階攻守數據。
              </p>
            </div>

            <div className="inline-flex flex-wrap gap-1.5 p-1.5 rounded-2xl bg-[#0E1117]/90 border border-[#30363D] shadow-xl backdrop-blur-md max-w-sm shrink-0">
              {TEAMS.map((t) => (
                <button
                  key={t}
                  onClick={() => setSelectedTeam(t)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    selectedTeam === t
                      ? 'bg-[#FF9100] text-slate-950 font-black shadow-md'
                      : 'text-gray-400 hover:text-white hover:bg-[#161B22]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {currentMascot && (
            <div
              key={currentMascot.id}
              className={`absolute pointer-events-none select-none z-30 flex items-end justify-center transition-all duration-300 ease-out animate-fadeIn ${currentMascot.containerClass}`}
            >
              <div
                className="absolute inset-0 rounded-full blur-3xl opacity-75 -z-10"
                style={{ backgroundColor: currentMascot.glowColor }}
              />
              <img
                src={currentMascot.file}
                alt={currentMascot.name}
                className={`w-full h-auto max-h-[145%] drop-shadow-[0_25px_35px_rgba(0,0,0,0.85)] transition-transform duration-300 ${currentMascot.imgClass}`}
              />
            </div>
          )}
        </div>
      </div>

      {/* 四大次級導航 Tab + 垃圾時間過濾開關 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#21262D] pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveSubTab('duos')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeSubTab === 'duos'
                ? 'bg-[#161B22] text-[#00E676] border border-[#00E676]/40 shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>雙洋將化學效應矩陣與搭配建議 ({data?.foreign_duos?.length ?? 0})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('onoff')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeSubTab === 'onoff'
                ? 'bg-[#161B22] text-[#FF9100] border border-[#FF9100]/40 shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>主力球員 On/Off 總榜 ({data?.on_off_players?.length ?? 0})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('lineups')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeSubTab === 'lineups'
                ? 'bg-[#161B22] text-sky-400 border border-sky-400/40 shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>最佳五人陣容組合 ({data?.five_man_lineups?.length ?? 0})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('boxscore')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeSubTab === 'boxscore'
                ? 'bg-[#161B22] text-amber-400 border border-amber-400/40 shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Table2 className="w-4 h-4" />
            <span>完整球員數據庫 Box Score ({rawPlayerList.length})</span>
          </button>
        </div>

        {/* 排除垃圾時間開關 (依後端支援狀態顯示可用或資料限制提示) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={data?.garbage_time_filter_supported === false}
            onClick={() => {
              if (data?.garbage_time_filter_supported !== false) {
                setExcludeGarbageTime((prev) => !prev);
              }
            }}
            title={
              data?.data_limitation_note ||
              '過濾第 4 節或延長賽且分差 ≥ 20 分之回合'
            }
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
              data?.garbage_time_filter_supported === false
                ? 'bg-[#0E1117] border-[#30363D] text-gray-500 cursor-not-allowed opacity-80'
                : excludeGarbageTime
                ? 'bg-[#00E676]/15 border-[#00E676]/50 text-[#00E676]'
                : 'bg-[#161B22] border-[#30363D] text-gray-300 hover:text-white'
            }`}
          >
            <span
              className={`w-7 h-4 rounded-full relative transition-colors ${
                excludeGarbageTime && data?.garbage_time_filter_supported !== false
                  ? 'bg-[#00E676]'
                  : 'bg-[#30363D]'
              }`}
            >
              <span
                className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                  excludeGarbageTime && data?.garbage_time_filter_supported !== false
                    ? 'translate-x-3.5 left-0'
                    : 'left-0.5'
                }`}
              />
            </span>
            <span>排除垃圾時間（Q4 分差 ≥ 20）</span>
            {data?.garbage_time_filter_supported === false && (
              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px]">
                無逐回合比分
              </span>
            )}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-16 text-center text-gray-500 font-medium">正在載入 {selectedTeam} PBP 數據...</div>
      ) : (
        <div>
          {/* 1. 雙洋將化學效應矩陣 */}
          {activeSubTab === 'duos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-white">
                  {selectedTeam} • 雙洋將化學效應與攻守特徵建議
                </h3>
                <span className="text-xs text-gray-400">攻守特徵與搭配建議自動完整折行展示</span>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {data?.foreign_duos && data.foreign_duos.length > 0 ? (
                  data.foreign_duos.map((duo, idx) => (
                    <div
                      key={idx}
                      className="p-6 rounded-3xl border border-[#30363D] bg-[#161B22] shadow-xl hover:border-[#00E676]/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6"
                    >
                      <div className="space-y-2 max-w-2xl">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="px-3 py-1 rounded-xl bg-[#00E676]/15 text-[#00E676] font-black text-sm border border-[#00E676]/30">
                            {duo.duo_name}
                          </span>
                          {isSmallSample(duo.total_time, duo.possessions, duo.total_seconds) && <SmallSampleBadge />}
                          <span className="flex items-center space-x-1 text-xs text-gray-400 font-mono">
                            <Clock className="w-3.5 h-3.5" />
                            <span>共同出賽: {formatLineupTime(duo.total_time, duo.total_seconds)}</span>
                          </span>
                        </div>

                        <p className="text-sm text-gray-200 whitespace-normal break-words leading-relaxed select-text pt-1">
                          {duo.features_and_advice}
                        </p>
                      </div>

                      <div className="flex items-center space-x-4 text-center font-mono shrink-0">
                        <div className="p-3 rounded-2xl bg-[#0E1117] border border-[#21262D] min-w-[70px]">
                          <span className="text-[10px] text-gray-400 block font-sans">正負值</span>
                          <span
                            className={`text-base font-black ${
                              duo.plus_minus > 0
                                ? 'text-[#00E676]'
                                : duo.plus_minus < 0
                                ? 'text-red-400'
                                : 'text-gray-300'
                            }`}
                          >
                            {duo.plus_minus > 0 ? `+${duo.plus_minus}` : duo.plus_minus}
                          </span>
                        </div>
                        <div className="p-3 rounded-2xl bg-[#0E1117] border border-[#21262D] min-w-[70px]">
                          <span className="text-[10px] text-gray-400 block font-sans">Lineup ORtg</span>
                          <span className="text-base font-bold text-[#FF9100]">{duo.ortg}</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-[#0E1117] border border-[#21262D] min-w-[70px]">
                          <span className="text-[10px] text-gray-400 block font-sans">Lineup DRtg</span>
                          <span className="text-base font-bold text-sky-400">{duo.drtg}</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-[#0E1117] border border-[#21262D] min-w-[75px]">
                          <span className="text-[10px] text-gray-400 block font-sans">淨評分 NetRtg</span>
                          <span
                            className={`text-base font-black ${
                              duo.netrtg > 0
                                ? 'text-[#00E676]'
                                : duo.netrtg < 0
                                ? 'text-red-400'
                                : 'text-gray-300'
                            }`}
                          >
                            {duo.netrtg > 0 ? `+${duo.netrtg}` : duo.netrtg}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-12 text-center text-gray-500 rounded-2xl bg-[#161B22] border border-[#30363D]">
                    該球隊於此階段暫無搭檔矩陣紀錄
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. 主力 On/Off 總榜 */}
          {activeSubTab === 'onoff' && (
            <div className="space-y-4">
              <h3 className="text-lg font-black text-white">
                {selectedTeam} • 主力球員 On/Off 淨影響力榜 (WOWY Diff)
              </h3>
              <div className="overflow-x-auto rounded-2xl border border-[#30363D] bg-[#161B22] shadow-xl">
                <table className="w-full text-left text-xs sm:text-sm whitespace-nowrap">
                  <thead className="bg-[#0E1117] text-gray-400 uppercase font-mono tracking-wider border-b border-[#30363D]">
                    <tr>
                      <th className="py-3.5 px-4 font-bold text-white">球員名</th>
                      <th className="py-3.5 px-4 font-semibold text-center">累計在場時間</th>
                      <th className="py-3.5 px-4 font-semibold text-right text-[#FF9100]">累計 On_ORtg</th>
                      <th className="py-3.5 px-4 font-semibold text-right text-sky-400">累計 On_DRtg</th>
                      <th className="py-3.5 px-4 font-semibold text-right text-amber-300">累計 On_NetRtg</th>
                      <th className="py-3.5 px-4 font-semibold text-right text-gray-400">累計 Off_NetRtg</th>
                      <th className="py-3.5 px-4 font-black text-right text-[#00E676] bg-[#0E1117]">
                        賽季淨影響力 (Diff)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#21262D] font-mono">
                    {data?.on_off_players && data.on_off_players.length > 0 ? (
                      data.on_off_players.map((p) => (
                        <tr key={p.player_name} className="hover:bg-[#21262D]/60 transition-colors">
                          <td className="py-3.5 px-4 font-sans font-bold text-white">
                            <PlayerLink name={p.player_name} stage={stage} className="text-white hover:text-amber-400" />
                          </td>
                          <td className="py-3.5 px-4 text-center text-gray-300">{p.total_time}</td>
                          <td className="py-3.5 px-4 text-right text-[#FF9100]">{p.on_ortg}</td>
                          <td className="py-3.5 px-4 text-right text-sky-400">{p.on_drtg}</td>
                          <td className="py-3.5 px-4 text-right font-bold text-amber-300">{p.on_netrtg}</td>
                          <td className="py-3.5 px-4 text-right text-gray-400">{p.off_netrtg}</td>
                          <td
                            className={`py-3.5 px-4 text-right font-black ${
                              p.diff_netrtg > 0 ? 'text-[#00E676]' : 'text-red-400'
                            }`}
                          >
                            {p.diff_netrtg > 0 ? `+${p.diff_netrtg}` : p.diff_netrtg}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-gray-500 font-sans">
                          暫無此球隊 On/Off 數據
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. 最佳五人陣容組合 */}
          {activeSubTab === 'lineups' && (
            <div className="space-y-4">
              <h3 className="text-lg font-black text-white">
                {selectedTeam} • 最佳五人陣容組合效益榜
              </h3>
              <div className="overflow-x-auto rounded-2xl border border-[#30363D] bg-[#161B22] shadow-xl">
                <table className="w-full text-left text-xs sm:text-sm whitespace-nowrap">
                  <thead className="bg-[#0E1117] text-gray-400 uppercase font-mono tracking-wider border-b border-[#30363D]">
                    <tr>
                      <th className="py-3.5 px-4 font-bold text-white">五人陣容組合</th>
                      <th className="py-3.5 px-4 font-semibold text-center">賽季累計時間</th>
                      <th className="py-3.5 px-4 font-semibold text-right">累計正負值 (+/-)</th>
                      <th className="py-3.5 px-4 font-semibold text-right text-[#FF9100]">Lineup ORtg</th>
                      <th className="py-3.5 px-4 font-semibold text-right text-sky-400">Lineup DRtg</th>
                      <th className="py-3.5 px-4 font-black text-right text-[#00E676] bg-[#0E1117]">
                        Lineup NetRtg
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#21262D] font-mono">
                    {data?.five_man_lineups && data.five_man_lineups.length > 0 ? (
                      data.five_man_lineups.map((l, idx) => (
                        <tr key={idx} className="hover:bg-[#21262D]/60 transition-colors">
                          <td className="py-3.5 px-4 font-sans font-bold text-gray-200">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{l.lineup_name}</span>
                              {isSmallSample(l.total_time, l.possessions, l.total_seconds) && <SmallSampleBadge />}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center text-gray-300">{formatLineupTime(l.total_time, l.total_seconds)}</td>
                          <td
                            className={`py-3.5 px-4 text-right font-bold ${
                              l.plus_minus > 0 ? 'text-[#00E676]' : 'text-red-400'
                            }`}
                          >
                            {l.plus_minus > 0 ? `+${l.plus_minus}` : l.plus_minus}
                          </td>
                          <td className="py-3.5 px-4 text-right text-[#FF9100]">{l.ortg}</td>
                          <td className="py-3.5 px-4 text-right text-sky-400">{l.drtg}</td>
                          <td
                            className={`py-3.5 px-4 text-right font-black ${
                              l.netrtg > 0 ? 'text-[#00E676]' : 'text-red-400'
                            }`}
                          >
                            {l.netrtg > 0 ? `+${l.netrtg}` : l.netrtg}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-gray-500 font-sans">
                          暫無五人陣容紀錄
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. 完整進階 Box Score */}
          {activeSubTab === 'boxscore' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-lg font-black text-white">
                    {selectedTeam} • 階段完整球員數據庫 ({sortedPlayerList.length} 人)
                  </h3>
                  <span className="text-xs text-gray-400 font-mono">
                    {boxScoreView === 'traditional'
                      ? '基礎攻守：點擊任意表頭可快速排序，支援投射、籃板與攻守產出'
                      : '進階效率：點擊任意表頭可快速排序，含 eFG%、TS%、3PAr、FTr、USG% 與真實 +/-'}
                  </span>
                </div>

                <div className="inline-flex p-1 rounded-2xl bg-[#0E1117] border border-[#30363D] shadow-md shrink-0">
                  <button
                    onClick={() => setBoxScoreView('traditional')}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      boxScoreView === 'traditional'
                        ? 'bg-amber-500 text-black shadow-sm font-black'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>基礎數據 (Traditional)</span>
                  </button>

                  <button
                    onClick={() => setBoxScoreView('advanced')}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      boxScoreView === 'advanced'
                        ? 'bg-[#00E676] text-black shadow-sm font-black'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>進階數據 (Advanced)</span>
                  </button>
                </div>
              </div>

              {playersLoading ? (
                <div className="p-16 text-center text-gray-500 font-medium">
                  正在載入 {selectedTeam} 球員進階數據...
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-[#30363D] bg-[#161B22] shadow-2xl">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-[#0E1117] text-gray-400 uppercase font-mono tracking-wider border-b border-[#30363D]">
                      {boxScoreView === 'traditional' ? (
                        <tr>
                          {renderSortableHeader('player_name', '球員', 'sticky left-0 bg-[#0E1117] z-10 border-r border-[#21262D]/40', false)}
                          {renderSortableHeader('games_played', '場次')}
                          {renderSortableHeader('minutes', '時間')}
                          {renderSortableHeader('pts', 'PTS', 'text-right font-bold text-white')}
                          {renderSortableHeader('fgm', 'FG')}
                          {renderSortableHeader('fg_pct', 'FG%')}
                          {renderSortableHeader('tpm', '3P')}
                          {renderSortableHeader('tp_pct', '3P%')}
                          {renderSortableHeader('ftm', 'FT')}
                          {renderSortableHeader('ft_pct', 'FT%')}
                          {renderSortableHeader('orb', 'ORB')}
                          {renderSortableHeader('drb', 'DRB')}
                          {renderSortableHeader('reb', 'REB', 'text-right font-bold text-white')}
                          {renderSortableHeader('ast', 'AST', 'text-right font-bold text-sky-400')}
                          {renderSortableHeader('stl', 'STL')}
                          {renderSortableHeader('blk', 'BLK')}
                          {renderSortableHeader('tov', 'TOV')}
                          {renderSortableHeader('pf', 'PF')}
                          {renderSortableHeader('plus_minus', '+/-')}
                        </tr>
                      ) : (
                        <tr>
                          {renderSortableHeader('player_name', '球員', 'sticky left-0 bg-[#0E1117] z-10 border-r border-[#21262D]/40', false)}
                          {renderSortableHeader('games_played', '場次')}
                          {renderSortableHeader('minutes', '時間')}
                          {renderSortableHeader('pts', 'PTS', 'text-right font-bold text-white')}
                          {renderSortableHeader('efg_pct', 'eFG%', 'text-right text-[#FF9100]')}
                          {renderSortableHeader('ts_pct', 'TS%', 'text-right text-[#FF9100]')}
                          {renderSortableHeader('threepar', '3PAr')}
                          {renderSortableHeader('ftr', 'FTr')}
                          {renderSortableHeader('usg_pct', 'USG%', 'text-right text-[#00E676] font-black')}
                          {renderSortableHeader('gmsc', 'GmSc', 'text-right text-[#00E676]')}
                          {hasPlayerRtg && renderSortableHeader('ortg', 'ORtg', 'text-right text-sky-400')}
                          {hasPlayerRtg && renderSortableHeader('drtg', 'DRtg', 'text-right text-sky-400')}
                          {hasPlayerRtg && renderSortableHeader('netrtg', 'NetRtg', 'text-right text-amber-300 font-bold')}
                          {renderSortableHeader('plus_minus', '+/-')}
                        </tr>
                      )}
                    </thead>

                    <tbody className="divide-y divide-[#21262D] font-mono">
                      {sortedPlayerList.length === 0 ? (
                        <tr>
                          <td colSpan={20} className="py-12 text-center text-gray-500 font-sans">
                            暫無該球隊完整球員進階數據紀錄
                          </td>
                        </tr>
                      ) : (
                        sortedPlayerList.map((p, idx) => {
                          const fgStr = isNum(p.fgm) && isNum(p.fga) ? `${p.fgm}/${p.fga}` : '-';
                          const tpStr = isNum(p.tpm) && isNum(p.tpa) ? `${p.tpm}/${p.tpa}` : '-';
                          const ftStr = isNum(p.ftm) && isNum(p.fta) ? `${p.ftm}/${p.fta}` : '-';

                          const calcFgPct = p.fg_pct ?? (isNum(p.fgm) && isNum(p.fga) && p.fga > 0 ? (p.fgm / p.fga) * 100 : null);
                          const calcTpPct = p.tp_pct ?? (isNum(p.tpm) && isNum(p.tpa) && p.tpa > 0 ? (p.tpm / p.tpa) * 100 : null);
                          const calcFtPct = p.ft_pct ?? (isNum(p.ftm) && isNum(p.fta) && p.fta > 0 ? (p.ftm / p.fta) * 100 : null);

                          const calc3PAr = p.threepar ?? (isNum(p.tpa) && isNum(p.fga) && p.fga > 0 ? (p.tpa / p.fga) * 100 : null);
                          const calcFTr = p.ftr ?? (isNum(p.fta) && isNum(p.fga) && p.fga > 0 ? (p.fta / p.fga) * 100 : null);

                          const cleanName = (p.player_name || '').trim();
                          let finalUsg: number | string | undefined = authoritativeUsgMap.get(cleanName);

                          if (finalUsg === undefined && isNum(p.usg_pct) && p.usg_pct > 0 && p.usg_pct !== 20) {
                            finalUsg = p.usg_pct;
                          }

                          if (finalUsg === undefined) {
                            const pSec = parseSeconds(p.seconds, p.minutes);
                            const gp = p.games_played && p.games_played > 0 ? p.games_played : 1;
                            if (pSec > 0) {
                              const teamPoss = teamTotals.total_fga + 0.44 * teamTotals.total_fta + teamTotals.total_tov;
                              const playerTotalItems = ((p.fga || 0) + 0.44 * (p.fta || 0) + (p.tov || 0)) * gp;
                              const playerTotalSec = pSec * gp;
                              if (teamPoss > 0 && teamTotals.total_seconds > 0 && playerTotalSec > 0) {
                                finalUsg =
                                  ((playerTotalItems * (teamTotals.total_seconds / 5)) / (playerTotalSec * teamPoss)) * 100;
                              }
                            }
                          }

                          return (
                            <tr key={p.id ?? idx} className="hover:bg-[#21262D]/60 transition-colors group">
                              <td className="py-3 px-4 sticky left-0 bg-[#161B22] group-hover:bg-[#1C2128] font-sans font-bold text-white z-10 border-r border-[#21262D]/40">
                                <div className="flex items-center space-x-2">
                                  <span className="text-gray-500 text-xs font-mono w-6">
                                    {p.jersey_number ? `#${p.jersey_number}` : '-'}
                                  </span>
                                  <PlayerLink
                                    name={p.player_name}
                                    stage={stage}
                                    className="font-bold text-white group-hover:text-amber-400"
                                  />
                                  {p.identity?.includes('洋將') && (
                                    <span className="text-[10px] px-1 rounded bg-blue-500/20 text-blue-300">
                                      洋
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="py-3 px-3 text-right text-gray-300">{p.games_played ?? '-'}</td>
                              <td className="py-3 px-3 text-right text-gray-400">{p.minutes || '00:00'}</td>
                              <td className="py-3 px-3 text-right font-bold text-white">{p.pts ?? '-'}</td>

                              {boxScoreView === 'traditional' ? (
                                <>
                                  <td className="py-3 px-3 text-right text-gray-300">{fgStr}</td>
                                  <td className="py-3 px-3 text-right text-gray-300">{smartPctStr(calcFgPct)}</td>
                                  <td className="py-3 px-3 text-right text-gray-300">{tpStr}</td>
                                  <td className="py-3 px-3 text-right text-gray-300">{smartPctStr(calcTpPct)}</td>
                                  <td className="py-3 px-3 text-right text-gray-300">{ftStr}</td>
                                  <td className="py-3 px-3 text-right text-gray-300">{smartPctStr(calcFtPct)}</td>
                                  <td className="py-3 px-3 text-right text-gray-300">{p.orb ?? '-'}</td>
                                  <td className="py-3 px-3 text-right text-gray-300">{p.drb ?? '-'}</td>
                                  <td className="py-3 px-3 text-right font-bold text-white">{p.reb ?? '-'}</td>
                                  <td className="py-3 px-3 text-right text-sky-400 font-bold">{p.ast ?? '-'}</td>
                                  <td className="py-3 px-3 text-right text-gray-300">{p.stl ?? '-'}</td>
                                  <td className="py-3 px-3 text-right text-gray-300">{p.blk ?? '-'}</td>
                                  <td className="py-3 px-3 text-right text-gray-300">{p.tov ?? '-'}</td>
                                  <td className="py-3 px-3 text-right text-gray-300">{p.pf ?? '-'}</td>
                                  <td className={`py-3 px-3 text-right font-bold ${signColor(p.plus_minus)}`}>
                                    {signed(p.plus_minus, 1)}
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="py-3 px-3 text-right text-[#FF9100]">{smartPctStr(p.efg_pct)}</td>
                                  <td className="py-3 px-3 text-right text-[#FF9100]">{smartPctStr(p.ts_pct)}</td>
                                  <td className="py-3 px-3 text-right text-gray-300">{smartPctStr(calc3PAr)}</td>
                                  <td className="py-3 px-3 text-right text-gray-300">{smartPctStr(calcFTr)}</td>
                                  <td className="py-3 px-3 text-right text-[#00E676] font-bold">{smartPctStr(finalUsg)}</td>
                                  <td className="py-3 px-3 text-right text-[#00E676] font-bold">{fx(p.gmsc)}</td>
                                  {hasPlayerRtg && (
                                    <>
                                      <td className="py-3 px-3 text-right text-sky-400">{fx(p.ortg)}</td>
                                      <td className="py-3 px-3 text-right text-sky-400">{fx(p.drtg)}</td>
                                      <td className={`py-3 px-3 text-right font-bold ${signColor(p.netrtg)}`}>
                                        {signed(p.netrtg)}
                                      </td>
                                    </>
                                  )}
                                  <td className={`py-3 px-3 text-right font-bold ${signColor(p.plus_minus)}`}>
                                    {signed(p.plus_minus, 1)}
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PBPPage() {
  return (
    <Suspense fallback={<div className="p-16 text-center text-gray-500">正在載入 PBP 數據庫...</div>}>
      <PBPContent />
    </Suspense>
  );
}
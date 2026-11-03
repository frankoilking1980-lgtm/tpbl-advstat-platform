'use client';

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import useSWR from 'swr';
import { useSearchParams } from 'next/navigation';
import { useStage } from '@/context/StageContext';
import { fetcher } from '@/lib/api';
import { PlayerPortrait } from '@/components/PlayerPortrait';
import {
  Users,
  Swords,
  Trophy,
  Shield,
  Target,
  Flame,
  Award,
  Zap,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface PlayerInfo {
  player_name: string;
  team_name: string;
  jersey_number?: string;
  identity: string;
  position: string;
  games_played: number;
  mpg: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  tpg: number;
  plus_minus: number;
  usg_pct: number;
  ts_pct: number;
  efg_pct: number;
  gmsc: number;
  quadrant: string;
  quadrant_label: string;
  shot_chart_desc?: string;
  season_notes?: string;
}

interface PlayerCardResponse {
  player_info: PlayerInfo;
  radar: {
    scoring: number;
    shooting: number;
    playmaking: number;
    rebounding: number;
    defense: number;
    efficiency: number;
  };
}

interface PRBadgeDetail {
  val: number;
  pr: number;
}

interface PRPlayerItem {
  rank: number;
  id: number;
  name: string;
  team_name: string;
  jersey_number?: string;
  position: string;
  identity: string;
  games_played: number;
  mpg: number;
  badges: {
    [key: string]: PRBadgeDetail;
  };
}

interface PRStatsResponse {
  meta?: {
    stage: string;
    min_mpg: number;
    total_qualified: number;
  };
  players?: { [name: string]: PRPlayerItem };
  rankings?: PRPlayerItem[];
}

const STAGES = [
  '2026-2027 季前熱身賽',
  '2026-2027 例行賽',
  '2025-2026 冠軍賽',
  '2025-2026 季後賽',
  '2025-2026 季後挑戰賽',
  '2025-2026 例行賽',
  '2024-2025 例行賽',
];

const staticJsonFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`載入失敗: ${res.status}`);
  return res.json();
};

function PRTag({ pr }: { pr?: number }) {
  if (pr === undefined || pr === null) return null;
  let color = 'bg-slate-700/60 text-slate-300 border-slate-600/40';
  if (pr >= 90) color = 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/10';
  else if (pr >= 75) color = 'bg-blue-500/20 text-blue-300 border-blue-500/50';
  else if (pr >= 50) color = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';
  else if (pr < 25) color = 'bg-rose-500/15 text-rose-300 border-rose-500/30';

  return (
    <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border tracking-tight ${color}`}>
      PR {pr}
    </span>
  );
}

function PlayerCardsContent() {
  const { stage: globalStage } = useStage();
  const searchParams = useSearchParams();
  const queryPlayer = searchParams.get('player');

  const [stageA, setStageA] = useState<string>(globalStage || '2026-2027 例行賽');
  const [teamA, setTeamA] = useState<string>('新北國王');
  const [playerA, setPlayerA] = useState<string>('');

  const [stageB, setStageB] = useState<string>(globalStage || '2026-2027 例行賽');
  const [teamB, setTeamB] = useState<string>('臺北台新戰神');
  const [playerB, setPlayerB] = useState<string>('');

  // 1. 預設收起排行榜
  const [isRankingsOpen, setIsRankingsOpen] = useState(false);
  const [focusedPlayer, setFocusedPlayer] = useState<string | null>(null);

  const { data: prData } = useSWR<PRStatsResponse>('/player_pr_stats.json', staticJsonFetcher);

  const { data: listA } = useSWR<PlayerInfo[]>(
    `/api/players/advanced?stage=${encodeURIComponent(stageA)}`,
    fetcher
  );

  const { data: listB } = useSWR<PlayerInfo[]>(
    `/api/players/advanced?stage=${encodeURIComponent(stageB)}`,
    fetcher
  );

  const teamsA = useMemo(() => {
    if (!listA) return [];
    return Array.from(new Set(listA.map((p) => p.team_name).filter(Boolean))).sort();
  }, [listA]);

  const teamsB = useMemo(() => {
    if (!listB) return [];
    return Array.from(new Set(listB.map((p) => p.team_name).filter(Boolean))).sort();
  }, [listB]);

  const filteredPlayersA = useMemo(() => {
    if (!listA) return [];
    if (!teamA || teamA === 'ALL') return listA;
    return listA.filter((p) => (p.team_name || '').trim() === teamA.trim());
  }, [listA, teamA]);

  const filteredPlayersB = useMemo(() => {
    if (!listB) return [];
    if (!teamB || teamB === 'ALL') return listB;
    return listB.filter((p) => (p.team_name || '').trim() === teamB.trim());
  }, [listB, teamB]);

  useEffect(() => {
    if (teamsA.length > 0 && !teamsA.includes(teamA)) {
      setTeamA(teamsA[0]);
    }
  }, [teamsA]);

  useEffect(() => {
    if (!filteredPlayersA || filteredPlayersA.length === 0) return;
    if (queryPlayer && filteredPlayersA.some((p) => p.player_name === queryPlayer)) {
      setPlayerA(queryPlayer);
      return;
    }
    if (!playerA || !filteredPlayersA.some((p) => p.player_name === playerA)) {
      setPlayerA(filteredPlayersA[0].player_name);
    }
  }, [filteredPlayersA, queryPlayer]);

  useEffect(() => {
    if (teamsB.length > 0 && !teamsB.includes(teamB)) {
      setTeamB(teamsB[0]);
    }
  }, [teamsB]);

  useEffect(() => {
    if (!playerB) return;
    if (filteredPlayersB.length > 0 && !filteredPlayersB.some((p) => p.player_name === playerB)) {
      setPlayerB('');
    }
  }, [filteredPlayersB]);

  const { data: cardA } = useSWR<PlayerCardResponse>(
    playerA ? `/api/players/${encodeURIComponent(playerA)}/card?stage=${encodeURIComponent(stageA)}` : null,
    fetcher
  );

  const { data: cardB } = useSWR<PlayerCardResponse>(
    playerB ? `/api/players/${encodeURIComponent(playerB)}/card?stage=${encodeURIComponent(stageB)}` : null,
    fetcher
  );

  const playerAName = cardA?.player_info.player_name || playerA;
  const playerBName = cardB?.player_info.player_name || playerB;

  // 嚴格賽季比對校驗：只有當前選擇賽季與 PR 資料集對應賽季完全一致時才顯示 PR
  const currentPRStage = prData?.meta?.stage || '2026-2027 例行賽';

  const prPlayerA = useMemo(() => {
    if (stageA !== currentPRStage) return null;
    const dict = prData?.players || (prData as any);
    if (!dict || !playerAName) return null;
    return dict[playerAName.trim()] || null;
  }, [prData, playerAName, stageA, currentPRStage]);

  const prPlayerB = useMemo(() => {
    if (stageB !== currentPRStage) return null;
    const dict = prData?.players || (prData as any);
    if (!dict || !playerBName) return null;
    return dict[playerBName.trim()] || null;
  }, [prData, playerBName, stageB, currentPRStage]);

  const scrollToPlayerInRankings = (name: string) => {
    if (!name) return;
    setFocusedPlayer(name);
    setIsRankingsOpen(true);
    setTimeout(() => {
      const el = document.getElementById(`pr-row-${name}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
  };

  const handleSelectFromRankings = (p: PRPlayerItem) => {
    if (teamsA.includes(p.team_name)) {
      setTeamA(p.team_name);
    }
    setPlayerA(p.name);
    setFocusedPlayer(p.name);
    window.scrollTo({ top: 120, behavior: 'smooth' });
  };

  const radarDims = [
    { key: 'scoring', label: '得分 (Scoring)' },
    { key: 'shooting', label: '投射 (Shooting)' },
    { key: 'playmaking', label: '組織 (Playmaking)' },
    { key: 'rebounding', label: '籃板 (Rebounding)' },
    { key: 'defense', label: '防守 (Defense)' },
    { key: 'efficiency', label: '效率 (Efficiency)' },
  ];

  const center = 200;
  const radius = 145;

  const getCoordinates = (value: number, index: number) => {
    const angle = (Math.PI / 3) * index - Math.PI / 2;
    const r = (value / 100) * radius;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return { x, y };
  };

  const polyA = useMemo(() => {
    if (!cardA?.radar) return '';
    return radarDims
      .map((d, i) => {
        const val = cardA.radar[d.key as keyof typeof cardA.radar] || 50;
        const { x, y } = getCoordinates(val, i);
        return `${x},${y}`;
      })
      .join(' ');
  }, [cardA]);

  const polyB = useMemo(() => {
    if (!cardB?.radar || !playerB) return '';
    return radarDims
      .map((d, i) => {
        const val = cardB.radar[d.key as keyof typeof cardB.radar] || 50;
        const { x, y } = getCoordinates(val, i);
        return `${x},${y}`;
      })
      .join(' ');
  }, [cardB, playerB]);

  const compareList = [
    { label: '場均得分', valA: cardA?.player_info.ppg, valB: cardB?.player_info.ppg, prA: prPlayerA?.badges?.PTS?.pr, prB: prPlayerB?.badges?.PTS?.pr, format: (v: number) => v.toFixed(1) },
    { label: '真實命中率 (TS%)', valA: cardA?.player_info.ts_pct, valB: cardB?.player_info.ts_pct, prA: prPlayerA?.badges?.['TS%']?.pr, prB: prPlayerB?.badges?.['TS%']?.pr, format: (v: number) => `${v.toFixed(1)}%` },
    { label: '有效命中率 (eFG%)', valA: cardA?.player_info.efg_pct, valB: cardB?.player_info.efg_pct, prA: prPlayerA?.badges?.['eFG%']?.pr, prB: prPlayerB?.badges?.['eFG%']?.pr, format: (v: number) => `${v.toFixed(1)}%` },
    { label: '球權使用率 (USG%)', valA: cardA?.player_info.usg_pct, valB: cardB?.player_info.usg_pct, prA: prPlayerA?.badges?.['USG%']?.pr, prB: prPlayerB?.badges?.['USG%']?.pr, format: (v: number) => `${v.toFixed(1)}%` },
    { label: '場均籃板 (RPG)', valA: cardA?.player_info.rpg, valB: cardB?.player_info.rpg, prA: prPlayerA?.badges?.REB?.pr, prB: prPlayerB?.badges?.REB?.pr, format: (v: number) => v.toFixed(1) },
    { label: '場均助攻 (APG)', valA: cardA?.player_info.apg, valB: cardB?.player_info.apg, prA: prPlayerA?.badges?.AST?.pr, prB: prPlayerB?.badges?.AST?.pr, format: (v: number) => v.toFixed(1) },
    { label: '場均抄截 (SPG)', valA: cardA?.player_info.spg, valB: cardB?.player_info.spg, prA: prPlayerA?.badges?.STL?.pr, prB: prPlayerB?.badges?.STL?.pr, format: (v: number) => v.toFixed(1) },
    { label: '場均阻攻 (BPG)', valA: cardA?.player_info.bpg, valB: cardB?.player_info.bpg, prA: prPlayerA?.badges?.BLK?.pr, prB: prPlayerB?.badges?.BLK?.pr, format: (v: number) => v.toFixed(1) },
    { label: '失誤次數 (TPG)', valA: cardA?.player_info.tpg, valB: cardB?.player_info.tpg, format: (v: number) => v.toFixed(1), lowerIsBetter: true },
    { label: '單場表現 (GmSc)', valA: cardA?.player_info.gmsc, valB: cardB?.player_info.gmsc, prA: prPlayerA?.badges?.GmSC?.pr, prB: prPlayerB?.badges?.GmSC?.pr, format: (v: number) => v.toFixed(1) },
  ];

  const rankingList: PRPlayerItem[] = useMemo(() => {
    if (prData?.rankings && prData.rankings.length > 0) {
      return prData.rankings;
    }
    const dict = prData?.players || (prData as any);
    if (!dict) return [];
    return Object.keys(dict).map((name, idx) => ({
      rank: idx + 1,
      name,
      ...dict[name],
    }));
  }, [prData]);

  return (
    <div className="space-y-10 pb-16">
      {/* 標題與條件選擇區 */}
      <div className="relative overflow-hidden rounded-3xl border border-[#30363D] bg-[#161B22] p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <span className="px-3 py-1 rounded-full bg-[#FF9100]/15 text-[#FF9100] text-xs font-black uppercase tracking-wider border border-[#FF9100]/30">
              跨賽季獨立對比
            </span>
            <span className="text-xs text-gray-400 font-medium">六維戰力雷達與 Percentile Ranking</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            🃏 球員戰力卡與雙雄正面對決 (Head-to-Head)
          </h1>
          <p className="text-gray-300 text-sm max-w-3xl leading-relaxed">
            支援跨賽季、跨隊伍任意球員比對。點擊下方表格任一球員可切換為分析對象。
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-[#0E1117] p-4 sm:p-5 rounded-2xl border border-[#30363D]">
          {/* 球員 A 選擇區 */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF9100]" />
              <span className="text-xs font-black text-[#FF9100] uppercase tracking-wider">
                球員 A 條件 (賽季 ➔ 球隊 ➔ 球員)
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                value={stageA}
                onChange={(e) => setStageA(e.target.value)}
                className="bg-[#161B22] border border-[#30363D] text-white text-xs font-bold py-2 px-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#FF9100]"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <select
                value={teamA}
                onChange={(e) => setTeamA(e.target.value)}
                className="bg-[#161B22] border border-[#30363D] text-white text-xs font-bold py-2 px-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#FF9100]"
              >
                {teamsA.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <select
                value={playerA}
                onChange={(e) => setPlayerA(e.target.value)}
                className="bg-[#161B22] border border-[#30363D] text-white text-xs font-bold py-2 px-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#FF9100]"
              >
                {filteredPlayersA.map((p, idx) => (
                  <option key={`optA-${stageA}-${p.team_name}-${p.player_name}-${idx}`} value={p.player_name}>
                    {p.player_name} ({p.team_name})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 球員 B 選擇區 */}
          <div className="space-y-2 lg:border-l lg:border-[#30363D] lg:pl-6">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#00E676]" />
              <span className="text-xs font-black text-[#00E676] uppercase tracking-wider">
                球員 B 條件 (可留空單人展示)
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                value={stageB}
                onChange={(e) => setStageB(e.target.value)}
                className="bg-[#161B22] border border-[#30363D] text-white text-xs font-bold py-2 px-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#00E676]"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <select
                value={teamB}
                onChange={(e) => setTeamB(e.target.value)}
                className="bg-[#161B22] border border-[#30363D] text-white text-xs font-bold py-2 px-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#00E676]"
              >
                {teamsB.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <select
                value={playerB}
                onChange={(e) => setPlayerB(e.target.value)}
                className="bg-[#161B22] border border-[#30363D] text-white text-xs font-bold py-2 px-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#00E676]"
              >
                <option value="">-- 不進行對比 (單人模式) --</option>
                {filteredPlayersB.map((p, idx) => (
                  <option key={`optB-${stageB}-${p.team_name}-${p.player_name}-${idx}`} value={p.player_name}>
                    {p.player_name} ({p.team_name})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 戰力卡與雷達圖展示區 */}
      <div className="w-full">
        {playerB ? (
          /* ========== 雙人對決模式 ========== */
          <div className="flex flex-col xl:flex-row items-center xl:items-stretch justify-between gap-5">
            {/* 1. 最左側：球員 A 肖像 (帶入 stageA 嚴格校驗) */}
            <div
              className="hidden xl:flex items-center justify-center flex-shrink-0 cursor-pointer"
              onClick={() => scrollToPlayerInRankings(playerAName)}
            >
              <PlayerPortrait playerName={playerAName} stage={stageA} />
            </div>

            {/* 2. 球員 A 數據戰力卡 */}
            <div className="w-full xl:w-72 p-7 rounded-3xl border border-[#FF9100]/40 bg-[#161B22] shadow-xl flex flex-col justify-between">
              <div className="space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-[#21262D]">
                  <span className="px-3 py-1 rounded-xl bg-[#FF9100]/20 text-[#FF9100] font-black text-xs tracking-wider">
                    球員 A
                  </span>
                  <span className="text-sm font-mono text-gray-400 font-bold whitespace-nowrap">
                    #{cardA?.player_info.jersey_number || '0'} • {cardA?.player_info.position}
                  </span>
                </div>

                <div>
                  <div className="text-xs font-mono text-amber-400 font-bold mb-1">
                    [{stageA}]
                  </div>
                  <h3
                    onClick={() => scrollToPlayerInRankings(playerAName)}
                    className="text-2xl font-black text-white tracking-tight cursor-pointer hover:text-[#FF9100] transition-colors"
                  >
                    {playerAName}
                  </h3>
                  <p className="text-xs text-gray-400 font-medium pt-1">
                    {cardA?.player_info.team_name} • {cardA?.player_info.identity}
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-xs sm:text-sm font-mono pt-4">
                <div className="flex justify-between items-center py-1.5 border-b border-[#21262D]">
                  <span className="text-gray-400 font-sans whitespace-nowrap">場均時間</span>
                  <span className="text-white font-bold whitespace-nowrap">{cardA?.player_info.mpg ?? '-'} 分</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-[#21262D]">
                  <span className="text-gray-400 font-sans whitespace-nowrap">場均得分</span>
                  <div className="flex items-center">
                    <span className="text-[#FF9100] font-bold text-base whitespace-nowrap">{cardA?.player_info.ppg ?? '-'}</span>
                    <PRTag pr={prPlayerA?.badges?.PTS?.pr} />
                  </div>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-[#21262D]">
                  <span className="text-gray-400 font-sans whitespace-nowrap">真實命中率 TS%</span>
                  <div className="flex items-center">
                    <span className="text-amber-300 font-bold whitespace-nowrap">
                      {cardA?.player_info.ts_pct !== undefined ? `${cardA.player_info.ts_pct}%` : '-'}
                    </span>
                    <PRTag pr={prPlayerA?.badges?.['TS%']?.pr} />
                  </div>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-gray-400 font-sans whitespace-nowrap">單場表現 GmSc</span>
                  <div className="flex items-center">
                    <span className="text-white font-bold text-base whitespace-nowrap">{cardA?.player_info.gmsc ?? '-'}</span>
                    <PRTag pr={prPlayerA?.badges?.GmSC?.pr} />
                  </div>
                </div>
              </div>
            </div>

            {/* 3. 中間六維雷達圖 */}
            <div className="flex-1 w-full p-6 sm:p-7 rounded-3xl border border-[#30363D] bg-[#161B22] shadow-2xl flex flex-col justify-between items-center min-h-[420px]">
              <div className="w-full flex items-center justify-center space-x-6 text-xs sm:text-sm font-bold pb-2">
                <div className="flex items-center space-x-1.5 text-[#FF9100] whitespace-nowrap">
                  <span className="w-3 h-3 rounded-full bg-[#FF9100] flex-shrink-0" />
                  <span className="font-black text-sm">{playerAName}</span>
                  <span className="text-[11px] opacity-75 font-mono">({stageA.slice(2, 9)})</span>
                </div>

                <span className="text-gray-500 font-mono font-bold text-xs">VS</span>

                <div className="flex items-center space-x-1.5 text-[#00E676] whitespace-nowrap">
                  <span className="w-3 h-3 rounded-full bg-[#00E676] flex-shrink-0" />
                  <span className="font-black text-sm">{playerBName}</span>
                  <span className="text-[11px] opacity-75 font-mono">({stageB.slice(2, 9)})</span>
                </div>
              </div>

              <div className="w-full flex-1 flex items-center justify-center py-2">
                <svg viewBox="0 0 400 400" className="w-full max-w-[340px] sm:max-w-[380px] h-auto select-none">
                  {[0.25, 0.5, 0.75, 1.0].map((scale) => {
                    const points = radarDims
                      .map((_, i) => {
                        const angle = (Math.PI / 3) * i - Math.PI / 2;
                        const r = radius * scale;
                        return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
                      })
                      .join(' ');
                    return (
                      <polygon
                        key={scale}
                        points={points}
                        fill="none"
                        stroke="#30363D"
                        strokeWidth="1"
                        strokeDasharray={scale === 1 ? 'none' : '3 3'}
                      />
                    );
                  })}

                  {radarDims.map((_, i) => {
                    const angle = (Math.PI / 3) * i - Math.PI / 2;
                    const x = center + radius * Math.cos(angle);
                    const y = center + radius * Math.sin(angle);
                    return (
                      <line
                        key={i}
                        x1={center}
                        y1={center}
                        x2={x}
                        y2={y}
                        stroke="#30363D"
                        strokeWidth="1"
                      />
                    );
                  })}

                  {polyA && (
                    <polygon
                      points={polyA}
                      fill="#FF9100"
                      fillOpacity="0.32"
                      stroke="#FF9100"
                      strokeWidth="2.5"
                    />
                  )}

                  {polyB && (
                    <polygon
                      points={polyB}
                      fill="#00E676"
                      fillOpacity="0.32"
                      stroke="#00E676"
                      strokeWidth="2.5"
                    />
                  )}

                  {radarDims.map((d, i) => {
                    const angle = (Math.PI / 3) * i - Math.PI / 2;
                    const lx = center + (radius + 25) * Math.cos(angle);
                    const ly = center + (radius + 18) * Math.sin(angle);
                    return (
                      <text
                        key={d.key}
                        x={lx}
                        y={ly + 4}
                        fill="#94A3B8"
                        fontSize="12"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {d.label.split(' ')[0]}
                      </text>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* 4. 球員 B 數據戰力卡 */}
            <div className="w-full xl:w-72 p-7 rounded-3xl border border-[#00E676]/40 bg-[#161B22] shadow-xl flex flex-col justify-between">
              <div className="space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-[#21262D]">
                  <span className="px-3 py-1 rounded-xl bg-[#00E676]/20 text-[#00E676] font-black text-xs tracking-wider">
                    球員 B
                  </span>
                  <span className="text-sm font-mono text-gray-400 font-bold whitespace-nowrap">
                    #{cardB?.player_info.jersey_number || '0'} • {cardB?.player_info.position}
                  </span>
                </div>

                <div>
                  <div className="text-xs font-mono text-emerald-400 font-bold mb-1">
                    [{stageB}]
                  </div>
                  <h3
                    onClick={() => scrollToPlayerInRankings(playerBName)}
                    className="text-2xl font-black text-white tracking-tight cursor-pointer hover:text-[#00E676] transition-colors"
                  >
                    {playerBName}
                  </h3>
                  <p className="text-xs text-gray-400 font-medium pt-1">
                    {cardB?.player_info.team_name} • {cardB?.player_info.identity}
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-xs sm:text-sm font-mono pt-4">
                <div className="flex justify-between items-center py-1.5 border-b border-[#21262D]">
                  <span className="text-gray-400 font-sans whitespace-nowrap">場均時間</span>
                  <span className="text-white font-bold whitespace-nowrap">{cardB?.player_info.mpg ?? '-'} 分</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-[#21262D]">
                  <span className="text-gray-400 font-sans whitespace-nowrap">場均得分</span>
                  <div className="flex items-center">
                    <span className="text-[#00E676] font-bold text-base whitespace-nowrap">{cardB?.player_info.ppg ?? '-'}</span>
                    <PRTag pr={prPlayerB?.badges?.PTS?.pr} />
                  </div>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-[#21262D]">
                  <span className="text-gray-400 font-sans whitespace-nowrap">真實命中率 TS%</span>
                  <div className="flex items-center">
                    <span className="text-emerald-300 font-bold whitespace-nowrap">
                      {cardB?.player_info.ts_pct !== undefined ? `${cardB.player_info.ts_pct}%` : '-'}
                    </span>
                    <PRTag pr={prPlayerB?.badges?.['TS%']?.pr} />
                  </div>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-gray-400 font-sans whitespace-nowrap">單場表現 GmSc</span>
                  <div className="flex items-center">
                    <span className="text-white font-bold text-base whitespace-nowrap">{cardB?.player_info.gmsc ?? '-'}</span>
                    <PRTag pr={prPlayerB?.badges?.GmSC?.pr} />
                  </div>
                </div>
              </div>
            </div>

            {/* 5. 最右側：球員 B 肖像 (帶入 stageB 嚴格校驗) */}
            <div
              className="hidden xl:flex items-center justify-center flex-shrink-0 cursor-pointer"
              onClick={() => scrollToPlayerInRankings(playerBName)}
            >
              <PlayerPortrait playerName={playerBName} stage={stageB} isRightSide />
            </div>
          </div>
        ) : (
          /* ========== 單人模式 ========== */
          <div className="flex flex-col lg:flex-row items-center lg:items-stretch justify-center gap-8 max-w-6xl mx-auto">
            {/* 1. 球員肖像 (帶入 stageA 嚴格校驗) */}
            <div
              className="flex-shrink-0 flex items-center justify-center cursor-pointer"
              onClick={() => scrollToPlayerInRankings(playerAName)}
            >
              <PlayerPortrait playerName={playerAName} stage={stageA} />
            </div>

            {/* 2. 球員檔案卡片 */}
            <div className="w-full lg:w-80 p-7 rounded-3xl border border-[#FF9100]/40 bg-[#161B22] shadow-xl flex flex-col justify-between">
              <div className="space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-[#21262D]">
                  <span className="px-3 py-1 rounded-xl bg-[#FF9100]/20 text-[#FF9100] font-black text-xs tracking-wider">
                    選手檔案
                  </span>
                  <span className="text-sm font-mono text-gray-400 font-bold whitespace-nowrap">
                    #{cardA?.player_info.jersey_number || '0'} • {cardA?.player_info.position}
                  </span>
                </div>

                <div>
                  <div className="text-xs font-mono text-amber-400 font-bold mb-1">
                    [{stageA}]
                  </div>
                  <h3
                    onClick={() => scrollToPlayerInRankings(playerAName)}
                    className="text-3xl font-black text-white tracking-tight cursor-pointer hover:text-[#FF9100] transition-colors"
                  >
                    {playerAName}
                  </h3>
                  <p className="text-xs text-gray-400 font-medium pt-1">
                    {cardA?.player_info.team_name} • {cardA?.player_info.identity}
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-xs sm:text-sm font-mono pt-4">
                <div className="flex justify-between items-center py-1.5 border-b border-[#21262D]">
                  <span className="text-gray-400 font-sans whitespace-nowrap">場均時間</span>
                  <span className="text-white font-bold whitespace-nowrap">{cardA?.player_info.mpg ?? '-'} 分</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-[#21262D]">
                  <span className="text-gray-400 font-sans whitespace-nowrap">場均得分</span>
                  <div className="flex items-center">
                    <span className="text-[#FF9100] font-bold text-base whitespace-nowrap">{cardA?.player_info.ppg ?? '-'}</span>
                    <PRTag pr={prPlayerA?.badges?.PTS?.pr} />
                  </div>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-[#21262D]">
                  <span className="text-gray-400 font-sans whitespace-nowrap">真實命中率 TS%</span>
                  <div className="flex items-center">
                    <span className="text-amber-300 font-bold whitespace-nowrap">
                      {cardA?.player_info.ts_pct !== undefined ? `${cardA.player_info.ts_pct}%` : '-'}
                    </span>
                    <PRTag pr={prPlayerA?.badges?.['TS%']?.pr} />
                  </div>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-gray-400 font-sans whitespace-nowrap">單場表現 GmSc</span>
                  <div className="flex items-center">
                    <span className="text-white font-bold text-base whitespace-nowrap">{cardA?.player_info.gmsc ?? '-'}</span>
                    <PRTag pr={prPlayerA?.badges?.GmSC?.pr} />
                  </div>
                </div>
              </div>
            </div>

            {/* 3. 六維戰力雷達圖 */}
            <div className="flex-1 w-full max-w-xl p-6 sm:p-7 rounded-3xl border border-[#30363D] bg-[#161B22] shadow-2xl flex flex-col justify-between items-center min-h-[420px]">
              <div className="flex items-center space-x-2 text-xs sm:text-sm font-bold pb-2 text-[#FF9100] whitespace-nowrap">
                <span className="w-3 h-3 rounded-full bg-[#FF9100]" />
                <span className="font-black text-sm">{playerAName}</span>
                <span className="text-[11px] opacity-75 font-mono">({stageA.slice(2, 9)})</span>
              </div>

              <div className="w-full flex-1 flex items-center justify-center py-2">
                <svg viewBox="0 0 400 400" className="w-full max-w-[380px] h-auto select-none">
                  {[0.25, 0.5, 0.75, 1.0].map((scale) => {
                    const points = radarDims
                      .map((_, i) => {
                        const angle = (Math.PI / 3) * i - Math.PI / 2;
                        const r = radius * scale;
                        return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
                      })
                      .join(' ');
                    return (
                      <polygon
                        key={scale}
                        points={points}
                        fill="none"
                        stroke="#30363D"
                        strokeWidth="1"
                        strokeDasharray={scale === 1 ? 'none' : '3 3'}
                      />
                    );
                  })}

                  {radarDims.map((_, i) => {
                    const angle = (Math.PI / 3) * i - Math.PI / 2;
                    const x = center + radius * Math.cos(angle);
                    const y = center + radius * Math.sin(angle);
                    return (
                      <line
                        key={i}
                        x1={center}
                        y1={center}
                        x2={x}
                        y2={y}
                        stroke="#30363D"
                        strokeWidth="1"
                      />
                    );
                  })}

                  {polyA && (
                    <polygon
                      points={polyA}
                      fill="#FF9100"
                      fillOpacity="0.32"
                      stroke="#FF9100"
                      strokeWidth="2.5"
                    />
                  )}

                  {radarDims.map((d, i) => {
                    const angle = (Math.PI / 3) * i - Math.PI / 2;
                    const lx = center + (radius + 25) * Math.cos(angle);
                    const ly = center + (radius + 18) * Math.sin(angle);
                    return (
                      <text
                        key={d.key}
                        x={lx}
                        y={ly + 4}
                        fill="#94A3B8"
                        fontSize="12"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {d.label.split(' ')[0]}
                      </text>
                    );
                  })}
                </svg>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tale of the Tape 細項表格 */}
      <section className="space-y-4">
        <div className={`${playerB ? 'w-full' : 'max-w-2xl mx-auto'} flex items-center justify-between`}>
          <h3 className="text-xl font-black text-white flex items-center space-x-2">
            <Swords className="w-5 h-5 text-[#FF9100]" />
            <span>
              {playerB
                ? 'Tale of the Tape • 雙雄正面對決數據表'
                : `${playerAName} • 進階攻守數據細項`}
            </span>
          </h3>
          {!playerB && (
            <span className="text-xs text-gray-400 font-mono">
              {stageA}
            </span>
          )}
        </div>

        {playerB ? (
          <div className="overflow-x-auto rounded-3xl border border-[#30363D] bg-[#161B22] shadow-xl">
            <table className="w-full text-center text-xs sm:text-sm whitespace-nowrap">
              <thead className="bg-[#0E1117] text-gray-400 uppercase font-mono tracking-wider border-b border-[#30363D]">
                <tr>
                  <th className="py-3.5 px-6 font-bold text-[#FF9100] text-base w-2/5">
                    {playerAName} ({stageA.slice(2, 9)})
                  </th>
                  <th className="py-3.5 px-4 font-bold text-white text-xs w-1/5">指標項目</th>
                  <th className="py-3.5 px-6 font-bold text-[#00E676] text-base w-2/5">
                    {playerBName} ({stageB.slice(2, 9)})
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262D] font-mono">
                {compareList.map((item, idx) => {
                  const a = item.valA ?? 0;
                  const b = item.valB ?? 0;
                  const aWins = item.lowerIsBetter ? a < b : a > b;
                  const bWins = item.lowerIsBetter ? b < a : b > a;

                  return (
                    <tr key={idx} className="hover:bg-[#21262D]/60 transition-colors">
                      <td
                        className={`py-3.5 px-6 text-right font-black ${
                          aWins ? 'text-[#FF9100] bg-[#FF9100]/10 text-base' : 'text-gray-300'
                        }`}
                      >
                        <span className="inline-flex items-center">
                          {item.valA !== undefined ? item.format(item.valA) : '-'}
                          <PRTag pr={item.prA} />
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-gray-400 font-sans font-bold text-xs">
                        {item.label}
                      </td>
                      <td
                        className={`py-3.5 px-6 text-left font-black ${
                          bWins ? 'text-[#00E676] bg-[#00E676]/10 text-base' : 'text-gray-300'
                        }`}
                      >
                        <span className="inline-flex items-center">
                          {item.valB !== undefined ? item.format(item.valB) : '-'}
                          <PRTag pr={item.prB} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto rounded-3xl border border-[#30363D] bg-[#161B22] shadow-2xl overflow-hidden">
            <div className="bg-[#0E1117] py-3.5 px-6 border-b border-[#30363D] flex justify-between items-center">
              <span className="text-sm font-black text-white">指標項目</span>
              <span className="text-sm font-black text-[#FF9100] font-mono">
                {playerAName} 數據表現
              </span>
            </div>
            <table className="w-full text-left text-sm whitespace-nowrap">
              <tbody className="divide-y divide-[#21262D]">
                {compareList.map((item, idx) => (
                  <tr key={idx} className="hover:bg-[#21262D]/40 transition-colors">
                    <td className="py-3 px-6 text-gray-300 font-medium">
                      {item.label}
                    </td>
                    <td className="py-3 px-6 text-right font-mono font-black text-white text-base">
                      <div className="inline-flex items-center justify-end">
                        {item.valA !== undefined ? item.format(item.valA) : '-'}
                        <PRTag pr={item.prA} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 質化短評對比 */}
      <section className={`grid grid-cols-1 ${playerB ? 'md:grid-cols-2' : 'md:grid-cols-2 max-w-4xl mx-auto'} gap-6 pt-2`}>
        <div className="p-6 rounded-3xl border border-[#FF9100]/30 bg-[#161B22] shadow-xl space-y-4">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-[#FF9100]" />
            <h4 className="text-base font-black text-white">
              {playerAName} • 體系定位與球探特徵 ({stageA})
            </h4>
          </div>

          <div className="space-y-3 text-xs sm:text-sm">
            <div className="p-4 rounded-2xl bg-[#0E1117] border border-[#21262D]">
              <span className="text-[#FF9100] font-bold block mb-1">🎯 投籃熱區與進攻特徵</span>
              <p className="text-gray-300 whitespace-normal break-words leading-relaxed">
                {cardA?.player_info.shot_chart_desc || '尚無該球員熱區詳細記錄'}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-[#0E1117] border border-[#21262D]">
              <span className="text-gray-400 font-bold block mb-1">📝 賽季表現重點與備註</span>
              <p className="text-gray-300 whitespace-normal break-words leading-relaxed">
                {cardA?.player_info.season_notes || '尚無表現重點記錄'}
              </p>
            </div>
          </div>
        </div>

        {playerB ? (
          <div className="p-6 rounded-3xl border border-[#00E676]/30 bg-[#161B22] shadow-xl space-y-4">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-[#00E676]" />
              <h4 className="text-base font-black text-white">
                {playerBName} • 體系定位與球探特徵 ({stageB})
              </h4>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div className="p-4 rounded-2xl bg-[#0E1117] border border-[#21262D]">
                <span className="text-[#00E676] font-bold block mb-1">🎯 投籃熱區與進攻特徵</span>
                <p className="text-gray-300 whitespace-normal break-words leading-relaxed">
                  {cardB?.player_info.shot_chart_desc || '尚無該球員熱區詳細記錄'}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-[#0E1117] border border-[#21262D]">
                <span className="text-gray-400 font-bold block mb-1">📝 賽季表現重點與備註</span>
                <p className="text-gray-300 whitespace-normal break-words leading-relaxed">
                  {cardB?.player_info.season_notes || '尚無表現重點記錄'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-3xl border border-[#30363D] bg-[#161B22] shadow-xl space-y-4 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-sky-400" />
                <h4 className="text-base font-black text-white">
                  四象限戰術定位評析
                </h4>
              </div>
              <div className="p-4 rounded-2xl bg-[#0E1117] border border-[#21262D]">
                <span className="text-sky-400 font-bold block mb-1">
                  {cardA?.player_info.quadrant_label || '象限分群'}
                </span>
                <p className="text-xs text-gray-400 leading-relaxed">
                  基於 USG% (球權使用率 {cardA?.player_info.usg_pct}%) 與 TS% (真實命中率 {cardA?.player_info.ts_pct}%) 的雙維度綜合判定。
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 leading-relaxed">
              💡 提示：若想觀察球員的成長曲線或同位置競爭力，可直接在上方「球員 B 條件」選取對手或其過去賽季進行跨季對比。
            </div>
          </div>
        )}
      </section>

      {/* ========== 最底部：全聯盟球員 PR 排行榜 (預設收合 + 凍結表頭) ========== */}
      <section className="pt-8">
        <div className="rounded-3xl border border-[#30363D] bg-[#161B22] shadow-2xl overflow-hidden transition-all">
          {/* 折疊切換條 */}
          <button
            onClick={() => setIsRankingsOpen(!isRankingsOpen)}
            className="w-full px-6 py-5 flex items-center justify-between bg-[#0E1117] hover:bg-[#12161F] transition-colors border-b border-[#30363D]"
          >
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-[#FF9100] animate-pulse" />
              <h3 className="text-lg font-black text-white tracking-wide flex items-center gap-2">
                <span>全聯盟輪替球員 PR 排名總表 (Box Score)</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/10 text-gray-300 font-mono font-normal">
                  {rankingList.length > 0 ? `${rankingList.length} 位達標球員` : '載入中...'}
                </span>
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white transition-colors">
              <span>{isRankingsOpen ? '收合總表' : '展開完整列表 (點選球員可置頂分析)'}</span>
              {isRankingsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {/* 總表本體：內部可滑動，表頭凍結 (sticky top-0) */}
          {isRankingsOpen && (
            <div className="p-4 sm:p-6 overflow-x-auto max-h-[600px] overflow-y-auto relative">
              <div className="text-xs text-gray-400 pb-3 font-mono flex items-center justify-between">
                <span>篩選門檻：按各隊進度出賽達標 且 場均時間 ≥ {prData?.meta?.min_mpg || 8.0} 分鐘</span>
                <span className="text-amber-400/80">依綜合戰力 GmSc 降序排列 • 點擊任一行可切換為球員 A</span>
              </div>
              <table className="w-full text-left text-xs font-mono border-collapse whitespace-nowrap">
                {/* 凍結欄位列 (Sticky Header) - 採用實心深底 #0E1117，避免透底，高對比亮白與金黃色 */}
                <thead className="sticky top-0 z-30 bg-[#0E1117] border-b-2 border-[#30363D] shadow-lg">
                  <tr className="text-xs font-black tracking-wider uppercase">
                    <th className="py-3.5 px-3 text-slate-400">#</th>
                    <th className="py-3.5 px-3 font-sans text-white">球員</th>
                    <th className="py-3.5 px-3 font-sans text-slate-200">球隊</th>
                    <th className="py-3.5 px-3 text-center text-amber-400 font-extrabold">出賽</th>
                    <th className="py-3.5 px-3 text-center text-slate-200 font-extrabold">場均時間</th>
                    <th className="py-3.5 px-3 text-right text-white font-black">得分 (PTS)</th>
                    <th className="py-3.5 px-3 text-right text-white font-black">籃板 (REB)</th>
                    <th className="py-3.5 px-3 text-right text-white font-black">助攻 (AST)</th>
                    <th className="py-3.5 px-3 text-right text-amber-300 font-black">真實命中 (TS%)</th>
                    <th className="py-3.5 px-3 text-right text-[#FF9100] font-black">單場表現 (GmSc)</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#21262D]">
                  {rankingList.map((p) => {
                    const isTarget = focusedPlayer === p.name || playerAName === p.name;
                    return (
                      <tr
                        key={`pr-row-${p.name}`}
                        id={`pr-row-${p.name}`}
                        onClick={() => handleSelectFromRankings(p)}
                        className={`transition-colors cursor-pointer group ${
                          isTarget
                            ? 'bg-[#FF9100]/20 hover:bg-[#FF9100]/25'
                            : 'hover:bg-white/[0.04]'
                        }`}
                      >
                        <td className="py-3 px-3 text-gray-500 group-hover:text-amber-400 font-bold">
                          {p.rank}
                        </td>
                        <td className="py-3 px-3 font-sans">
                          <span className="font-bold text-white text-sm group-hover:text-[#FF9100] transition-colors">
                            {p.name}
                          </span>
                          {p.jersey_number && (
                            <span className="ml-1.5 text-xs text-gray-500 font-mono">
                              #{p.jersey_number}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-sans text-gray-400">{p.team_name}</td>
                        <td className="py-3 px-3 text-center text-gray-300">{p.games_played}</td>
                        <td className="py-3 px-3 text-center text-gray-300">{p.mpg} 分</td>

                        {/* 得分 */}
                        <td className="py-3 px-3 text-right">
                          <span className="text-white font-bold">{p.badges?.PTS?.val ?? '-'}</span>
                          <PRTag pr={p.badges?.PTS?.pr} />
                        </td>

                        {/* 籃板 */}
                        <td className="py-3 px-3 text-right">
                          <span className="text-white font-bold">{p.badges?.REB?.val ?? '-'}</span>
                          <PRTag pr={p.badges?.REB?.pr} />
                        </td>

                        {/* 助攻 */}
                        <td className="py-3 px-3 text-right">
                          <span className="text-white font-bold">{p.badges?.AST?.val ?? '-'}</span>
                          <PRTag pr={p.badges?.AST?.pr} />
                        </td>

                        {/* TS% */}
                        <td className="py-3 px-3 text-right">
                          <span className="text-amber-300 font-bold">{p.badges?.['TS%']?.val ?? '-'}%</span>
                          <PRTag pr={p.badges?.['TS%']?.pr} />
                        </td>

                        {/* GmSc */}
                        <td className="py-3 px-3 text-right">
                          <span className="text-[#FF9100] font-black text-sm">{p.badges?.GmSC?.val ?? '-'}</span>
                          <PRTag pr={p.badges?.GmSC?.pr} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default function PlayerCardsPage() {
  return (
    <Suspense fallback={<div className="p-16 text-center text-gray-500">正在加載球員戰力卡...</div>}>
      <PlayerCardsContent />
    </Suspense>
  );
}
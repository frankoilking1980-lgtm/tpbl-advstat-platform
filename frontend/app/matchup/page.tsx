'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { HelpCircle, History, RotateCcw, Camera } from 'lucide-react';
import MatchupShareCardModal from '@/components/MatchupShareCardModal';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Player {
  player_name: string;
  team_name: string;
  jersey_number: string;
  position: string;
  identity: string;
  games_played: number;
  mpg: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  efg_pct: number;
  ts_pct: number;
  usg_pct: number;
  gmsc: number;
}

interface TeamLineupState {
  starters: (Player | null)[];
  bench: Player[];
}

const TEAMS = [
  '新北國王',
  '臺北台新戰神',
  '新北中信特攻',
  '桃園台啤永豐雲豹',
  '新竹御嵿攻城獅',
  '福爾摩沙夢想家',
  '高雄全家海神',
];

const TEAM_LOGO_MAP: Record<string, string> = {
  新北國王: 'kings',
  臺北台新戰神: 'mars',
  新北中信特攻: 'dea',
  桃園台啤永豐雲豹: 'leopards',
  新竹御嵿攻城獅: 'lioneers',
  福爾摩沙夢想家: 'dreamers',
  高雄全家海神: 'aquas',
};

function TeamLogo({ teamName, color }: { teamName: string; color: string }) {
  const fileBase = TEAM_LOGO_MAP[teamName] || 'tpbl';
  const [ext, setExt] = useState<'jpg' | 'png'>('jpg');
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setExt('jpg');
    setHasError(false);
  }, [teamName]);

  const handleError = () => {
    if (ext === 'jpg') {
      setExt('png');
    } else {
      setHasError(true);
    }
  };

  if (hasError) {
    return (
      <div
        className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#0E1117] border flex items-center justify-center p-2 text-center shadow-lg font-black text-sm"
        style={{ borderColor: color, color }}
      >
        {teamName.slice(-2)}
      </div>
    );
  }

  return (
    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#0E1117] border border-[#30363D] p-2 flex items-center justify-center shrink-0 shadow-lg overflow-hidden">
      <img
        src={`/logos/${fileBase}.${ext}`}
        alt={teamName}
        className="w-full h-full object-contain"
        onError={handleError}
      />
    </div>
  );
}

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
const MAX_BENCH_COUNT = 9;

export default function MatchupPage() {
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  const [teamA, setTeamA] = useState<string>('新北國王');
  const [teamB, setTeamB] = useState<string>('臺北台新戰神');

  const [startersA, setStartersA] = useState<(Player | null)[]>([null, null, null, null, null]);
  const [benchA, setBenchA] = useState<Player[]>([]);

  const [startersB, setStartersB] = useState<(Player | null)[]>([null, null, null, null, null]);
  const [benchB, setBenchB] = useState<Player[]>([]);

  // 社群 1:1 戰報卡彈窗開關狀態
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // 各隊陣容記憶池
  const savedLineupsRef = useRef<Record<string, TeamLineupState>>({});

  const [activePicker, setActivePicker] = useState<{
    side: 'A' | 'B';
    type: 'starter' | 'bench';
    starterIndex?: number;
  } | null>(null);

  // 1. 載入球員數據
  useEffect(() => {
    fetch(`${API_BASE}/api/players/advanced?stage=2026-2027 例行賽`)
      .then((res) => {
        if (!res.ok) throw new Error('API failed');
        return res.json();
      })
      .then((data: Player[]) => {
        setAllPlayers(data);
        setLoading(false);
      })
      .catch(() => {
        fetch('/player_pr_stats.json')
          .then((res) => res.json())
          .then((prData) => {
            if (prData?.rankings) {
              const mapped: Player[] = prData.rankings.map((r: any) => ({
                player_name: r.name,
                team_name: r.team_name,
                jersey_number: r.jersey_number,
                position: r.position,
                identity: r.identity || '本土',
                games_played: r.games_played || 0,
                mpg: r.mpg || 0,
                ppg: r.badges?.PTS?.val || 0,
                rpg: r.badges?.REB?.val || 0,
                apg: r.badges?.AST?.val || 0,
                spg: r.badges?.STL?.val || 0,
                bpg: r.badges?.BLK?.val || 0,
                efg_pct: r.badges?.['eFG%']?.val || 0,
                ts_pct: r.badges?.['TS%']?.val || 0,
                usg_pct: r.badges?.['USG%']?.val || 20,
                gmsc: r.badges?.GmSC?.val || 10,
              }));
              setAllPlayers(mapped);
            }
            setLoading(false);
          })
          .catch(() => setLoading(false));
      });
  }, []);

  // 標準常規排陣
  const generateDefaultLineup = (teamName: string, playersList: Player[]): TeamLineupState => {
    const pool = playersList
      .filter((p) => p.team_name.includes(teamName) || teamName.includes(p.team_name))
      .sort((a, b) => b.mpg - a.mpg);

    const starters: (Player | null)[] = [null, null, null, null, null];
    const bench: Player[] = [];

    let currentStartersForeign = 0;
    let totalForeign = 0;

    for (const p of pool) {
      const isForeign = p.identity === '洋將';
      if (starters.filter(Boolean).length < 5) {
        if (isForeign && (currentStartersForeign >= 2 || totalForeign >= 3)) {
          continue;
        }
        const emptyIdx = starters.findIndex((s) => s === null);
        if (emptyIdx !== -1) {
          starters[emptyIdx] = p;
          if (isForeign) {
            currentStartersForeign++;
            totalForeign++;
          }
        }
      }
    }

    const starterNames = new Set(starters.filter(Boolean).map((p) => p!.player_name));
    for (const p of pool) {
      if (starterNames.has(p.player_name)) continue;
      if (bench.length >= MAX_BENCH_COUNT) break;
      const isForeign = p.identity === '洋將';
      if (isForeign && totalForeign >= 3) continue;
      bench.push(p);
      if (isForeign) totalForeign++;
    }

    return { starters, bench };
  };

  // 切換隊伍 A：嚴密防禦性儲存，避免 React 批處理狀態丟失
  const handleTeamAChange = (newTeam: string) => {
    savedLineupsRef.current[teamA] = {
      starters: startersA,
      bench: benchA,
    };

    setTeamA(newTeam);

    if (savedLineupsRef.current[newTeam]) {
      const saved = savedLineupsRef.current[newTeam];
      setStartersA(saved.starters);
      setBenchA(saved.bench);
    } else {
      const def = generateDefaultLineup(newTeam, allPlayers);
      setStartersA(def.starters);
      setBenchA(def.bench);
    }
  };

  // 切換隊伍 B：嚴密防禦性儲存
  const handleTeamBChange = (newTeam: string) => {
    savedLineupsRef.current[teamB] = {
      starters: startersB,
      bench: benchB,
    };

    setTeamB(newTeam);

    if (savedLineupsRef.current[newTeam]) {
      const saved = savedLineupsRef.current[newTeam];
      setStartersB(saved.starters);
      setBenchB(saved.bench);
    } else {
      const def = generateDefaultLineup(newTeam, allPlayers);
      setStartersB(def.starters);
      setBenchB(def.bench);
    }
  };

  useEffect(() => {
    if (allPlayers.length > 0) {
      if (!savedLineupsRef.current[teamA]) {
        const defA = generateDefaultLineup(teamA, allPlayers);
        setStartersA(defA.starters);
        setBenchA(defA.bench);
      }
      if (!savedLineupsRef.current[teamB]) {
        const defB = generateDefaultLineup(teamB, allPlayers);
        setStartersB(defB.starters);
        setBenchB(defB.bench);
      }
    }
  }, [allPlayers]);

  // 一鍵精準帶入上一場真實先發名單
  const handleLoadLastGameRoster = async (side: 'A' | 'B') => {
    const targetTeam = side === 'A' ? teamA : teamB;
    try {
      const res = await fetch(`${API_BASE}/api/teams/last-lineup?team=${encodeURIComponent(targetTeam)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.starters && data.starters.length === 5) {
          const teamPool = allPlayers.filter((p) => p.team_name.includes(targetTeam) || targetTeam.includes(p.team_name));

          const newStarters = data.starters.map((name: string) => {
            return teamPool.find((p) => p.player_name.trim() === name.trim()) || null;
          });

          const newBench = (data.bench || [])
            .map((name: string) => teamPool.find((p) => p.player_name.trim() === name.trim()))
            .filter(Boolean) as Player[];

          if (side === 'A') {
            setStartersA(newStarters);
            setBenchA(newBench);
          } else {
            setStartersB(newStarters);
            setBenchB(newBench);
          }
          return;
        }
      }
    } catch (e) {
      console.warn('API 呼叫失敗，請確保後端已重啟', e);
    }

    alert(`未能抓取到【${targetTeam}】上一場的先發標記，請確認後端 routes.py 是否已更新。`);
  };

  const handleResetLineup = (side: 'A' | 'B') => {
    const targetTeam = side === 'A' ? teamA : teamB;
    const def = generateDefaultLineup(targetTeam, allPlayers);
    if (side === 'A') {
      setStartersA(def.starters);
      setBenchA(def.bench);
    } else {
      setStartersB(def.starters);
      setBenchB(def.bench);
    }
  };

  // 彈窗候選池（更換先發時開放板凳球員與未登錄球員供對調）
  const availablePool = useMemo(() => {
    if (!activePicker) return [];
    const { side, type, starterIndex } = activePicker;
    const targetTeam = side === 'A' ? teamA : teamB;
    const currentStarters = side === 'A' ? startersA : startersB;
    const currentBench = side === 'A' ? benchA : benchB;

    const teamAll = allPlayers.filter(
      (p) => p.team_name.includes(targetTeam) || targetTeam.includes(p.team_name)
    );

    if (type === 'starter') {
      const otherStarterNames = new Set(
        currentStarters
          .filter((p, idx) => idx !== starterIndex && p !== null)
          .map((p) => p!.player_name)
      );
      return teamAll.filter((p) => !otherStarterNames.has(p.player_name));
    } else {
      const allSelectedNames = new Set([
        ...currentStarters.filter(Boolean).map((p) => p!.player_name),
        ...currentBench.map((p) => p.player_name),
      ]);
      return teamAll.filter((p) => !allSelectedNames.has(p.player_name));
    }
  }, [activePicker, teamA, teamB, startersA, benchA, startersB, benchB, allPlayers]);

  const foreignStatsA = useMemo(() => {
    const sForeign = startersA.filter(Boolean).filter((p) => p!.identity === '洋將').length;
    const bForeign = benchA.filter((p) => p.identity === '洋將').length;
    return { starters: sForeign, total: sForeign + bForeign };
  }, [startersA, benchA]);

  const foreignStatsB = useMemo(() => {
    const sForeign = startersB.filter(Boolean).filter((p) => p!.identity === '洋將').length;
    const bForeign = benchB.filter((p) => p.identity === '洋將').length;
    return { starters: sForeign, total: sForeign + bForeign };
  }, [startersB, benchB]);

  // 3. 核心運算：數值防呆健全度強化 (防止 NaN 與除以零)
  const calculateTeamAggregate = (starters: (Player | null)[], bench: Player[]) => {
    const activeStarters = starters.filter(Boolean) as Player[];
    if (activeStarters.length === 0) {
      return {
        rawStarterPts: 0,
        rawBenchPts: 0,
        totalUsg: 0,
        efg: 0,
        totalReb: 0,
        totalAst: 0,
        totalStl: 0,
        totalBlk: 0,
        totalStocks: 0,
        starterGmsc: 0,
        benchGmsc: 0,
      };
    }

    let sPts = 0, sReb = 0, sAst = 0, sStl = 0, sBlk = 0, sGmsc = 0, sUsgSum = 0;
    activeStarters.forEach((p) => {
      const estPpg = Math.max(Number(p.ppg) || 0, 5.0);
      const estRpg = Math.max(Number(p.rpg) || 0, 2.5);
      const estApg = Math.max(Number(p.apg) || 0, 1.2);
      const estStl = Math.max(Number(p.spg) || 0, 0.5);
      const estBlk = Math.max(Number(p.bpg) || 0, 0.3);
      const estGmsc = Math.max(Number(p.gmsc) || 0, 3.5);

      sPts += estPpg;
      sReb += estRpg;
      sAst += estApg;
      sStl += estStl;
      sBlk += estBlk;
      sGmsc += estGmsc;
      sUsgSum += (Number(p.usg_pct) || 18);
    });

    const sortedBench = [...bench].sort((a, b) => {
      const powerA = (Number(a.mpg) || 0) * 0.6 + (Number(a.ppg) || 0) * 0.4;
      const powerB = (Number(b.mpg) || 0) * 0.6 + (Number(b.ppg) || 0) * 0.4;
      return powerB - powerA;
    });

    const coreBench = sortedBench.slice(0, 4);
    const deepBench = sortedBench.slice(4);

    let bPts = 0, bReb = 0, bAst = 0, bStl = 0, bBlk = 0, bGmsc = 0;

    coreBench.forEach((p) => {
      const estPpg = Math.max(Number(p.ppg) || 0, 3.0) * 0.80;
      const estRpg = Math.max(Number(p.rpg) || 0, 1.5) * 0.80;
      const estApg = Math.max(Number(p.apg) || 0, 0.8) * 0.80;
      const estStl = Math.max(Number(p.spg) || 0, 0.3) * 0.80;
      const estBlk = Math.max(Number(p.bpg) || 0, 0.2) * 0.80;
      const estGmsc = Math.max(Number(p.gmsc) || 0, 2.0) * 0.80;

      bPts += estPpg;
      bReb += estRpg;
      bAst += estApg;
      bStl += estStl;
      bBlk += estBlk;
      bGmsc += estGmsc;
    });

    deepBench.forEach((p) => {
      bPts += (Number(p.ppg) || 0) * 0.20;
      bReb += (Number(p.rpg) || 0) * 0.20;
      bAst += (Number(p.apg) || 0) * 0.20;
      bStl += (Number(p.spg) || 0) * 0.20;
      bBlk += (Number(p.bpg) || 0) * 0.20;
      bGmsc += (Number(p.gmsc) || 0) * 0.20;
    });

    const fullTeamReb = Number((sReb * 0.72 + bReb + 8.5).toFixed(1));
    const fullTeamAst = Number((sAst * 0.75 + bAst + 5.5).toFixed(1));
    const fullTeamStl = Number((sStl * 0.75 + bStl + 1.0).toFixed(1));
    const fullTeamBlk = Number((sBlk * 0.75 + bBlk + 0.8).toFixed(1));
    const fullTeamStocks = Number((fullTeamStl + fullTeamBlk).toFixed(1));

    const starterCount = Math.max(1, activeStarters.length);
    const avgEfg = Number(
      (
        activeStarters.reduce((acc, p) => acc + (Number(p.efg_pct) > 0 ? Number(p.efg_pct) : 42.0), 0) /
        starterCount
      ).toFixed(1)
    );

    return {
      rawStarterPts: sPts,
      rawBenchPts: bPts,
      totalUsg: sUsgSum,
      efg: avgEfg,
      totalReb: fullTeamReb,
      totalAst: fullTeamAst,
      totalStl: fullTeamStl,
      totalBlk: fullTeamBlk,
      totalStocks: fullTeamStocks,
      starterGmsc: sGmsc,
      benchGmsc: bGmsc,
    };
  };

  const aggA = useMemo(() => calculateTeamAggregate(startersA, benchA), [startersA, benchA]);
  const aggB = useMemo(() => calculateTeamAggregate(startersB, benchB), [startersB, benchB]);

  // 4. 全方位立體防守對位演算法
  const matchupResults = useMemo(() => {
    if (aggA.rawStarterPts === 0 || aggB.rawStarterPts === 0) {
      return { netDiff: 0, scoreA: 95, scoreB: 95, winRateA: 50, winRateB: 50 };
    }

    const usgFactorA = aggA.totalUsg > 105 ? Math.pow(105 / aggA.totalUsg, 0.85) : 1.0;
    const usgFactorB = aggB.totalUsg > 105 ? Math.pow(105 / aggB.totalUsg, 0.85) : 1.0;

    const effectiveStarterPtsA = aggA.rawStarterPts * usgFactorA;
    const effectiveStarterPtsB = aggB.rawStarterPts * usgFactorB;

    const astFlowPenaltyA = aggA.totalUsg > 115 ? (aggA.totalUsg - 115) * 0.15 : 0;
    const astFlowPenaltyB = aggB.totalUsg > 115 ? (aggB.totalUsg - 115) * 0.15 : 0;
    const realAstA = Math.max(12, aggA.totalAst - astFlowPenaltyA);
    const realAstB = Math.max(12, aggB.totalAst - astFlowPenaltyB);

    const perimeterSuppressionOnA = (aggB.totalStl - 6.5) * 0.65;
    const rimSuppressionOnA = (aggB.totalBlk - 3.5) * 0.85;
    const totalDefSuppressionOnA = perimeterSuppressionOnA + rimSuppressionOnA;

    const perimeterSuppressionOnB = (aggA.totalStl - 6.5) * 0.65;
    const rimSuppressionOnB = (aggA.totalBlk - 3.5) * 0.85;
    const totalDefSuppressionOnB = perimeterSuppressionOnB + rimSuppressionOnB;

    const realEfgA = aggA.efg - Math.max(-1.5, totalDefSuppressionOnA * 0.4);
    const realEfgB = aggB.efg - Math.max(-1.5, totalDefSuppressionOnB * 0.4);
    const shootingFactor = (realEfgA - realEfgB) * 0.70;

    const safeStlA = Math.max(0.1, aggA.totalStl || 0.1);
    const safeStlB = Math.max(0.1, aggB.totalStl || 0.1);

    const turnoverExposureA = (aggA.totalUsg > 110 ? (aggA.totalUsg - 110) * 0.18 : 0) * (safeStlB / 7.0);
    const turnoverExposureB = (aggB.totalUsg > 110 ? (aggB.totalUsg - 110) * 0.18 : 0) * (safeStlA / 7.0);

    const transitionNetFromDefense = ((aggA.totalStl - aggB.totalStl) * 1.2) - (turnoverExposureA - turnoverExposureB);
    const rebFactor = (aggA.totalReb - aggB.totalReb) * 0.35;
    const playmakingFactor = (realAstA - realAstB) * 0.45;
    const pureDefenseFactor = (aggA.totalStocks - aggB.totalStocks) * 0.35;
    const benchFactor = (aggA.benchGmsc - aggB.benchGmsc) * 0.08;
    const effectiveScoringDiff = (effectiveStarterPtsA - effectiveStarterPtsB) * 0.12;

    const rawNetDiff =
      shootingFactor +
      rebFactor +
      playmakingFactor +
      pureDefenseFactor +
      transitionNetFromDefense +
      benchFactor +
      effectiveScoringDiff;

    let netRatingDiff = 0;
    if (Math.abs(rawNetDiff) <= 3.5) {
      netRatingDiff = rawNetDiff;
    } else {
      const sign = rawNetDiff > 0 ? 1 : -1;
      netRatingDiff = sign * (3.5 + Math.sqrt(Math.abs(rawNetDiff) - 3.5) * 1.2);
    }
    netRatingDiff = Number(netRatingDiff.toFixed(1));

    const BASE_TEAM_SCORE = 98;
    const scoreA = Math.round(BASE_TEAM_SCORE + netRatingDiff / 2);
    const scoreB = Math.round(BASE_TEAM_SCORE - netRatingDiff / 2);

    const winRate = Math.min(78, Math.max(22, Math.round(50 + netRatingDiff * 3.4)));

    return {
      netDiff: netRatingDiff,
      scoreA,
      scoreB,
      winRateA: winRate,
      winRateB: 100 - winRate,
    };
  }, [aggA, aggB]);

  // 選人與名額驗證
  const handleSelectPlayer = (player: Player) => {
    if (!activePicker) return;
    const { side, type, starterIndex } = activePicker;
    const isForeign = player.identity === '洋將';

    const currentStarters = side === 'A' ? [...startersA] : [...startersB];
    const currentBench = side === 'A' ? [...benchA] : [...benchB];
    const foreignStats = side === 'A' ? foreignStatsA : foreignStatsB;

    if (type === 'starter' && starterIndex !== undefined) {
      const currentTarget = currentStarters[starterIndex];
      const willReplaceForeign = currentTarget?.identity === '洋將';
      const isFromBench = currentBench.some((p) => p.player_name === player.player_name);

      const nextStartersForeign = foreignStats.starters - (willReplaceForeign ? 1 : 0) + (isForeign ? 1 : 0);
      if (nextStartersForeign > 2) {
        alert('【違規限制】場上先發洋將不得超過 2 名！');
        return;
      }

      if (!isFromBench && isForeign && !willReplaceForeign && foreignStats.total >= 3) {
        alert('【違規限制】14人登錄名單洋將總計不得超過 3 名！');
        return;
      }

      const benchIdx = currentBench.findIndex((p) => p.player_name === player.player_name);
      if (benchIdx !== -1) {
        if (currentTarget) {
          currentBench[benchIdx] = currentTarget;
        } else {
          currentBench.splice(benchIdx, 1);
        }
      } else if (currentTarget && currentBench.length < MAX_BENCH_COUNT) {
        currentBench.push(currentTarget);
      }

      currentStarters[starterIndex] = player;

      if (side === 'A') {
        setStartersA(currentStarters);
        setBenchA(currentBench);
      } else {
        setStartersB(currentStarters);
        setBenchB(currentBench);
      }
    } else if (type === 'bench') {
      if (isForeign && foreignStats.total >= 3) {
        alert('【違規限制】14人登錄名單洋將總計不得超過 3 名！');
        return;
      }
      if (currentBench.length < MAX_BENCH_COUNT) {
        if (side === 'A') {
          setBenchA([...currentBench, player]);
        } else {
          setBenchB([...currentBench, player]);
        }
      }
    }

    setActivePicker(null);
  };

  const handleRemoveStarter = (side: 'A' | 'B', index: number) => {
    if (side === 'A') {
      const next = [...startersA];
      next[index] = null;
      setStartersA(next);
    } else {
      const next = [...startersB];
      next[index] = null;
      setStartersB(next);
    }
  };

  const handleRemoveBench = (side: 'A' | 'B', name: string) => {
    if (side === 'A') {
      setBenchA(benchA.filter((p) => p.player_name !== name));
    } else {
      setBenchB(benchB.filter((p) => p.player_name !== name));
    }
  };

  const isPlayerDisabled = (p: Player) => {
    if (!activePicker) return false;
    if (p.identity !== '洋將') return false;

    const { side, type, starterIndex } = activePicker;
    const currentStarters = side === 'A' ? startersA : startersB;
    const currentBench = side === 'A' ? benchA : benchB;
    const foreignStats = side === 'A' ? foreignStatsA : foreignStatsB;

    if (type === 'starter') {
      const currentTarget = starterIndex !== undefined ? currentStarters[starterIndex] : null;
      const willReplaceForeign = currentTarget?.identity === '洋將';
      const isFromBench = currentBench.some((bp) => bp.player_name === p.player_name);

      const nextStartersForeign = foreignStats.starters - (willReplaceForeign ? 1 : 0) + 1;
      if (nextStartersForeign > 2) return true;

      if (!isFromBench && !willReplaceForeign && foreignStats.total >= 3) {
        return true;
      }

      return false;
    } else {
      return foreignStats.total >= 3;
    }
  };

  return (
    <div className="min-h-screen bg-[#0E1117] text-gray-100 pb-16">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* ============================================================== */}
        {/* 1. 頂部看板 (雙邊球隊 Logo + 四維對決數據與動態比分) */}
        {/* ============================================================== */}
        <div className="bg-[#161B22] border border-[#30363D] rounded-2xl p-6 shadow-2xl mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#21262D]">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#FF9100] animate-pulse"></span>
                <h1 className="text-2xl font-black tracking-tight text-white">
                  球隊深度對決模擬器 (Head-to-Head Lineup Matchup)
                </h1>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                自由調配 14 人名單，自動記憶各隊排陣，並引入立體防守壓制與四要素動態推演
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="px-3 py-1.5 rounded-lg bg-[#21262D] text-gray-300 border border-[#30363D]">
                場上上限：<strong className="text-purple-400">雙洋將</strong>
              </span>
              <span className="px-3 py-1.5 rounded-lg bg-[#21262D] text-gray-300 border border-[#30363D]">
                登錄上限：<strong className="text-purple-400">3 名洋將</strong>
              </span>
              <Link
                href="/glossary#matchup-model"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF9100]/10 hover:bg-[#FF9100]/20 text-[#FF9100] border border-[#FF9100]/30 transition-colors font-medium"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>模型依據</span>
              </Link>
              
              {/* 📸 新增社群 1:1 戰報卡按鈕 */}
              <button
                type="button"
                onClick={() => setIsShareModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF9100] hover:bg-amber-400 text-slate-950 font-black transition-colors shadow-md text-xs"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>生成戰報卡</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 items-center">
            {/* 隊伍 A (左側含隊徽 Logo) */}
            <div className="flex items-center justify-start md:justify-end gap-4">
              <div className="text-left md:text-right order-2 md:order-1">
                <span className="text-xs text-gray-400 font-mono">TEAM A</span>
                <h2 className="text-2xl font-black text-[#FF9100]">{teamA}</h2>
                <div className="text-xs text-gray-300 mt-2 space-y-1">
                  <div>推演全場得分：<span className="font-bold text-white text-lg font-mono">{matchupResults.scoreA}</span> 分</div>
                  <div>先發火力加總：<span className="font-bold text-gray-300">{aggA.rawStarterPts.toFixed(1)}</span> 分</div>
                  <div>板凳戰力支援：<span className="font-bold text-gray-300">{aggA.rawBenchPts.toFixed(1)}</span> 分</div>
                  <div>
                    先發球權負荷：
                    <span className={`font-bold ml-1 ${aggA.totalUsg > 115 ? 'text-red-400' : 'text-amber-300'}`}>
                      {aggA.totalUsg.toFixed(1)}% {aggA.totalUsg > 115 && '(嚴重排擠)'}
                    </span>
                  </div>
                  <div>
                    洋將檢驗：
                    <span className="font-bold text-purple-400 ml-1">
                      先發 {foreignStatsA.starters}/2 · 登錄 {foreignStatsA.total}/3
                    </span>
                  </div>
                </div>
              </div>
              <div className="order-1 md:order-2 shrink-0">
                <TeamLogo teamName={teamA} color="#FF9100" />
              </div>
            </div>

            {/* 中央 VS 與勝率 */}
            <div className="flex flex-col items-center justify-center bg-[#0E1117] border border-[#30363D] rounded-xl py-4 px-6 shadow-inner">
              <span className="text-xl font-black italic tracking-widest text-gray-500">VS</span>

              <div className="w-full mt-3">
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-[#FF9100]">{matchupResults.winRateA}%</span>
                  <span className="text-gray-400 text-[10px]">動態勝率</span>
                  <span className="text-[#2979FF]">{matchupResults.winRateB}%</span>
                </div>
                <div className="w-full h-2.5 bg-[#21262D] rounded-full overflow-hidden flex">
                  <div style={{ width: `${matchupResults.winRateA}%` }} className="bg-[#FF9100] transition-all duration-500"></div>
                  <div style={{ width: `${matchupResults.winRateB}%` }} className="bg-[#2979FF] transition-all duration-500"></div>
                </div>
              </div>

              <div className="text-xs text-gray-400 mt-3 text-center">
                交叉淨效率差：
                <strong className={`font-mono text-sm ml-1 ${matchupResults.netDiff >= 0 ? 'text-[#FF9100]' : 'text-[#2979FF]'}`}>
                  {matchupResults.netDiff > 0 ? `+${matchupResults.netDiff}` : matchupResults.netDiff}
                </strong>
              </div>
              <span className="text-[10px] text-gray-500 mt-0.5 text-center">
                {matchupResults.netDiff > 0
                  ? `${teamA} 攻守對位佔優`
                  : matchupResults.netDiff < 0
                  ? `${teamB} 攻守對位佔優`
                  : '雙方攻守實力旗鼓相當'}
              </span>
            </div>

            {/* 隊伍 B (右側含隊徽 Logo) */}
            <div className="flex items-center justify-start gap-4">
              <div className="shrink-0">
                <TeamLogo teamName={teamB} color="#2979FF" />
              </div>
              <div className="text-left">
                <span className="text-xs text-gray-400 font-mono">TEAM B</span>
                <h2 className="text-2xl font-black text-[#2979FF]">{teamB}</h2>
                <div className="text-xs text-gray-300 mt-2 space-y-1">
                  <div>推演全場得分：<span className="font-bold text-white text-lg font-mono">{matchupResults.scoreB}</span> 分</div>
                  <div>先發火力加總：<span className="font-bold text-gray-300">{aggB.rawStarterPts.toFixed(1)}</span> 分</div>
                  <div>板凳戰力支援：<span className="font-bold text-gray-300">{aggB.rawBenchPts.toFixed(1)}</span> 分</div>
                  <div>
                    先發球權負荷：
                    <span className={`font-bold ml-1 ${aggB.totalUsg > 115 ? 'text-red-400' : 'text-amber-300'}`}>
                      {aggB.totalUsg.toFixed(1)}% {aggB.totalUsg > 115 && '(嚴重排擠)'}
                    </span>
                  </div>
                  <div>
                    洋將檢驗：
                    <span className="font-bold text-purple-400 ml-1">
                      先發 {foreignStatsB.starters}/2 · 登錄 {foreignStatsB.total}/3
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 頂部四維數據直接呈現 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-[#21262D]">
            <div className="bg-[#0E1117] p-2.5 rounded-lg border border-[#21262D]">
              <div className="text-[11px] text-gray-400 font-medium">投籃效率 (eFG%)</div>
              <div className="flex justify-between text-xs font-mono font-bold mt-1">
                <span className="text-[#FF9100]">{aggA.efg}%</span>
                <span className="text-[#2979FF]">{aggB.efg}%</span>
              </div>
              <div className="w-full h-1.5 bg-[#21262D] rounded-full overflow-hidden flex mt-1">
                <div style={{ width: `${(aggA.efg / Math.max(1, aggA.efg + aggB.efg)) * 100}%` }} className="bg-[#FF9100]"></div>
                <div style={{ width: `${(aggB.efg / Math.max(1, aggA.efg + aggB.efg)) * 100}%` }} className="bg-[#2979FF]"></div>
              </div>
            </div>

            <div className="bg-[#0E1117] p-2.5 rounded-lg border border-[#21262D]">
              <div className="text-[11px] text-gray-400 font-medium">全隊籃板 (14人整場)</div>
              <div className="flex justify-between text-xs font-mono font-bold mt-1">
                <span className="text-[#FF9100]">{aggA.totalReb}</span>
                <span className="text-[#2979FF]">{aggB.totalReb}</span>
              </div>
              <div className="w-full h-1.5 bg-[#21262D] rounded-full overflow-hidden flex mt-1">
                <div style={{ width: `${(aggA.totalReb / Math.max(1, aggA.totalReb + aggB.totalReb)) * 100}%` }} className="bg-[#FF9100]"></div>
                <div style={{ width: `${(aggB.totalReb / Math.max(1, aggA.totalReb + aggB.totalReb)) * 100}%` }} className="bg-[#2979FF]"></div>
              </div>
            </div>

            <div className="bg-[#0E1117] p-2.5 rounded-lg border border-[#21262D]">
              <div className="text-[11px] text-gray-400 font-medium">全隊助攻 (14人整場)</div>
              <div className="flex justify-between text-xs font-mono font-bold mt-1">
                <span className="text-[#FF9100]">{aggA.totalAst}</span>
                <span className="text-[#2979FF]">{aggB.totalAst}</span>
              </div>
              <div className="w-full h-1.5 bg-[#21262D] rounded-full overflow-hidden flex mt-1">
                <div style={{ width: `${(aggA.totalAst / Math.max(1, aggA.totalAst + aggB.totalAst)) * 100}%` }} className="bg-[#FF9100]"></div>
                <div style={{ width: `${(aggB.totalAst / Math.max(1, aggA.totalAst + aggB.totalAst)) * 100}%` }} className="bg-[#2979FF]"></div>
              </div>
            </div>

            <div className="bg-[#0E1117] p-2.5 rounded-lg border border-[#21262D]">
              <div className="text-[11px] text-gray-400 font-medium">防守壓迫 (STL+BLK)</div>
              <div className="flex justify-between text-xs font-mono font-bold mt-1">
                <span className="text-[#FF9100]">{aggA.totalStocks}</span>
                <span className="text-[#2979FF]">{aggB.totalStocks}</span>
              </div>
              <div className="w-full h-1.5 bg-[#21262D] rounded-full overflow-hidden flex mt-1">
                <div style={{ width: `${(aggA.totalStocks / Math.max(1, aggA.totalStocks + aggB.totalStocks)) * 100}%` }} className="bg-[#FF9100]"></div>
                <div style={{ width: `${(aggB.totalStocks / Math.max(1, aggA.totalStocks + aggB.totalStocks)) * 100}%` }} className="bg-[#2979FF]"></div>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* 2. 雙邊戰術調度板 */}
        {/* ============================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* 隊伍 A 戰術板 */}
          <div className="bg-[#161B22] border border-[#30363D] rounded-2xl p-6 shadow-xl flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#21262D]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FF9100]"></span>
                <span className="font-bold text-white">主隊戰術調度板</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleLoadLastGameRoster('A')}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#21262D] hover:bg-[#30363D] text-[11px] font-bold text-amber-300 border border-[#30363D] transition-colors"
                  title="帶入官方標註真實先發名單"
                >
                  <History className="w-3.5 h-3.5 text-amber-400" />
                  <span>上一場陣容</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleResetLineup('A')}
                  className="p-1.5 rounded-lg bg-[#21262D] hover:bg-[#30363D] text-gray-400 hover:text-white border border-[#30363D] transition-colors"
                  title="重置回預設常規輪替"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>

                <select
                  value={teamA}
                  onChange={(e) => handleTeamAChange(e.target.value)}
                  className="bg-[#0E1117] border border-[#30363D] text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#FF9100]"
                >
                  {TEAMS.map((t) => (
                    <option key={t} value={t} disabled={t === teamB}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 先發 5 人卡牌 */}
            <div className="mt-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  先發五人 (Starting 5) · {startersA.filter(Boolean).length} / 5
                </span>
                <span className="text-[11px] text-gray-500">點擊卡片更換 (支援與板凳直接互換)</span>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {startersA.map((p, idx) => (
                  <div
                    key={idx}
                    onClick={() => setActivePicker({ side: 'A', type: 'starter', starterIndex: idx })}
                    className={`relative rounded-xl p-2.5 flex flex-col items-center justify-between text-center cursor-pointer border transition-all h-36 ${
                      p
                        ? 'bg-[#0E1117] border-[#30363D] hover:border-[#FF9100]'
                        : 'border-dashed border-[#30363D] hover:border-gray-500 bg-transparent'
                    }`}
                  >
                    <span className="text-[10px] font-mono text-gray-500 font-bold">
                      {p ? p.position || POSITIONS[idx] : POSITIONS[idx]}
                    </span>
                    {p ? (
                      <>
                        <div className="my-auto">
                          <div className="text-xs font-bold text-white truncate max-w-[70px]">
                            {p.player_name}
                          </div>
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            #{p.jersey_number || '-'} ·{' '}
                            <span className={p.identity === '洋將' ? 'text-purple-400 font-bold' : ''}>
                              {p.identity}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono font-bold text-[#FF9100] mt-0.5">
                            {p.ppg} 分
                          </div>
                          <div className="text-[9px] text-gray-500 font-mono">
                            場均 {p.mpg} 分
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveStarter('A', idx);
                          }}
                          className="text-[10px] text-gray-500 hover:text-red-400 transition-colors"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-gray-600 my-auto">+ 指派</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 板凳 9 人席位 */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  板凳席 (Bench 9) · {benchA.length} / {MAX_BENCH_COUNT}
                </span>
                {benchA.length < MAX_BENCH_COUNT && (
                  <button
                    type="button"
                    onClick={() => setActivePicker({ side: 'A', type: 'bench' })}
                    className="text-xs text-[#00E676] hover:underline"
                  >
                    + 加入板凳球員
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {benchA.map((p) => (
                  <div
                    key={p.player_name}
                    className="bg-[#0E1117] border border-[#21262D] rounded-lg p-2.5 flex items-center justify-between"
                  >
                    <div className="truncate pr-1">
                      <div className="text-xs font-bold text-white truncate">{p.player_name}</div>
                      <div className="text-[10px] text-gray-400">
                        #{p.jersey_number} ·{' '}
                        <span className={p.identity === '洋將' ? 'text-purple-400 font-bold' : ''}>
                          {p.identity}
                        </span>{' '}
                        · {p.mpg}分
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-mono text-emerald-400">{p.ppg}分</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveBench('A', p.player_name)}
                        className="text-gray-500 hover:text-red-400 text-xs px-1"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}

                {Array.from({ length: MAX_BENCH_COUNT - benchA.length }).map((_, i) => (
                  <div
                    key={i}
                    onClick={() => setActivePicker({ side: 'A', type: 'bench' })}
                    className="border border-dashed border-[#21262D] rounded-lg p-2.5 flex items-center justify-center cursor-pointer text-gray-600 hover:text-gray-400 hover:border-gray-500 text-xs h-12"
                  >
                    + 替補位
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 隊伍 B 戰術板 */}
          <div className="bg-[#161B22] border border-[#30363D] rounded-2xl p-6 shadow-xl flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#21262D]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#2979FF]"></span>
                <span className="font-bold text-white">客隊戰術調度板</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleLoadLastGameRoster('B')}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#21262D] hover:bg-[#30363D] text-[11px] font-bold text-sky-300 border border-[#30363D] transition-colors"
                  title="帶入官方標註真實先發名單"
                >
                  <History className="w-3.5 h-3.5 text-sky-400" />
                  <span>上一場陣容</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleResetLineup('B')}
                  className="p-1.5 rounded-lg bg-[#21262D] hover:bg-[#30363D] text-gray-400 hover:text-white border border-[#30363D] transition-colors"
                  title="重置回預設常規輪替"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>

                <select
                  value={teamB}
                  onChange={(e) => handleTeamBChange(e.target.value)}
                  className="bg-[#0E1117] border border-[#30363D] text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#2979FF]"
                >
                  {TEAMS.map((t) => (
                    <option key={t} value={t} disabled={t === teamA}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 先發 5 人卡牌 */}
            <div className="mt-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                  先發五人 (Starting 5) · {startersB.filter(Boolean).length} / 5
                </span>
                <span className="text-[11px] text-gray-500">點擊卡片更換 (支援與板凳直接互換)</span>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {startersB.map((p, idx) => (
                  <div
                    key={idx}
                    onClick={() => setActivePicker({ side: 'B', type: 'starter', starterIndex: idx })}
                    className={`relative rounded-xl p-2.5 flex flex-col items-center justify-between text-center cursor-pointer border transition-all h-36 ${
                      p
                        ? 'bg-[#0E1117] border-[#30363D] hover:border-[#2979FF]'
                        : 'border-dashed border-[#30363D] hover:border-gray-500 bg-transparent'
                    }`}
                  >
                    <span className="text-[10px] font-mono text-gray-500 font-bold">
                      {p ? p.position || POSITIONS[idx] : POSITIONS[idx]}
                    </span>
                    {p ? (
                      <>
                        <div className="my-auto">
                          <div className="text-xs font-bold text-white truncate max-w-[70px]">
                            {p.player_name}
                          </div>
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            #{p.jersey_number || '-'} ·{' '}
                            <span className={p.identity === '洋將' ? 'text-purple-400 font-bold' : ''}>
                              {p.identity}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono font-bold text-[#2979FF] mt-0.5">
                            {p.ppg} 分
                          </div>
                          <div className="text-[9px] text-gray-500 font-mono">
                            場均 {p.mpg} 分
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveStarter('B', idx);
                          }}
                          className="text-[10px] text-gray-500 hover:text-red-400 transition-colors"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-gray-600 my-auto">+ 指派</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 板凳 9 人席位 */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  板凳席 (Bench 9) · {benchB.length} / {MAX_BENCH_COUNT}
                </span>
                {benchB.length < MAX_BENCH_COUNT && (
                  <button
                    type="button"
                    onClick={() => setActivePicker({ side: 'B', type: 'bench' })}
                    className="text-xs text-[#00E676] hover:underline"
                  >
                    + 加入板凳球員
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {benchB.map((p) => (
                  <div
                    key={p.player_name}
                    className="bg-[#0E1117] border border-[#21262D] rounded-lg p-2.5 flex items-center justify-between"
                  >
                    <div className="truncate pr-1">
                      <div className="text-xs font-bold text-white truncate">{p.player_name}</div>
                      <div className="text-[10px] text-gray-400">
                        #{p.jersey_number} ·{' '}
                        <span className={p.identity === '洋將' ? 'text-purple-400 font-bold' : ''}>
                          {p.identity}
                        </span>{' '}
                        · {p.mpg}分
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-mono text-emerald-400">{p.ppg}分</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveBench('B', p.player_name)}
                        className="text-gray-500 hover:text-red-400 text-xs px-1"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}

                {Array.from({ length: MAX_BENCH_COUNT - benchB.length }).map((_, i) => (
                  <div
                    key={i}
                    onClick={() => setActivePicker({ side: 'B', type: 'bench' })}
                    className="border border-dashed border-[#21262D] rounded-lg p-2.5 flex items-center justify-center cursor-pointer text-gray-600 hover:text-gray-400 hover:border-gray-500 text-xs h-12"
                  >
                    + 替補位
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* 3. 選人彈窗 (支援先發與板凳直接 Swap 互換，絕不再出現空名單！) */}
        {/* ============================================================== */}
        {activePicker && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#161B22] border border-[#30363D] rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-[#21262D]">
                <div>
                  <h3 className="text-base font-bold text-white">
                    選擇球員 · {activePicker.side === 'A' ? teamA : teamB}
                  </h3>
                  <span className="text-xs text-gray-400">
                    {activePicker.type === 'starter'
                      ? `替換先發第 ${activePicker.starterIndex! + 1} 位（點擊板凳球員將自動互換位置）`
                      : '指派至替補席'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActivePicker(null)}
                  className="text-gray-400 hover:text-white text-sm p-1"
                >
                  ✕
                </button>
              </div>

              <div className="overflow-y-auto mt-4 space-y-2 pr-1 flex-1">
                {availablePool.map((p) => {
                  const disabled = isPlayerDisabled(p);
                  const isCurrentlyOnBench = (activePicker.side === 'A' ? benchA : benchB).some(
                    (bp) => bp.player_name === p.player_name
                  );

                  return (
                    <div
                      key={p.player_name}
                      onClick={() => !disabled && handleSelectPlayer(p)}
                      className={`p-3 rounded-lg border transition-all flex items-center justify-between ${
                        disabled
                          ? 'bg-[#0E1117]/40 border-[#21262D] opacity-40 cursor-not-allowed'
                          : 'bg-[#0E1117] border-[#21262D] hover:border-[#FF9100] cursor-pointer'
                      }`}
                    >
                      <div>
                        <div className="text-sm font-bold text-white flex items-center gap-2">
                          <span>{p.player_name}</span>
                          <span className="text-xs font-normal text-gray-400 font-mono">
                            #{p.jersey_number}
                          </span>
                          {isCurrentlyOnBench && activePicker.type === 'starter' && (
                            <span className="text-[10px] text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-800/40">
                              目前在替補席 (點擊互換)
                            </span>
                          )}
                          {disabled && (
                            <span className="text-[10px] text-red-400 bg-red-950/40 px-1.5 py-0.5 rounded border border-red-800/40">
                              洋將額滿
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {p.position} ·{' '}
                          <span className={p.identity === '洋將' ? 'text-purple-400 font-bold' : ''}>
                            {p.identity}
                          </span>{' '}
                          · 場均 {p.mpg} 分鐘 ({p.games_played > 0 ? `${p.games_played} 場` : '參考數據'})
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono font-bold text-white">{p.ppg} PTS</div>
                        <div className="text-[11px] text-gray-400">
                          {p.rpg} REB · {p.apg} AST
                        </div>
                      </div>
                    </div>
                  );
                })}

                {availablePool.length === 0 && (
                  <div className="text-center py-8 text-gray-500 text-xs">
                    暫無可調度的球員
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 4. 社群 16:9 戰報分享卡 Modal 掛載 */}
        {/* ============================================================== */}
        <MatchupShareCardModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          teamA={teamA}
          teamB={teamB}
          startersA={startersA}
          startersB={startersB}
          benchA={benchA}
          benchB={benchB}
          aggA={aggA}
          aggB={aggB}
          matchupResults={matchupResults}
          foreignStatsA={foreignStatsA}
          foreignStatsB={foreignStatsB}
        />
      </main>
    </div>
  );
}
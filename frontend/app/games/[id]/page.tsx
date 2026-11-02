'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import ScoreBanner from '@/components/ScoreBanner';
import TacticsCard from '@/components/TacticsCard';
import FourFactorsBar from '@/components/FourFactorsBar';
import {
  ShieldAlert,
  Swords,
  Users,
  Trophy,
  ArrowLeft,
  Flame,
  BarChart2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

interface GameDetail {
  id: string;
  date: string;
  stage: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  status: string;
  player_stats?: PlayerStat[];
}

interface PlayerStat {
  id: number;
  team_name: string;
  jersey_number?: string;
  player_name: string;
  position?: string;
  identity?: string;
  minutes?: string;
  seconds: number;
  pts: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  plus_minus: number;
  efg_pct: number;
  ts_pct: number;
  usg_pct: number;
  gmsc: number;
}

interface TacticsDetail {
  game_id: string;
  home_team: string;
  away_team: string;
  total_tactics: number;
  home_tactics: TacticItem[];
  away_tactics: TacticItem[];
  all_tactics: TacticItem[];
}

interface TacticItem {
  id?: number;
  team_name: string;
  category: string;
  description: string;
  is_summary: boolean;
  display_order?: number;
}

export default function GameReviewPage() {
  const params = useParams();
  const gameId = (params?.id as string)?.toUpperCase() || 'G07';

  const [game, setGame] = useState<GameDetail | null>(null);
  const [tactics, setTactics] = useState<TacticsDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTeamTab, setActiveTeamTab] = useState<'away' | 'home'>('away');

  const API_BASE = 'http://localhost:8000';

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        // 1. 抓取單場基本與球員統計
        const resGame = await fetch(`${API_BASE}/api/games/${gameId}`);
        if (!resGame.ok) {
          throw new Error(`無法取得賽事 ${gameId} 數據 (HTTP ${resGame.status})`);
        }
        const dataGame: GameDetail = await resGame.json();
        setGame(dataGame);

        // 2. 抓取單場戰術對位交鋒
        const resTactics = await fetch(`${API_BASE}/api/games/${gameId}/tactics`);
        if (!resTactics.ok) {
          throw new Error(`無法取得戰術分析數據 (HTTP ${resTactics.status})`);
        }
        const dataTactics: TacticsDetail = await resTactics.json();
        setTactics(dataTactics);
      } catch (err: any) {
        setError(err.message || '連線至本地後端失敗，請確認 FastAPI 服務已在 localhost:8000 運行。');
      } finally {
        setLoading(false);
      }
    }

    if (gameId) {
      fetchData();
    }
  }, [gameId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <RefreshCw className="w-10 h-10 text-amber-400 animate-spin" />
        <p className="text-gray-400 font-medium tracking-wide">正在載入 {gameId} 賽事実況與戰術數據...</p>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 rounded-3xl border border-red-500/30 bg-red-950/20 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
        <h3 className="text-xl font-bold text-white">載入賽事失敗</h3>
        <p className="text-sm text-gray-300 leading-relaxed">{error}</p>
        <div className="pt-4">
          <Link
            href="/"
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-card border border-cardBorder text-gray-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>返回賽事列表</span>
          </Link>
        </div>
      </div>
    );
  }

  const awayPlayers = (game.player_stats || []).filter(
    (p) => p.team_name === game.away_team
  );
  const homePlayers = (game.player_stats || []).filter(
    (p) => p.team_name === game.home_team
  );
  const activePlayers = activeTeamTab === 'away' ? awayPlayers : homePlayers;
  const activeTeamName = activeTeamTab === 'away' ? game.away_team : game.home_team;

  return (
    <div className="space-y-10">
      {/* 頂部導航與標題 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/"
          className="inline-flex items-center space-x-2 text-sm font-semibold text-gray-400 hover:text-amber-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回總冠軍賽賽程總覽</span>
        </Link>

        {/* 快速切換比賽 G01~G07 */}
        <div className="flex items-center space-x-1.5 overflow-x-auto py-1">
          {['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07'].map((gid) => (
            <Link
              key={gid}
              href={`/games/${gid}`}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                gid === game.id
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-card text-gray-400 hover:text-white border border-cardBorder'
              }`}
            >
              {gid}
            </Link>
          ))}
        </div>
      </div>

      {/* 1. 大比分橫幅 */}
      <ScoreBanner
        id={game.id}
        date={game.date}
        stage={game.stage}
        home_team={game.home_team}
        away_team={game.away_team}
        home_score={game.home_score}
        away_score={game.away_score}
        status={game.status}
      />

      {/* 2. 雙向攻防四大要素對決條 */}
      <FourFactorsBar
        awayTeam={game.away_team}
        homeTeam={game.home_team}
      />

      {/* 3. 焦點對位與戰術交鋒 (WOWY) 核心區塊 */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-cardBorder/80 pb-4">
          <div>
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Swords className="w-5 h-5" />
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight">
                焦點對位與戰術交鋒 (WOWY Matchup)
              </h2>
            </div>
            <p className="text-sm text-gray-400 mt-1 font-medium">
              自動折行排版・攻防表現長文本深度解析・全幅完整展示無截斷
            </p>
          </div>
          <span className="self-start sm:self-auto text-xs font-semibold px-3 py-1 rounded-full bg-cardBorder text-gray-300">
            共 {tactics?.total_tactics ?? 0} 組關鍵戰術對位
          </span>
        </div>

        {/* 雙欄左右排版：客隊焦點 vs 主隊焦點 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* 客隊欄 (Left Column) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <span className="font-bold text-amber-300 text-sm tracking-wide">
                客隊焦點：{game.away_team}
              </span>
              <span className="text-xs font-mono text-amber-400/80">
                {tactics?.away_tactics.length ?? 0} 項對位
              </span>
            </div>

            {tactics?.away_tactics && tactics.away_tactics.length > 0 ? (
              tactics.away_tactics.map((t, i) => (
                <TacticsCard key={t.id || i} {...t} />
              ))
            ) : (
              <div className="p-6 rounded-2xl border border-cardBorder bg-card/40 text-center text-sm text-gray-500">
                本場尚無 {game.away_team} 專屬對位記錄
              </div>
            )}
          </div>

          {/* 主隊欄 (Right Column) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <span className="font-bold text-emerald-300 text-sm tracking-wide">
                主隊焦點：{game.home_team}
              </span>
              <span className="text-xs font-mono text-emerald-400/80">
                {tactics?.home_tactics.length ?? 0} 項對位
              </span>
            </div>

            {tactics?.home_tactics && tactics.home_tactics.length > 0 ? (
              tactics.home_tactics.map((t, i) => (
                <TacticsCard key={t.id || i} {...t} />
              ))
            ) : (
              <div className="p-6 rounded-2xl border border-cardBorder bg-card/40 text-center text-sm text-gray-500">
                本場尚無 {game.home_team} 專屬對位記錄
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4. 單場球員攻守數據 Boxscore 與進階指標 */}
      <section className="space-y-6 pt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-cardBorder/80 pb-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">
                單場球員傳統攻守與進階指標 (Boxscore)
              </h2>
              <p className="text-xs text-gray-400 font-medium">
                包含 eFG%, TS%, USG% 及 Game Score
              </p>
            </div>
          </div>

          {/* 球隊切換頁籤 */}
          <div className="inline-flex p-1 rounded-xl bg-card border border-cardBorder">
            <button
              onClick={() => setActiveTeamTab('away')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTeamTab === 'away'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {game.away_team}
            </button>
            <button
              onClick={() => setActiveTeamTab('home')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTeamTab === 'home'
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {game.home_team}
            </button>
          </div>
        </div>

        {/* 數據表格 */}
        <div className="overflow-x-auto rounded-2xl border border-cardBorder bg-card shadow-lg">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-gray-900/90 text-gray-400 uppercase font-mono tracking-wider border-b border-cardBorder">
              <tr>
                <th className="py-3.5 px-3 font-semibold text-white sticky left-0 bg-gray-900/90">球員</th>
                <th className="py-3.5 px-2.5 font-semibold">時間</th>
                <th className="py-3.5 px-2.5 font-semibold text-right">得分</th>
                <th className="py-3.5 px-2.5 font-semibold text-right">投籃 (FGM/A)</th>
                <th className="py-3.5 px-2.5 font-semibold text-right">三分 (3PM/A)</th>
                <th className="py-3.5 px-2.5 font-semibold text-right">罰球 (FTM/A)</th>
                <th className="py-3.5 px-2.5 font-semibold text-right">籃板</th>
                <th className="py-3.5 px-2.5 font-semibold text-right">助攻</th>
                <th className="py-3.5 px-2.5 font-semibold text-right">抄截</th>
                <th className="py-3.5 px-2.5 font-semibold text-right">阻攻</th>
                <th className="py-3.5 px-2.5 font-semibold text-right">失誤</th>
                <th className="py-3.5 px-2.5 font-semibold text-right">+/-</th>
                <th className="py-3.5 px-3 font-semibold text-right text-amber-400">eFG%</th>
                <th className="py-3.5 px-3 font-semibold text-right text-amber-400">TS%</th>
                <th className="py-3.5 px-3 font-semibold text-right text-emerald-400">USG%</th>
                <th className="py-3.5 px-3 font-semibold text-right text-emerald-400">GmSc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cardBorder/60 font-mono">
              {activePlayers.map((p) => {
                const didPlay = p.seconds > 0;
                return (
                  <tr
                    key={p.id}
                    className="hover:bg-gray-800/50 transition-colors group"
                  >
                    <td className="py-3 px-3 sticky left-0 bg-card group-hover:bg-gray-800/80 font-sans font-bold text-white">
                      <div className="flex items-center space-x-2">
                        <span className="text-gray-500 text-xs font-mono w-5">
                          {p.jersey_number ? `#${p.jersey_number}` : '-'}
                        </span>
                        <span>{p.player_name}</span>
                        {p.identity && p.identity.includes('洋將') && (
                          <span className="text-[10px] px-1 rounded bg-blue-500/20 text-blue-300">
                            洋
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-2.5 text-gray-400">{p.minutes || '00:00'}</td>
                    <td className="py-3 px-2.5 text-right font-bold text-white">
                      {didPlay ? p.pts : '-'}
                    </td>
                    <td className="py-3 px-2.5 text-right text-gray-300">
                      {didPlay ? `${p.fgm}/${p.fga}` : '-'}
                    </td>
                    <td className="py-3 px-2.5 text-right text-gray-300">
                      {didPlay ? `${p.tpm}/${p.tpa}` : '-'}
                    </td>
                    <td className="py-3 px-2.5 text-right text-gray-300">
                      {didPlay ? `${p.ftm}/${p.fta}` : '-'}
                    </td>
                    <td className="py-3 px-2.5 text-right text-gray-300">
                      {didPlay ? p.reb : '-'}
                    </td>
                    <td className="py-3 px-2.5 text-right text-gray-300">
                      {didPlay ? p.ast : '-'}
                    </td>
                    <td className="py-3 px-2.5 text-right text-gray-300">
                      {didPlay ? p.stl : '-'}
                    </td>
                    <td className="py-3 px-2.5 text-right text-gray-300">
                      {didPlay ? p.blk : '-'}
                    </td>
                    <td className="py-3 px-2.5 text-right text-gray-300">
                      {didPlay ? p.tov : '-'}
                    </td>
                    <td
                      className={`py-3 px-2.5 text-right font-bold ${
                        p.plus_minus > 0
                          ? 'text-emerald-400'
                          : p.plus_minus < 0
                          ? 'text-red-400'
                          : 'text-gray-400'
                      }`}
                    >
                      {didPlay ? (p.plus_minus > 0 ? `+${p.plus_minus}` : p.plus_minus) : '-'}
                    </td>
                    <td className="py-3 px-3 text-right text-amber-300">
                      {didPlay ? `${(p.efg_pct * 100).toFixed(1)}%` : '-'}
                    </td>
                    <td className="py-3 px-3 text-right text-amber-300">
                      {didPlay ? `${(p.ts_pct * 100).toFixed(1)}%` : '-'}
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-300 font-bold">
                      {didPlay ? `${p.usg_pct.toFixed(1)}%` : '-'}
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-300 font-bold">
                      {didPlay ? p.gmsc.toFixed(1) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Swords,
  ShieldAlert,
  TrendingUp,
  Target,
  Calendar,
  Trophy,
} from 'lucide-react';
import TacticalPlaybookBoard, { TacticalScenario } from '@/components/TacticalPlaybookBoard';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const TEAM_LOGO_MAP: Record<string, string> = {
  新北國王: 'kings',
  臺北台新戰神: 'mars',
  新北中信特攻: 'dea',
  桃園台啤永豐雲豹: 'leopards',
  新竹御嵿攻城獅: 'lioneers',
  福爾摩沙夢想家: 'dreamers',
  高雄全家海神: 'aquas',
};

const SEVEN_TEAMS_SHOWCASE = [
  { name: '新北國王', logo: '/logos/kings.jpg', mascot: '/mascots/Hiro.jpg', color: '#FBBF24' },
  { name: '臺北台新戰神', logo: '/logos/mars.jpg', mascot: '/mascots/Richart.jpg', color: '#F43F5E' },
  { name: '新北中信特攻', logo: '/logos/dea.jpg', mascot: '/mascots/Thunder.jpg', color: '#F59E0B' },
  { name: '桃園台啤永豐雲豹', logo: '/logos/leopards.jpg', mascot: '/mascots/LeopardBro.jpg', color: '#10B981' },
  { name: '新竹御嵿攻城獅', logo: '/logos/lioneers.jpg', mascot: '/mascots/Ready.jpg', color: '#A855F7' },
  { name: '福爾摩沙夢想家', logo: '/logos/dreamers.jpg', mascot: '/mascots/Unicorn.jpg', color: '#22C55E' },
  { name: '高雄全家海神', logo: '/logos/aquas.jpg', mascot: '/mascots/Brownie.jpg', color: '#38BDF8' },
];

function SafeShowcaseImg({
  src,
  fallbackSrc,
  alt,
  className,
}: {
  src: string;
  fallbackSrc?: string;
  alt: string;
  className?: string;
}) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [hidden, setHidden] = useState(false);

  if (hidden) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[11px] font-black text-gray-400">
        {alt.slice(-2)}
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      onError={() => {
        if (fallbackSrc && currentSrc !== fallbackSrc) {
          setCurrentSrc(fallbackSrc);
        } else {
          setHidden(true);
        }
      }}
    />
  );
}

interface PreviewIndexItem {
  slug: string;
  game_date: string;
  game_label: string;
  season_stage: string;
  home_team: string;
  away_team: string;
  headline: string;
  subheadline: string;
  home_win_prob: number;
  away_win_prob: number;
  generated_at: string;
  model_used: string;
}

interface TeamMetricsSummary {
  record: string;
  games_played: number;
  pace: number;
  ortg: number;
  drtg: number;
  net_rtg: number;
  efg_pct: number;
  three_par: number;
  tov_pct: number;
  orb_pct: number;
  ftr: number;
  recent_ppg: number;
  recent_opp_ppg: number;
  high_usg_core: string;
  high_eff_finisher: string;
}

interface WeeklyPreviewReport {
  slug: string;
  game_date: string;
  game_label: string;
  season_stage: string;
  home_team: string;
  away_team: string;
  generated_at: string;
  model_used: string;
  headline: string;
  subheadline: string;
  home_win_prob: number;
  away_win_prob: number;
  home_summary: TeamMetricsSummary;
  away_summary: TeamMetricsSummary;
  home_roster: string[];
  away_roster: string[];
  situation_analysis: {
    overview: string;
    home_illusion_vs_reality: {
      team_name: string;
      data_illusion: string;
      real_flaw: string;
    };
    away_illusion_vs_reality: {
      team_name: string;
      data_illusion: string;
      real_flaw: string;
    };
  };
  key_matchups: {
    category: string;
    title: string;
    home_player: string;
    away_player: string;
    stat_comparison: string;
    analysis: string;
  }[];
  tactical_scenarios: TacticalScenario[];
  x_factors_and_prediction: {
    home_x_factor: { player: string; role_tag: string; reason: string };
    away_x_factor: { player: string; role_tag: string; reason: string };
    predicted_home_score: number;
    predicted_away_score: number;
    predicted_margin_range: string;
    fun_prediction_verdict: string;
    home_win_conditions: string[];
    away_win_conditions: string[];
  };
}

function TeamBadge({ teamName, accentColor }: { teamName: string; accentColor: string }) {
  const fileBase = TEAM_LOGO_MAP[teamName] || 'tpbl';
  const [ext, setExt] = useState<'jpg' | 'png'>('jpg');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setExt('jpg');
    setFailed(false);
  }, [teamName]);

  if (failed) {
    return (
      <div
        className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#0E1117] border flex items-center justify-center font-black text-sm shadow-lg"
        style={{ borderColor: accentColor, color: accentColor }}
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
        onError={() => {
          if (ext === 'jpg') setExt('png');
          else setFailed(true);
        }}
      />
    </div>
  );
}

export default function WeeklyPreviewPage() {
  const [items, setItems] = useState<PreviewIndexItem[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [report, setReport] = useState<WeeklyPreviewReport | null>(null);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  const loadIndex = async () => {
    setLoadingList(true);
    try {
      const res = await fetch(`${API_BASE}/api/weekly-previews`);
      if (res.ok) {
        const data = await res.json();
        const list: PreviewIndexItem[] = data.items || [];
        setItems(list);
        if (list.length > 0 && !selectedSlug) {
          setSelectedSlug(list[0].slug);
        }
        setLoadingList(false);
        return;
      }
    } catch {
      // Fallback to static public JSON
    }

    try {
      const staticRes = await fetch('/weekly_previews/index.json');
      if (staticRes.ok) {
        const list: PreviewIndexItem[] = await staticRes.json();
        setItems(list);
        if (list.length > 0 && !selectedSlug) {
          setSelectedSlug(list[0].slug);
        }
      }
    } catch {
      // Ignore
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadIndex();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedSlug) return;
    let cancelled = false;
    setLoadingDetail(true);

    const fetchDetail = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/weekly-previews/${selectedSlug}`);
        if (res.ok) {
          const data: WeeklyPreviewReport = await res.json();
          if (!cancelled) {
            setReport(data);
            setLoadingDetail(false);
          }
          return;
        }
      } catch {
        // Fallback to static public JSON
      }

      try {
        const staticRes = await fetch(`/weekly_previews/${selectedSlug}.json`);
        if (staticRes.ok) {
          const data: WeeklyPreviewReport = await staticRes.json();
          if (!cancelled) setReport(data);
        }
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    };

    fetchDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedSlug]);

  return (
    <div className="min-h-screen bg-[#0E1117] text-gray-100 pb-16">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-8">
        {/* Top Bar: Featured Matchups Switcher */}
        <section className="bg-[#161B22] border border-[#30363D] rounded-2xl p-4 sm:p-5 shadow-xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#FF9100]">
                <Sparkles className="w-4 h-4" />
                <span>TPBL Weekly AI Scouting & Fun Predictions</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white mt-1">
                本週比賽有趣預測｜進階數據深度球探報告
              </h1>
            </div>
          </div>

          {/* Matchup Tabs */}
          <div className="mt-4 flex flex-wrap gap-2">
            {loadingList ? (
              <div className="text-xs text-gray-400 flex items-center gap-2 py-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#FF9100]" />
                <span>載入本週焦點對戰清單中...</span>
              </div>
            ) : (
              items.map((item) => {
                const active = item.slug === selectedSlug;
                return (
                  <button
                    key={item.slug}
                    type="button"
                    onClick={() => setSelectedSlug(item.slug)}
                    className={`px-4 py-2.5 rounded-xl border text-left transition-all ${
                      active
                        ? 'bg-[#FF9100]/15 border-[#FF9100] text-white shadow-lg shadow-[#FF9100]/10'
                        : 'bg-[#0E1117] border-[#21262D] text-gray-400 hover:text-white hover:border-[#30363D]'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-[11px] font-mono text-[#00E676]">
                      <Calendar className="w-3 h-3" />
                      <span>{item.game_date}</span>
                      <span className="text-gray-500">·</span>
                      <span className="text-gray-300">{item.game_label}</span>
                    </div>
                    <div className="text-sm font-black mt-0.5">
                      {item.home_team} <span className="text-[#FF9100] text-xs">vs</span> {item.away_team}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {loadingDetail && (
          <div className="bg-[#161B22] border border-[#30363D] rounded-2xl p-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#FF9100]" />
            <span className="text-sm text-gray-400">正在載入深度球探報告...</span>
          </div>
        )}

        {/* 休兵戰情室 / 空版狀態 (Empty State) */}
        {!loadingList && !loadingDetail && (!report || items.length === 0) && (
          <section className="relative overflow-hidden bg-gradient-to-br from-[#161B22] via-[#11161F] to-[#0E1117] border border-[#30363D] rounded-3xl p-8 sm:p-12 shadow-2xl text-center">
            {/* 半透明戰術球場背景線條 */}
            <svg
              viewBox="0 0 500 300"
              className="absolute inset-0 w-full h-full opacity-[0.07] pointer-events-none"
              preserveAspectRatio="xMidYMid slice"
            >
              <rect x="25" y="15" width="450" height="270" fill="none" stroke="#FF9100" strokeWidth="2" />
              <rect x="176" y="140" width="148" height="145" fill="none" stroke="#FF9100" strokeWidth="2" />
              <circle cx="250" cy="140" r="54" fill="none" stroke="#FF9100" strokeWidth="2" />
              <path d="M 48 285 A 202 202 0 0 1 452 285" fill="none" stroke="#00E676" strokeWidth="2" />
            </svg>

            <div className="relative z-10 max-w-4xl mx-auto space-y-6">
              {/* TPBL 官方 Logo */}
              <div className="mx-auto w-20 h-20 rounded-2xl bg-white p-1.5 shadow-xl shadow-[#FF9100]/20 border border-[#30363D] overflow-hidden">
                <SafeShowcaseImg
                  src="/logos/tpbl.jpg"
                  fallbackSrc="/logos/logo_all.jpg"
                  alt="TPBL"
                  className="w-full h-full object-contain"
                />
              </div>

              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF9100]/15 border border-[#FF9100]/40 text-[#FF9100] text-xs font-bold mb-3">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>TPBL 休兵戰情室・Off-Day War Room</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-white">
                  本週焦點戰役球探報告・戰術板推演準備中
                </h2>
                <p className="text-sm text-gray-400 mt-2 max-w-2xl mx-auto">
                  聯盟本週焦點賽事之進階數據拆解與互動式 SVG 戰術推演即將上線，您可先前往對決模擬器自訂先發陣容，或檢視 7 隊最新四要素戰力榜。
                </p>
              </div>

              {/* 7 支球隊隊徽與吉祥物環繞陣列 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 pt-2">
                {SEVEN_TEAMS_SHOWCASE.map((team) => (
                  <div
                    key={team.name}
                    className="bg-[#0E1117]/90 border border-[#21262D] hover:border-[#30363D] rounded-2xl p-3 flex flex-col items-center gap-2 transition-all"
                  >
                    <div className="relative w-14 h-14 rounded-xl bg-[#161B22] border border-[#30363D] p-1.5 overflow-hidden">
                      <SafeShowcaseImg
                        src={team.logo}
                        fallbackSrc={team.mascot}
                        alt={team.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <span className="text-[11px] font-bold text-gray-200 truncate w-full text-center">
                      {team.name.slice(-2)}
                    </span>
                  </div>
                ))}
              </div>

              {/* CTA 按鈕 */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
                <Link
                  href="/matchup"
                  className="px-6 py-3 rounded-xl bg-[#FF9100] hover:bg-[#FFA726] text-black font-black text-sm flex items-center gap-2 transition-colors shadow-lg shadow-[#FF9100]/20"
                >
                  <Swords className="w-4 h-4" />
                  <span>前往對決模擬器自訂先發推演</span>
                </Link>
                <Link
                  href="/"
                  className="px-6 py-3 rounded-xl bg-[#161B22] hover:bg-[#21262D] border border-[#30363D] text-white font-bold text-sm flex items-center gap-2 transition-colors"
                >
                  <Trophy className="w-4 h-4 text-[#00E676]" />
                  <span>檢視 7 隊進階數據總覽</span>
                </Link>
              </div>
            </div>
          </section>
        )}

        {report && !loadingDetail && (
          <>
            {/* HERO: 雙隊戰力與模型勝率看板 */}
            <section className="relative overflow-hidden bg-gradient-to-br from-[#161B22] via-[#121720] to-[#0E1117] border border-[#30363D] rounded-2xl p-6 sm:p-8 shadow-2xl">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400 mb-4">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#FF9100]/15 text-[#FF9100] border border-[#FF9100]/40 font-bold">
                    {report.game_label}
                  </span>
                  <span className="font-mono">{report.game_date}</span>
                  <span>·</span>
                  <span>{report.season_stage}</span>
                </div>
                <div className="text-[11px] font-mono text-gray-500">
                  Engine: {report.model_used}
                </div>
              </div>

              <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                {report.headline}
              </h2>
              <p className="text-sm sm:text-base text-gray-300 mt-2">{report.subheadline}</p>

              {/* Teams Matchup Banner */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-11 gap-4 items-center">
                {/* Home Team */}
                <div className="md:col-span-5 bg-[#0E1117]/90 border border-[#FF9100]/30 rounded-2xl p-4 flex items-center gap-4">
                  <TeamBadge teamName={report.home_team} accentColor="#FF9100" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold text-[#FF9100] uppercase">HOME 主隊</div>
                    <div className="text-lg font-black text-white truncate">{report.home_team}</div>
                    <div className="text-xs text-gray-400 mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono">
                      <span>戰績 {report.home_summary.record}</span>
                      <span>NetRtg {report.home_summary.net_rtg > 0 ? `+${report.home_summary.net_rtg}` : report.home_summary.net_rtg}</span>
                      <span>ORtg {report.home_summary.ortg}</span>
                    </div>
                  </div>
                </div>

                {/* VS & Win Prob */}
                <div className="md:col-span-1 flex flex-col items-center justify-center py-2">
                  <span className="text-xs font-black px-2.5 py-1 rounded-full bg-[#21262D] text-gray-300">
                    VS
                  </span>
                </div>

                {/* Away Team */}
                <div className="md:col-span-5 bg-[#0E1117]/90 border border-[#38BDF8]/30 rounded-2xl p-4 flex items-center gap-4 md:flex-row-reverse md:text-right">
                  <TeamBadge teamName={report.away_team} accentColor="#38BDF8" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold text-[#38BDF8] uppercase">AWAY 客隊</div>
                    <div className="text-lg font-black text-white truncate">{report.away_team}</div>
                    <div className="text-xs text-gray-400 mt-1 flex flex-wrap md:justify-end gap-x-3 gap-y-1 font-mono">
                      <span>戰績 {report.away_summary.record}</span>
                      <span>NetRtg {report.away_summary.net_rtg > 0 ? `+${report.away_summary.net_rtg}` : report.away_summary.net_rtg}</span>
                      <span>ORtg {report.away_summary.ortg}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Win Probability Bar */}
              <div className="mt-6">
                <div className="flex items-center justify-between text-xs font-bold mb-2">
                  <span className="text-[#FF9100]">
                    {report.home_team} 模型勝率 {report.home_win_prob}%
                  </span>
                  <span className="text-[#38BDF8]">
                    {report.away_team} 模型勝率 {report.away_win_prob}%
                  </span>
                </div>
                <div className="w-full h-3.5 rounded-full bg-[#0E1117] border border-[#30363D] overflow-hidden flex">
                  <div
                    className="h-full bg-gradient-to-r from-[#FF9100] to-[#FFB300] transition-all duration-500"
                    style={{ width: `${report.home_win_prob}%` }}
                  />
                  <div
                    className="h-full bg-gradient-to-r from-[#0284C7] to-[#38BDF8] transition-all duration-500"
                    style={{ width: `${report.away_win_prob}%` }}
                  />
                </div>
              </div>
            </section>

            {/* 01 賽前局勢與數據假象拆解 */}
            <section className="bg-[#161B22] border border-[#30363D] rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded-lg bg-[#FF9100]/15 text-[#FF9100] font-mono font-black text-xs border border-[#FF9100]/40">
                  01
                </span>
                <h3 className="text-xl font-black text-white">賽前局勢與數據假象拆解</h3>
              </div>

              <p className="text-sm text-gray-300 leading-relaxed bg-[#0E1117] border border-[#21262D] rounded-xl p-4">
                {report.situation_analysis.overview}
              </p>

              {/* Four Factors Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: 'eFG% 有效命中', h: `${report.home_summary.efg_pct}%`, a: `${report.away_summary.efg_pct}%` },
                  { label: 'TOV% 失誤率', h: `${report.home_summary.tov_pct}%`, a: `${report.away_summary.tov_pct}%` },
                  { label: 'ORB% 進攻籃板', h: `${report.home_summary.orb_pct}%`, a: `${report.away_summary.orb_pct}%` },
                  { label: 'FTR 罰球率', h: `${report.home_summary.ftr}%`, a: `${report.away_summary.ftr}%` },
                  { label: 'Pace 節奏', h: `${report.home_summary.pace}`, a: `${report.away_summary.pace}` },
                ].map((m) => (
                  <div key={m.label} className="bg-[#0E1117] border border-[#21262D] rounded-xl p-3 text-center">
                    <div className="text-[11px] text-gray-400 font-bold mb-1.5">{m.label}</div>
                    <div className="flex items-center justify-center gap-2 font-mono text-sm font-black">
                      <span className="text-[#FF9100]">{m.h}</span>
                      <span className="text-gray-600 text-xs">/</span>
                      <span className="text-[#38BDF8]">{m.a}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Illusion vs Reality */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { item: report.situation_analysis.home_illusion_vs_reality, color: '#FF9100' },
                  { item: report.situation_analysis.away_illusion_vs_reality, color: '#38BDF8' },
                ].map(({ item, color }) => (
                  <div key={item.team_name} className="bg-[#0E1117] border border-[#21262D] rounded-xl p-4 space-y-3">
                    <div className="font-black text-base" style={{ color }}>
                      {item.team_name}｜表面數據 vs 真實體質
                    </div>
                    <div className="bg-[#161B22] border border-[#21262D] rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 mb-1">
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>數據假象 (Illusion)</span>
                      </div>
                      <p className="text-xs text-gray-300 leading-relaxed">{item.data_illusion}</p>
                    </div>
                    <div className="bg-[#161B22] border border-[#21262D] rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400 mb-1">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>真實短板 (Reality)</span>
                      </div>
                      <p className="text-xs text-gray-300 leading-relaxed">{item.real_flaw}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 02 三大關鍵對位卡片 */}
            <section className="bg-[#161B22] border border-[#30363D] rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded-lg bg-[#00E676]/15 text-[#00E676] font-mono font-black text-xs border border-[#00E676]/40">
                  02
                </span>
                <h3 className="text-xl font-black text-white">三大關鍵對位焦點</h3>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {report.key_matchups.map((km, idx) => (
                  <div
                    key={idx}
                    className="bg-[#0E1117] border border-[#21262D] hover:border-[#30363D] rounded-xl p-5 flex flex-col justify-between gap-3 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[11px] font-black px-2 py-0.5 rounded bg-[#161B22] text-[#00E676] border border-[#00E676]/30">
                          {km.category}
                        </span>
                        <Swords className="w-4 h-4 text-gray-500" />
                      </div>
                      <h4 className="text-base font-black text-white">{km.title}</h4>
                      <div className="mt-3 flex items-center justify-between text-xs font-bold bg-[#161B22] border border-[#21262D] rounded-lg px-3 py-2">
                        <span className="text-[#FF9100]">{km.home_player}</span>
                        <span className="text-gray-500">VS</span>
                        <span className="text-[#38BDF8]">{km.away_player}</span>
                      </div>
                      <div className="mt-2 text-[11px] font-mono text-amber-300 bg-amber-950/20 border border-amber-800/30 rounded-lg px-3 py-1.5">
                        {km.stat_comparison}
                      </div>
                      <p className="mt-3 text-xs text-gray-300 leading-relaxed">{km.analysis}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 03 互動式 SVG 半場戰術板 */}
            <TacticalPlaybookBoard
              homeTeam={report.home_team}
              awayTeam={report.away_team}
              homeRoster={report.home_roster}
              awayRoster={report.away_roster}
              scenarios={report.tactical_scenarios}
              title="03 互動式 SVG 半場戰術板｜雙隊互有攻守 AI 推演"
              subtitle="4 套針對本場對位打造的攻防劇本，點擊上方頁籤切換攻守視角並即時播放動畫"
            />

            {/* 04 X 因子與最終勝負劇本預測 */}
            <section className="bg-[#161B22] border border-[#30363D] rounded-2xl p-6 shadow-xl space-y-6">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded-lg bg-[#38BDF8]/15 text-[#38BDF8] font-mono font-black text-xs border border-[#38BDF8]/40">
                  04
                </span>
                <h3 className="text-xl font-black text-white">X 因子與最終趣味勝負預測</h3>
              </div>

              {/* X Factors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#0E1117] border border-[#FF9100]/30 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-[#FF9100] flex items-center gap-1.5">
                      <Flame className="w-4 h-4" />
                      主隊 X 因子｜{report.x_factors_and_prediction.home_x_factor.player}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-[#161B22] text-gray-300 border border-[#30363D]">
                      {report.x_factors_and_prediction.home_x_factor.role_tag}
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    {report.x_factors_and_prediction.home_x_factor.reason}
                  </p>
                </div>

                <div className="bg-[#0E1117] border border-[#38BDF8]/30 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-[#38BDF8] flex items-center gap-1.5">
                      <Flame className="w-4 h-4" />
                      客隊 X 因子｜{report.x_factors_and_prediction.away_x_factor.player}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-[#161B22] text-gray-300 border border-[#30363D]">
                      {report.x_factors_and_prediction.away_x_factor.role_tag}
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    {report.x_factors_and_prediction.away_x_factor.reason}
                  </p>
                </div>
              </div>

              {/* Final Score Prediction Box */}
              <div className="bg-gradient-to-r from-[#0E1117] via-[#151C28] to-[#0E1117] border border-[#FF9100]/40 rounded-2xl p-6 text-center space-y-3">
                <div className="text-xs font-bold uppercase tracking-widest text-[#FF9100]">
                  AI 趣味比分與分差劇本預測
                </div>
                <div className="flex items-center justify-center gap-6 sm:gap-10">
                  <div>
                    <div className="text-xs text-gray-400">{report.home_team}</div>
                    <div className="text-4xl sm:text-5xl font-black font-mono text-[#FF9100]">
                      {report.x_factors_and_prediction.predicted_home_score}
                    </div>
                  </div>
                  <div className="text-xl font-black text-gray-500">:</div>
                  <div>
                    <div className="text-xs text-gray-400">{report.away_team}</div>
                    <div className="text-4xl sm:text-5xl font-black font-mono text-[#38BDF8]">
                      {report.x_factors_and_prediction.predicted_away_score}
                    </div>
                  </div>
                </div>
                <div className="inline-block px-3 py-1 rounded-full bg-[#161B22] border border-[#30363D] text-xs font-bold text-[#00E676]">
                  預估分差區間：{report.x_factors_and_prediction.predicted_margin_range}
                </div>
                <p className="text-sm text-gray-200 max-w-3xl mx-auto leading-relaxed pt-1">
                  {report.x_factors_and_prediction.fun_prediction_verdict}
                </p>
              </div>

              {/* Win Conditions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#0E1117] border border-[#21262D] rounded-xl p-4">
                  <div className="flex items-center gap-2 text-sm font-black text-[#FF9100] mb-3">
                    <Target className="w-4 h-4" />
                    <span>{report.home_team} 贏球必要條件</span>
                  </div>
                  <ul className="space-y-2">
                    {report.x_factors_and_prediction.home_win_conditions.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                        <CheckCircle2 className="w-4 h-4 text-[#00E676] shrink-0 mt-0.5" />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-[#0E1117] border border-[#21262D] rounded-xl p-4">
                  <div className="flex items-center gap-2 text-sm font-black text-[#38BDF8] mb-3">
                    <Target className="w-4 h-4" />
                    <span>{report.away_team} 贏球必要條件</span>
                  </div>
                  <ul className="space-y-2">
                    {report.x_factors_and_prediction.away_win_conditions.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                        <AlertTriangle className="w-4 h-4 text-[#38BDF8] shrink-0 mt-0.5" />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

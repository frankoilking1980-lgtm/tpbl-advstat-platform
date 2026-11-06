'use client';

import React, { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useStage } from '@/context/StageContext';
import { fetcher } from '@/lib/api';
import ScoreBanner from '@/components/ScoreBanner';
import { PlayerLink } from '@/components/PlayerLink';
import {
  Calendar,
  Swords,
  Users,
  Zap,
  Crosshair,
  Table2,
  RefreshCw,
  Filter,
  BarChart3,
  SlidersHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type {
  GameListItem,
  DetailedGameData,
  MetricComparisonItem,
  GameMetrics11,
  BoxScorePlayer,
  GameLineupItem,
  GameTacticItem,
} from '@/types/game';

/* ------------------------------------------------------------------ */
/* 指標計算 / 格式化                                                   */
/* ------------------------------------------------------------------ */

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const toNum = (v: unknown): number => (isNum(v) ? v : 0);
const fx = (v: unknown, d = 1): string => (isNum(v) ? v.toFixed(d) : '-');

const smartPctStr = (v: unknown, d = 1): string => {
  if (v === undefined || v === null || v === '' || v === '-') return '-';
  const num = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(num)) return '-';
  const finalVal = Math.abs(num) > 2 ? num : num * 100;
  return `${finalVal.toFixed(d)}%`;
};

const pctStr = (v: unknown, d = 1): string => (isNum(v) ? `${v.toFixed(d)}%` : '-');
const pct1 = (v: number) => pctStr(v, 1);
const num1 = (v: number) => fx(v, 1);

const signed = (n: number | null | undefined, d = 1): string =>
  isNum(n) ? `${n > 0 ? '+' : ''}${n.toFixed(d)}` : '-';
const signColor = (n: number | null | undefined): string =>
  !isNum(n) ? 'text-gray-400' : n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-gray-400';

function deriveMetrics11(players: BoxScorePlayer[], away: string, home: string): GameMetrics11 | undefined {
  const sum = (team: string) => {
    const ps = players.filter((p) => p.team_name === team);
    const t = { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, tov: 0 };
    ps.forEach((p) => {
      t.pts += p.pts || 0;
      t.fgm += p.fgm || 0;
      t.fga += p.fga || 0;
      t.tpm += p.tpm || 0;
      t.tpa += p.tpa || 0;
      t.ftm += p.ftm || 0;
      t.fta += p.fta || 0;
      t.orb += p.orb || 0;
      t.drb += p.drb || 0;
      t.tov += p.tov || 0;
    });
    return t;
  };
  const a = sum(away);
  const h = sum(home);
  if (a.fga + h.fga === 0) return undefined;

  const poss = (t: typeof a) => t.fga + 0.44 * t.fta - t.orb + t.tov;
  const aPoss = poss(a);
  const hPoss = poss(h);
  const safe = (n: number, d: number) => (d > 0 ? n / d : 0);
  const efg = (t: typeof a) => safe(t.fgm + 0.5 * t.tpm, t.fga) * 100;
  const tov = (t: typeof a) => safe(t.tov, t.fga + 0.44 * t.fta + t.tov) * 100;

  return {
    ortg: { away: safe(a.pts, aPoss) * 100, home: safe(h.pts, hPoss) * 100 },
    drtg: { away: safe(h.pts, hPoss) * 100, home: safe(a.pts, aPoss) * 100 },
    possessions: { away: aPoss, home: hPoss },
    efg_pct: { away: efg(a), home: efg(h) },
    tov_pct: { away: tov(a), home: tov(h) },
    orb_pct: { away: safe(a.orb, a.orb + h.drb) * 100, home: safe(h.orb, h.orb + a.drb) * 100 },
    threepar: { away: safe(a.tpa, a.fga) * 100, home: safe(h.tpa, h.fga) * 100 },
    ftr: { away: safe(a.fta, a.fga) * 100, home: safe(h.fta, h.fga) * 100 },
    fgm_a: { away_made: a.fgm, away_att: a.fga, home_made: h.fgm, home_att: h.fga },
    tpm_a: { away_made: a.tpm, away_att: a.tpa, home_made: h.tpm, home_att: h.tpa },
    ftm_a: { away_made: a.ftm, away_att: a.fta, home_made: h.ftm, home_att: h.fta },
  };
}

type PairIn = { away?: number | null; home?: number | null } | null | undefined;
type MAIn = { away_made?: number | null; away_att?: number | null; home_made?: number | null; home_att?: number | null } | null | undefined;
const normPair = (p: PairIn) => ({ away: toNum(p?.away), home: toNum(p?.home) });
const normMA = (p: MAIn) => ({
  away_made: toNum(p?.away_made), away_att: toNum(p?.away_att),
  home_made: toNum(p?.home_made), home_att: toNum(p?.home_att),
});

function normalizeMetrics(raw: Partial<Record<keyof GameMetrics11, unknown>>): GameMetrics11 {
  return {
    ortg: normPair(raw.ortg as PairIn), drtg: normPair(raw.drtg as PairIn),
    possessions: normPair(raw.possessions as PairIn), efg_pct: normPair(raw.efg_pct as PairIn),
    tov_pct: normPair(raw.tov_pct as PairIn), orb_pct: normPair(raw.orb_pct as PairIn),
    threepar: normPair(raw.threepar as PairIn), ftr: normPair(raw.ftr as PairIn),
    fgm_a: normMA(raw.fgm_a as MAIn), tpm_a: normMA(raw.tpm_a as MAIn), ftm_a: normMA(raw.ftm_a as MAIn),
  };
}

function buildMetricItems(rawMetrics: GameMetrics11): MetricComparisonItem[] {
  const m = normalizeMetrics(rawMetrics as unknown as Partial<Record<keyof GameMetrics11, unknown>>);
  const ratio = (made: number, att: number) => (att > 0 ? (made / att) * 100 : 0);
  return [
    { id: 'ortg', label: '進攻效率', code: 'ORtg', subLabel: '每百回合得分', awayVal: m.ortg.away, homeVal: m.ortg.home, format: num1, higherIsBetter: true, category: 'rating' },
    { id: 'drtg', label: '防守效率', code: 'DRtg', subLabel: '每百回合失分', awayVal: m.drtg.away, homeVal: m.drtg.home, format: num1, higherIsBetter: false, category: 'rating' },
    { id: 'poss', label: '回合數', code: 'Possessions', subLabel: '比賽節奏', awayVal: m.possessions.away, homeVal: m.possessions.home, format: num1, higherIsBetter: true, category: 'rating' },
    { id: 'efg', label: '有效命中率', code: 'eFG%', subLabel: '投籃效率基礎', awayVal: m.efg_pct.away, homeVal: m.efg_pct.home, format: pct1, higherIsBetter: true, category: 'four_factors' },
    { id: 'tov', label: '失誤率', code: 'TOV%', subLabel: '球權保護', awayVal: m.tov_pct.away, homeVal: m.tov_pct.home, format: pct1, higherIsBetter: false, category: 'four_factors' },
    { id: 'orb', label: '進攻籃板率', code: 'ORB%', subLabel: '二次進攻機會', awayVal: m.orb_pct.away, homeVal: m.orb_pct.home, format: pct1, higherIsBetter: true, category: 'four_factors' },
    { id: 'ftr', label: '罰球率', code: 'FTr', subLabel: 'FTA / FGA', awayVal: m.ftr.away, homeVal: m.ftr.home, format: pct1, higherIsBetter: true, category: 'four_factors' },
    { id: '3par', label: '三分出手比重', code: '3PAr', subLabel: '3PA / FGA', awayVal: m.threepar.away, homeVal: m.threepar.home, format: pct1, higherIsBetter: true, category: 'shooting' },
    {
      id: 'fg', label: '投籃', code: 'FGM/A', subLabel: '出手與命中',
      awayVal: ratio(m.fgm_a.away_made, m.fgm_a.away_att), homeVal: ratio(m.fgm_a.home_made, m.fgm_a.home_att),
      awayDisplay: `${m.fgm_a.away_made}/${m.fgm_a.away_att}`, homeDisplay: `${m.fgm_a.home_made}/${m.fgm_a.home_att}`,
      format: pct1, higherIsBetter: true, category: 'shooting',
    },
    {
      id: '3p', label: '三分', code: '3PM/A', subLabel: '外線出手與命中',
      awayVal: ratio(m.tpm_a.away_made, m.tpm_a.away_att), homeVal: ratio(m.tpm_a.home_made, m.tpm_a.home_att),
      awayDisplay: `${m.tpm_a.away_made}/${m.tpm_a.away_att}`, homeDisplay: `${m.tpm_a.home_made}/${m.tpm_a.home_att}`,
      format: pct1, higherIsBetter: true, category: 'shooting',
    },
    {
      id: 'ft', label: '罰球', code: 'FTM/A', subLabel: '罰球出手與命中',
      awayVal: ratio(m.ftm_a.away_made, m.ftm_a.away_att), homeVal: ratio(m.ftm_a.home_made, m.ftm_a.home_att),
      awayDisplay: `${m.ftm_a.away_made}/${m.ftm_a.away_att}`, homeDisplay: `${m.ftm_a.home_made}/${m.ftm_a.home_att}`,
      format: pct1, higherIsBetter: true, category: 'shooting',
    },
  ];
}

/* ------------------------------------------------------------------ */
/* 基礎標題 / 外框元件                                                 */
/* ------------------------------------------------------------------ */

function SectionTitle({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-cardBorder/80 pb-3">
      <div className="flex items-center space-x-2.5">
        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">{icon}</div>
        <h2 className="text-xl font-black text-white tracking-tight">{title}</h2>
      </div>
      {hint && <span className="text-xs text-gray-400">{hint}</span>}
    </div>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="p-6 rounded-2xl border border-cardBorder bg-card/40 text-center text-sm text-gray-500">{text}</div>
  );
}

function MetricsPanel({ items, away, home }: { items: MetricComparisonItem[]; away: string; home: string }) {
  return (
    <div className="rounded-3xl border border-cardBorder bg-card/60 p-6 shadow-xl">
      <div className="flex items-center justify-between mb-6 pb-3 border-b border-cardBorder/60">
        <div className="flex items-center space-x-2">
          <Zap className="w-5 h-5 text-amber-400" />
          <h3 className="text-lg font-bold text-white">攻防對決條 (11 項指標)</h3>
        </div>
        <div className="flex items-center space-x-3 text-xs font-semibold">
          <span className="text-amber-400">{away}</span>
          <span className="text-gray-500">vs</span>
          <span className="text-emerald-400">{home}</span>
        </div>
      </div>
      <div className="space-y-5">
        {items.map((item) => {
          const awayBetter = item.higherIsBetter ? item.awayVal > item.homeVal : item.awayVal < item.homeVal;
          const homeBetter = item.higherIsBetter ? item.homeVal > item.awayVal : item.homeVal < item.awayVal;
          const total = item.awayVal + item.homeVal;
          const awayPct = total > 0 ? (item.awayVal / total) * 100 : 50;
          return (
            <div key={item.id} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className={`font-mono font-bold ${awayBetter ? 'text-amber-400' : 'text-gray-400'}`}>
                  {item.awayDisplay ?? item.format(item.awayVal)}
                  {item.awayDisplay && <span className="ml-1 text-[10px] opacity-70">({item.format(item.awayVal)})</span>}
                </span>
                <span className="text-center">
                  <span className="text-gray-200 font-semibold">{item.code}</span>
                  <span className="ml-2 text-[11px] text-gray-500">{item.label}・{item.subLabel}</span>
                </span>
                <span className={`font-mono font-bold ${homeBetter ? 'text-emerald-400' : 'text-gray-400'}`}>
                  {item.homeDisplay ?? item.format(item.homeVal)}
                  {item.homeDisplay && <span className="ml-1 text-[10px] opacity-70">({item.format(item.homeVal)})</span>}
                </span>
              </div>
              <div className="h-3 w-full bg-gray-900 rounded-full overflow-hidden flex p-0.5 border border-cardBorder/80">
                <div
                  style={{ width: `${awayPct}%` }}
                  className={`h-full rounded-l-full transition-all duration-500 ${awayBetter ? 'bg-gradient-to-r from-amber-600 to-amber-400' : 'bg-gray-700'}`}
                />
                <div
                  style={{ width: `${100 - awayPct}%` }}
                  className={`h-full rounded-r-full transition-all duration-500 ${homeBetter ? 'bg-gradient-to-l from-emerald-600 to-emerald-400' : 'bg-gray-700'}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 結構化對稱表格                                                     */
/* ------------------------------------------------------------------ */

/** 表格 1：單場最佳陣容與核心搭檔效益 */
function LineupPairTable({
  team,
  lineups,
  pairs,
  accent,
}: {
  team: string;
  lineups: GameLineupItem[];
  pairs: GameLineupItem[];
  accent: 'amber' | 'emerald';
}) {
  const head = 'py-2.5 px-2 font-semibold text-right shrink-0';
  const renderRow = (l: GameLineupItem, idx: number, isPair = false) => {
    const names = l.lineup_name ?? '-';

    return (
      <tr key={l.id ?? idx} className="hover:bg-gray-800/40 transition-colors">
        <td className="py-2.5 px-3 font-sans font-medium text-white break-words min-w-[200px]">
          {names}
        </td>
        <td className="py-2.5 px-2 text-right text-gray-400 whitespace-nowrap">{l.minutes ?? '-'}</td>
        <td className={`py-2.5 px-2 text-right font-bold whitespace-nowrap ${signColor(l.plus_minus)}`}>
          {signed(l.plus_minus, 0)}
        </td>
        <td className="py-2.5 px-2 text-right text-gray-300 whitespace-nowrap">{fx(l.ortg)}</td>
        <td className="py-2.5 px-2 text-right text-gray-300 whitespace-nowrap">{fx(l.drtg)}</td>
        <td className={`py-2.5 px-2 text-right font-bold whitespace-nowrap ${signColor(l.netrtg)}`}>
          {signed(l.netrtg)}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-2">
      <div className={`p-2.5 rounded-xl border text-xs sm:text-sm font-bold flex justify-between items-center ${
        accent === 'amber' ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
      }`}>
        <span>{accent === 'amber' ? '客隊' : '主隊'}：{team}</span>
        <span className="text-[11px] font-mono opacity-70">最佳陣容 & 搭檔效益</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-cardBorder bg-card shadow">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#1C2128] text-gray-400 uppercase font-mono border-b border-cardBorder whitespace-nowrap">
            <tr>
              <th className="py-2.5 px-3 font-semibold text-white">陣容組合 / 搭檔</th>
              <th className={head}>上場時間</th>
              <th className={head}>+/-</th>
              <th className={head}>Lineup ORtg</th>
              <th className={head}>Lineup DRtg</th>
              <th className={head}>Lineup NetRtg</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cardBorder/40 font-mono">
            {lineups.length === 0 && pairs.length === 0 ? (
              <tr><td colSpan={6} className="py-4 text-center text-gray-500 font-sans">無陣容數據</td></tr>
            ) : (
              <>
                {lineups.map((l, i) => renderRow(l, i, false))}
                {pairs.length > 0 && (
                  <tr className="bg-gray-900/60 font-sans font-bold text-gray-300">
                    <td colSpan={6} className="py-1.5 px-3 text-[11px] text-amber-400 border-t border-cardBorder">
                      核心搭檔效益 (Key Pairs)
                    </td>
                  </tr>
                )}
                {pairs.map((l, i) => renderRow(l, i, true))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 表格 2：單場主力 On/Off 淨勝分 (≥ 8分鐘) */
function PlayerOnOffTable({
  team,
  items,
  accent,
  stage,
}: {
  team: string;
  items: any[];
  accent: 'amber' | 'emerald';
  stage?: string;
}) {
  const head = 'py-2 px-2 font-semibold text-right';

  return (
    <div className="space-y-2">
      <div className={`p-2.5 rounded-xl border text-xs sm:text-sm font-bold flex justify-between items-center ${
        accent === 'amber' ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
      }`}>
        <span>{accent === 'amber' ? '客隊' : '主隊'}：{team}</span>
        <span className="text-[11px] font-mono opacity-70">On/Off 淨勝分</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-cardBorder bg-card shadow">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="bg-[#1C2128] text-gray-400 uppercase font-mono border-b border-cardBorder">
            <tr>
              <th className="py-2 px-2.5 font-semibold text-white">球員名</th>
              <th className={head}>在場時間</th>
              <th className={head}>ON_ORTG</th>
              <th className={head}>ON_DRTG</th>
              <th className={head}>ON_NETRTG</th>
              <th className={head}>OFF_NETRTG</th>
              <th className={`${head} text-amber-400`}>淨影響力(DIFF)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cardBorder/40 font-mono">
            {!items || items.length === 0 ? (
              <tr><td colSpan={7} className="py-4 text-center text-gray-500 font-sans">無 On/Off 數據</td></tr>
            ) : (
              items.map((w, idx) => {
                const name =
                  w.player_name ||
                  w.name ||
                  (Array.isArray(w.players_on) ? w.players_on[0] : null) ||
                  (typeof w.title === 'string' ? w.title.replace(' On/Off', '') : '-');

                const mins = w.minutes_on || w.minutes || w.time || '-';

                const parseVal = (v1: any, v2: any) => {
                  const val = v1 !== undefined && v1 !== null ? v1 : v2;
                  return isNum(val) ? val : (val !== null && val !== undefined && !isNaN(Number(val))) ? Number(val) : null;
                };

                const onOrtg = parseVal(w.on_ortg, w.ortg_on);
                const onDrtg = parseVal(w.on_drtg, w.drtg_on);
                const onNet = parseVal(w.on_netrtg, w.netrtg_on);
                const offNet = parseVal(w.off_netrtg, w.netrtg_off);
                const diff = parseVal(w.netrtg_diff, parseVal(w.diff, (onNet !== null && offNet !== null) ? onNet - offNet : null));

                return (
                  <tr key={w.id ?? idx} className="hover:bg-gray-800/40 transition-colors">
                    <td className="py-2 px-2.5 font-sans font-bold text-white">
                      <PlayerLink name={name} stage={stage} className="text-white hover:text-amber-400" />
                    </td>
                    <td className="py-2 px-2 text-right text-gray-400">{mins}</td>
                    <td className="py-2 px-2 text-right text-gray-300">{fx(onOrtg)}</td>
                    <td className="py-2 px-2 text-right text-gray-300">{fx(onDrtg)}</td>
                    <td className={`py-2 px-2 text-right font-bold ${signColor(onNet)}`}>
                      {signed(onNet)}
                    </td>
                    <td className={`py-2 px-2 text-right ${signColor(offNet)}`}>
                      {signed(offNet)}
                    </td>
                    <td className={`py-2 px-2 text-right font-bold ${signColor(diff)}`}>
                      {signed(diff)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 表格 3：單場焦點對位交鋒與戰術結論 */
function TacticsWowyTable({
  team,
  items,
  accent,
}: {
  team: string;
  items: GameTacticItem[];
  accent: 'amber' | 'emerald';
}) {
  return (
    <div className="space-y-2">
      <div className={`p-2.5 rounded-xl border text-xs sm:text-sm font-bold flex justify-between items-center ${
        accent === 'amber' ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
      }`}>
        <span>{accent === 'amber' ? '客隊' : '主隊'}：{team}</span>
        <span className="text-[11px] font-mono opacity-70">對位與戰術交鋒</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-cardBorder bg-card shadow">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#1C2128] text-gray-400 uppercase font-mono border-b border-cardBorder">
            <tr>
              <th className="py-2 px-3 font-semibold text-white w-2/5">對位情境項目</th>
              <th className="py-2 px-3 font-semibold text-white w-3/5">攻防表現與說明</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cardBorder/40">
            {!items || items.length === 0 ? (
              <tr><td colSpan={2} className="py-4 text-center text-gray-500 font-sans">無焦點對位文字數據</td></tr>
            ) : (
              items.map((t, idx) => (
                <tr key={t.id ?? idx} className="hover:bg-gray-800/40 transition-colors">
                  <td className="py-2.5 px-3 font-bold text-gray-200 align-top">
                    <div className="flex items-center space-x-1.5">
                      {t.is_summary && (
                        <span className="text-[10px] px-1 rounded bg-amber-500/20 text-amber-300 shrink-0">焦點</span>
                      )}
                      <span>{t.category || '對位情境'}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-gray-300 leading-relaxed align-top">
                    {t.description || '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 表格 4：單場 Box Score (支援雙 Tab 切換、欄位排序與底部球隊加總 TOTALS) */
function BoxScoreTable({
  team,
  players,
  accent,
  stage,
}: {
  team: string;
  players: BoxScorePlayer[];
  accent: 'amber' | 'emerald';
  stage?: string;
}) {
  const [viewMode, setViewMode] = useState<'traditional' | 'advanced'>('traditional');
  const [sortField, setSortField] = useState<string>('pts');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // 全隊進攻總合 (計算 USG% 與球隊 TOTALS)
  const teamTotals = useMemo(() => {
    return players.reduce(
      (acc, p) => {
        acc.pts += p.pts || 0;
        acc.fgm += p.fgm || 0;
        acc.fga += p.fga || 0;
        acc.tpm += p.tpm || 0;
        acc.tpa += p.tpa || 0;
        acc.ftm += p.ftm || 0;
        acc.fta += p.fta || 0;
        acc.orb += p.orb || 0;
        acc.drb += p.drb || 0;
        acc.reb += p.reb || 0;
        acc.ast += p.ast || 0;
        acc.stl += p.stl || 0;
        acc.blk += p.blk || 0;
        acc.tov += p.tov || 0;
        acc.pf += p.pf || 0;
        acc.plus_minus += p.plus_minus || 0;
        acc.gmsc += p.gmsc || 0;
        acc.seconds += p.seconds || 0;
        return acc;
      },
      {
        pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
        orb: 0, drb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
        pf: 0, plus_minus: 0, gmsc: 0, seconds: 0,
      }
    );
  }, [players]);

  // 全隊高階效率總合指標
  const teamAdvMetrics = useMemo(() => {
    const { fgm, fga, tpm, tpa, ftm, fta, pts, orb, tov } = teamTotals;
    const poss = fga + 0.44 * fta - orb + tov;
    const efg = fga > 0 ? ((fgm + 0.5 * tpm) / fga) * 100 : 0;
    const ts = (2 * (fga + 0.44 * fta)) > 0 ? (pts / (2 * (fga + 0.44 * fta))) * 100 : 0;
    const threepar = fga > 0 ? (tpa / fga) * 100 : 0;
    const ftr = fga > 0 ? (fta / fga) * 100 : 0;
    const ortg = poss > 0 ? (pts / poss) * 100 : 0;

    return { efg, ts, threepar, ftr, ortg };
  }, [teamTotals]);

  // 球員附加動態 USG% 與排序衍生資料
  const processedPlayers = useMemo(() => {
    const teamPossItems = teamTotals.fga + 0.44 * teamTotals.fta + teamTotals.tov;

    return players.map((p) => {
      const played = (p.seconds || 0) > 0;
      let dynamicUsg = p.usg_pct;
      if (
        played &&
        (dynamicUsg === undefined || dynamicUsg === null || dynamicUsg === 20 || dynamicUsg === 0)
      ) {
        const playerPossItems = (p.fga || 0) + 0.44 * (p.fta || 0) + (p.tov || 0);
        if (teamPossItems > 0 && p.seconds > 0 && teamTotals.seconds > 0) {
          dynamicUsg =
            ((playerPossItems * (teamTotals.seconds / 5)) / (p.seconds * teamPossItems)) * 100;
        }
      }

      const fgPct = (p.fga || 0) > 0 ? ((p.fgm || 0) / p.fga) * 100 : null;
      const tpPct = (p.tpa || 0) > 0 ? ((p.tpm || 0) / p.tpa) * 100 : null;
      const ftPct = (p.fta || 0) > 0 ? ((p.ftm || 0) / p.fta) * 100 : null;
      const threepar = (p.fga || 0) > 0 ? ((p.tpa || 0) / p.fga) * 100 : null;
      const ftr = (p.fga || 0) > 0 ? ((p.fta || 0) / p.fga) * 100 : null;

      return {
        ...p,
        dynamicUsg,
        fgPct,
        tpPct,
        ftPct,
        threepar,
        ftr,
      };
    });
  }, [players, teamTotals]);

  // 排序清單
  const sortedPlayers = useMemo(() => {
    return [...processedPlayers].sort((a, b) => {
      // 0 分鐘球員永遠排在最後
      if (a.seconds === 0 && b.seconds > 0) return 1;
      if (b.seconds === 0 && a.seconds > 0) return -1;

      let valA: number = 0;
      let valB: number = 0;

      switch (sortField) {
        case 'player_name':
          return sortDirection === 'asc'
            ? a.player_name.localeCompare(b.player_name)
            : b.player_name.localeCompare(a.player_name);
        case 'seconds':
          valA = a.seconds || 0;
          valB = b.seconds || 0;
          break;
        case 'pts':
          valA = a.pts || 0;
          valB = b.pts || 0;
          break;
        case 'fgm':
          valA = a.fgm || 0;
          valB = b.fgm || 0;
          break;
        case 'fgPct':
          valA = a.fgPct || 0;
          valB = b.fgPct || 0;
          break;
        case 'tpm':
          valA = a.tpm || 0;
          valB = b.tpm || 0;
          break;
        case 'tpPct':
          valA = a.tpPct || 0;
          valB = b.tpPct || 0;
          break;
        case 'ftm':
          valA = a.ftm || 0;
          valB = b.ftm || 0;
          break;
        case 'ftPct':
          valA = a.ftPct || 0;
          valB = b.ftPct || 0;
          break;
        case 'orb':
          valA = a.orb || 0;
          valB = b.orb || 0;
          break;
        case 'drb':
          valA = a.drb || 0;
          valB = b.drb || 0;
          break;
        case 'reb':
          valA = a.reb || 0;
          valB = b.reb || 0;
          break;
        case 'ast':
          valA = a.ast || 0;
          valB = b.ast || 0;
          break;
        case 'stl':
          valA = a.stl || 0;
          valB = b.stl || 0;
          break;
        case 'blk':
          valA = a.blk || 0;
          valB = b.blk || 0;
          break;
        case 'tov':
          valA = a.tov || 0;
          valB = b.tov || 0;
          break;
        case 'pf':
          valA = a.pf || 0;
          valB = b.pf || 0;
          break;
        case 'plus_minus':
          valA = a.plus_minus || 0;
          valB = b.plus_minus || 0;
          break;
        case 'efg_pct':
          valA = a.efg_pct || 0;
          valB = b.efg_pct || 0;
          break;
        case 'ts_pct':
          valA = a.ts_pct || 0;
          valB = b.ts_pct || 0;
          break;
        case 'threepar':
          valA = a.threepar || 0;
          valB = b.threepar || 0;
          break;
        case 'ftr':
          valA = a.ftr || 0;
          valB = b.ftr || 0;
          break;
        case 'dynamicUsg':
          valA = a.dynamicUsg || 0;
          valB = b.dynamicUsg || 0;
          break;
        case 'gmsc':
          valA = a.gmsc || 0;
          valB = b.gmsc || 0;
          break;
        default:
          valA = a.pts || 0;
          valB = b.pts || 0;
      }

      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });
  }, [processedPlayers, sortField, sortDirection]);

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
        className={`py-3 px-2.5 font-semibold select-none cursor-pointer transition-colors hover:text-white ${className} ${
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

  const head = 'py-3 px-2.5 font-semibold text-right';

  return (
    <div className="space-y-3">
      {/* 標題與 Traditional / Advanced 雙 Tab 切換 */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border gap-3 ${
        accent === 'amber' ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
      }`}>
        <div className="flex items-center space-x-2">
          <span className="font-bold text-sm">{accent === 'amber' ? '客隊' : '主隊'}：{team}</span>
          <span className="text-xs font-mono opacity-80">({players.length} 人)</span>
        </div>

        <div className="inline-flex p-0.5 rounded-xl bg-[#0E1117] border border-[#30363D] shadow-sm shrink-0">
          <button
            onClick={() => setViewMode('traditional')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'traditional'
                ? 'bg-amber-500 text-black shadow-sm font-black'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-3 h-3" />
            <span>基礎數據</span>
          </button>
          <button
            onClick={() => setViewMode('advanced')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'advanced'
                ? 'bg-[#00E676] text-black shadow-sm font-black'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>進階數據</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-cardBorder bg-card shadow-lg relative">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="bg-gray-900/90 text-gray-400 uppercase font-mono border-b border-cardBorder sticky top-0 z-20">
            {viewMode === 'traditional' ? (
              <tr>
                {renderSortableHeader('player_name', '球員', 'sticky left-0 z-30 bg-gray-900/95', false)}
                {renderSortableHeader('seconds', '時間')}
                {renderSortableHeader('pts', 'PTS', 'text-right font-bold text-white')}
                {renderSortableHeader('fgm', 'FG')}
                {renderSortableHeader('fgPct', 'FG%')}
                {renderSortableHeader('tpm', '3P')}
                {renderSortableHeader('tpPct', '3P%')}
                {renderSortableHeader('ftm', 'FT')}
                {renderSortableHeader('ftPct', 'FT%')}
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
                {renderSortableHeader('player_name', '球員', 'sticky left-0 z-30 bg-gray-900/95', false)}
                {renderSortableHeader('seconds', '時間')}
                {renderSortableHeader('pts', 'PTS', 'text-right font-bold text-white')}
                {renderSortableHeader('efg_pct', 'eFG%', 'text-right text-[#FF9100]')}
                {renderSortableHeader('ts_pct', 'TS%', 'text-right text-[#FF9100]')}
                {renderSortableHeader('threepar', '3PAr')}
                {renderSortableHeader('ftr', 'FTr')}
                {renderSortableHeader('dynamicUsg', 'USG%', 'text-right text-[#00E676] font-black')}
                {renderSortableHeader('gmsc', 'GmSc', 'text-right text-[#00E676]')}
                {renderSortableHeader('plus_minus', '+/-')}
              </tr>
            )}
          </thead>

          <tbody className="divide-y divide-cardBorder/60 font-mono">
            {sortedPlayers.length === 0 ? (
              <tr><td colSpan={18} className="py-6 text-center text-gray-500 font-sans">無球員數據</td></tr>
            ) : (
              sortedPlayers.map((p) => {
                const played = (p.seconds || 0) > 0;
                const c = (v: React.ReactNode) => (played ? v : '-');

                return (
                  <tr key={p.id} className="hover:bg-gray-800/50 transition-colors group">
                    <td className="py-3 px-3 sticky left-0 z-10 bg-card group-hover:bg-gray-800/90 font-sans font-bold text-white shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
                      <div className="flex items-center space-x-2">
                        <span className="text-gray-500 text-xs font-mono w-6">{p.jersey_number ? `#${p.jersey_number}` : '-'}</span>
                        <PlayerLink name={p.player_name} stage={stage} className="font-bold text-white group-hover:text-amber-400" />
                        {p.is_starter && <span className="text-[10px] px-1 rounded bg-amber-500/20 text-amber-300">先</span>}
                        {p.identity?.includes('洋將') && <span className="text-[10px] px-1 rounded bg-blue-500/20 text-blue-300">洋</span>}
                      </div>
                    </td>
                    <td className="py-3 px-2.5 text-right text-gray-400">{p.minutes || '00:00'}</td>
                    <td className="py-3 px-2.5 text-right font-bold text-white">{c(p.pts)}</td>

                    {viewMode === 'traditional' ? (
                      <>
                        <td className="py-3 px-2.5 text-right text-gray-300">{c(`${p.fgm}/${p.fga}`)}</td>
                        <td className="py-3 px-2.5 text-right text-gray-300">{c(smartPctStr(p.fgPct))}</td>
                        <td className="py-3 px-2.5 text-right text-gray-300">{c(`${p.tpm}/${p.tpa}`)}</td>
                        <td className="py-3 px-2.5 text-right text-gray-300">{c(smartPctStr(p.tpPct))}</td>
                        <td className="py-3 px-2.5 text-right text-gray-300">{c(`${p.ftm}/${p.fta}`)}</td>
                        <td className="py-3 px-2.5 text-right text-gray-300">{c(smartPctStr(p.ftPct))}</td>
                        <td className="py-3 px-2.5 text-right text-gray-300">{c(p.orb)}</td>
                        <td className="py-3 px-2.5 text-right text-gray-300">{c(p.drb)}</td>
                        <td className="py-3 px-2.5 text-right font-bold text-white">{c(p.reb)}</td>
                        <td className="py-3 px-2.5 text-right font-bold text-sky-400">{c(p.ast)}</td>
                        <td className="py-3 px-2.5 text-right text-gray-300">{c(p.stl)}</td>
                        <td className="py-3 px-2.5 text-right text-gray-300">{c(p.blk)}</td>
                        <td className="py-3 px-2.5 text-right text-gray-300">{c(p.tov)}</td>
                        <td className="py-3 px-2.5 text-right text-gray-300">{c(p.pf)}</td>
                        <td className={`py-3 px-2.5 text-right font-bold ${signColor(p.plus_minus)}`}>{c(signed(p.plus_minus, 0))}</td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 px-2.5 text-right text-amber-300 font-bold">{c(smartPctStr(p.efg_pct))}</td>
                        <td className="py-3 px-2.5 text-right text-amber-300 font-bold">{c(smartPctStr(p.ts_pct))}</td>
                        <td className="py-3 px-2.5 text-right text-gray-300">{c(smartPctStr(p.threepar))}</td>
                        <td className="py-3 px-2.5 text-right text-gray-300">{c(smartPctStr(p.ftr))}</td>
                        <td className="py-3 px-2.5 text-right text-emerald-300 font-bold">{c(smartPctStr(p.dynamicUsg))}</td>
                        <td className="py-3 px-2.5 text-right text-emerald-300 font-bold">{c(fx(p.gmsc))}</td>
                        <td className={`py-3 px-2.5 text-right font-bold ${signColor(p.plus_minus)}`}>{c(signed(p.plus_minus, 0))}</td>
                      </>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>

          {/* 球隊數據加總列 (TOTALS) */}
          <tfoot className="bg-[#0E1117] font-mono border-t-2 border-[#30363D] font-bold text-white">
            {viewMode === 'traditional' ? (
              <tr>
                <td className="py-3 px-3 sticky left-0 bg-[#0E1117] font-sans font-black tracking-wider text-amber-400 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
                  TOTALS (合計)
                </td>
                <td className="py-3 px-2.5 text-right text-gray-400">240:00</td>
                <td className="py-3 px-2.5 text-right font-black text-amber-400 text-sm">{teamTotals.pts}</td>
                <td className="py-3 px-2.5 text-right text-gray-200">{teamTotals.fgm}/{teamTotals.fga}</td>
                <td className="py-3 px-2.5 text-right text-gray-200">
                  {smartPctStr(teamTotals.fga > 0 ? (teamTotals.fgm / teamTotals.fga) * 100 : 0)}
                </td>
                <td className="py-3 px-2.5 text-right text-gray-200">{teamTotals.tpm}/{teamTotals.tpa}</td>
                <td className="py-3 px-2.5 text-right text-gray-200">
                  {smartPctStr(teamTotals.tpa > 0 ? (teamTotals.tpm / teamTotals.tpa) * 100 : 0)}
                </td>
                <td className="py-3 px-2.5 text-right text-gray-200">{teamTotals.ftm}/{teamTotals.fta}</td>
                <td className="py-3 px-2.5 text-right text-gray-200">
                  {smartPctStr(teamTotals.fta > 0 ? (teamTotals.ftm / teamTotals.fta) * 100 : 0)}
                </td>
                <td className="py-3 px-2.5 text-right text-gray-200">{teamTotals.orb}</td>
                <td className="py-3 px-2.5 text-right text-gray-200">{teamTotals.drb}</td>
                <td className="py-3 px-2.5 text-right font-black text-amber-300">{teamTotals.reb}</td>
                <td className="py-3 px-2.5 text-right font-black text-sky-400">{teamTotals.ast}</td>
                <td className="py-3 px-2.5 text-right text-gray-200">{teamTotals.stl}</td>
                <td className="py-3 px-2.5 text-right text-gray-200">{teamTotals.blk}</td>
                <td className="py-3 px-2.5 text-right text-gray-200">{teamTotals.tov}</td>
                <td className="py-3 px-2.5 text-right text-gray-200">{teamTotals.pf}</td>
                <td className="py-3 px-2.5 text-right text-gray-400">-</td>
              </tr>
            ) : (
              <tr>
                <td className="py-3 px-3 sticky left-0 bg-[#0E1117] font-sans font-black tracking-wider text-[#00E676] z-10 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
                  TOTALS (團隊指標)
                </td>
                <td className="py-3 px-2.5 text-right text-gray-400">240:00</td>
                <td className="py-3 px-2.5 text-right font-black text-[#00E676] text-sm">{teamTotals.pts}</td>
                <td className="py-3 px-2.5 text-right text-[#FF9100] font-black">{smartPctStr(teamAdvMetrics.efg)}</td>
                <td className="py-3 px-2.5 text-right text-[#FF9100] font-black">{smartPctStr(teamAdvMetrics.ts)}</td>
                <td className="py-3 px-2.5 text-right text-gray-200">{smartPctStr(teamAdvMetrics.threepar)}</td>
                <td className="py-3 px-2.5 text-right text-gray-200">{smartPctStr(teamAdvMetrics.ftr)}</td>
                <td className="py-3 px-2.5 text-right text-[#00E676] font-black">100.0%</td>
                <td className="py-3 px-2.5 text-right text-[#00E676] font-black">{fx(teamTotals.gmsc)}</td>
                <td className="py-3 px-2.5 text-right text-gray-400">-</td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 主頁面                                                              */
/* ------------------------------------------------------------------ */

export default function GamesReviewPage() {
  const { stage: selectedStage } = useStage();
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  // 篩選狀態：球隊篩選與對戰球隊篩選
  const [filterTeam, setFilterTeam] = useState<string>('ALL');
  const [filterOpponent, setFilterOpponent] = useState<string>('ALL');

  const { data: rawGames, isLoading: listLoading } = useSWR<GameListItem[]>(
    `/api/games?stage=${encodeURIComponent(selectedStage)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  // 切換賽季時重置球隊/對手篩選與選取場次
  useEffect(() => {
    setFilterTeam('ALL');
    setFilterOpponent('ALL');
    setSelectedGameId(null);
  }, [selectedStage]);

  // 取得當前賽季所有參與球隊清單
  const allTeams = useMemo(() => {
    if (!rawGames) return [];
    const set = new Set<string>();
    rawGames.forEach((g) => {
      if (g.home_team) set.add(g.home_team);
      if (g.away_team) set.add(g.away_team);
    });
    return Array.from(set).sort();
  }, [rawGames]);

  // 可選的對手清單（排除自己）
  const opponentTeams = useMemo(() => {
    if (filterTeam === 'ALL') return [];
    return allTeams.filter((t) => t !== filterTeam);
  }, [allTeams, filterTeam]);

  // 賽程過濾邏輯
  const filteredGames = useMemo(() => {
    if (!rawGames) return [];
    return rawGames.filter((g) => {
      if (filterTeam === 'ALL') return true;
      const hasTeam = g.home_team === filterTeam || g.away_team === filterTeam;
      if (!hasTeam) return false;
      if (filterOpponent === 'ALL') return true;
      return g.home_team === filterOpponent || g.away_team === filterOpponent;
    });
  }, [rawGames, filterTeam, filterOpponent]);

  // 切換賽季或篩選時：預設選中「最後一場 / 最新一場」比賽
  useEffect(() => {
    if (!filteredGames || filteredGames.length === 0) {
      setSelectedGameId(null);
      return;
    }
    setSelectedGameId((cur) => {
      if (cur && filteredGames.some((g) => g.id === cur)) return cur;
      return filteredGames[filteredGames.length - 1].id;
    });
  }, [filteredGames]);

  const { data: game, isLoading: detailLoading, error: detailError } = useSWR<DetailedGameData & {
    lineups_and_pairs?: { away?: { lineups?: GameLineupItem[]; pairs?: GameLineupItem[] }; home?: { lineups?: GameLineupItem[]; pairs?: GameLineupItem[] } };
    player_onoff?: { away?: any[]; home?: any[] };
    tactics_wowy?: { away?: GameTacticItem[]; home?: GameTacticItem[] };
  }>(
    selectedGameId ? `/api/games/${selectedGameId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const players = game?.player_stats ?? [];
  const awayPlayers = useMemo(() => players.filter((p) => p.team_name === game?.away_team), [players, game]);
  const homePlayers = useMemo(() => players.filter((p) => p.team_name === game?.home_team), [players, game]);

  const metrics = useMemo(() => {
    if (!game) return undefined;
    const m = game.metrics11;
    const hasData = !!m && (toNum(m.possessions?.away) > 0 || toNum(m.possessions?.home) > 0);
    return hasData ? m : deriveMetrics11(players, game.away_team, game.home_team);
  }, [game, players]);
  const metricItems = useMemo(() => (metrics ? buildMetricItems(metrics) : []), [metrics]);

  const awayLineups = game?.lineups_and_pairs?.away?.lineups ?? [];
  const awayPairs = game?.lineups_and_pairs?.away?.pairs ?? [];
  const homeLineups = game?.lineups_and_pairs?.home?.lineups ?? [];
  const homePairs = game?.lineups_and_pairs?.home?.pairs ?? [];
  const awayOnOff = game?.player_onoff?.away ?? [];
  const homeOnOff = game?.player_onoff?.home ?? [];
  const awayTactics = game?.tactics_wowy?.away ?? [];
  const homeTactics = game?.tactics_wowy?.home ?? [];

  return (
    <div className="space-y-10">
      {/* 標題 */}
      <div className="rounded-3xl border border-[#30363D] bg-[#161B22] p-6 sm:p-8 shadow-2xl space-y-2">
        <span className="px-3 py-1 rounded-full bg-[#FF9100]/15 text-[#FF9100] text-xs font-black tracking-wider border border-[#FF9100]/30">
          {selectedStage}
        </span>
        <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">📅 逐場賽事覆盤</h1>
      </div>

      {/* 1. 賽程清單 */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <Swords className="w-5 h-5 text-[#00E676]" />
            <h2 className="text-xl font-black text-white">
              賽程清單 (共 {filteredGames.length} 場)
            </h2>
          </div>

          {/* 篩選工具列 */}
          <div className="flex items-center space-x-3 bg-[#161B22] border border-[#30363D] px-3 py-1.5 rounded-2xl text-xs">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">球隊:</span>
              <select
                value={filterTeam}
                onChange={(e) => {
                  setFilterTeam(e.target.value);
                  setFilterOpponent('ALL');
                }}
                className="bg-[#0D1117] border border-[#30363D] text-white rounded-lg px-2 py-1 focus:outline-none focus:border-[#FF9100]"
              >
                <option value="ALL">全部球隊</option>
                {allTeams.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {filterTeam !== 'ALL' && (
              <div className="flex items-center space-x-2 border-l border-[#30363D] pl-3">
                <span className="text-gray-400">對手:</span>
                <select
                  value={filterOpponent}
                  onChange={(e) => setFilterOpponent(e.target.value)}
                  className="bg-[#0D1117] border border-[#30363D] text-white rounded-lg px-2 py-1 focus:outline-none focus:border-[#FF9100]"
                >
                  <option value="ALL">全部對手</option>
                  {opponentTeams.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {listLoading ? (
          <EmptyBox text="正在載入賽程..." />
        ) : filteredGames.length === 0 ? (
          <EmptyBox text={`在「${selectedStage}」中查無符合篩選條件的賽事。`} />
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {filteredGames.map((g) => {
              const active = g.id === selectedGameId;
              const awayWin = g.away_score > g.home_score;
              const homeWin = g.home_score > g.away_score;
              return (
                <button
                  key={g.id}
                  onClick={() => setSelectedGameId(g.id)}
                  className={`shrink-0 w-56 text-left p-4 rounded-2xl border transition-all ${
                    active
                      ? 'border-[#FF9100] bg-[#1C2128] shadow-lg shadow-[#FF9100]/10'
                      : 'border-[#30363D] bg-[#161B22] hover:border-[#FF9100]/50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-3">
                    <span className="font-mono font-black text-[#FF9100]">{g.id}</span>
                    <span className="flex items-center space-x-1 text-gray-400">
                      <Calendar className="w-3 h-3" />
                      <span>{g.date}</span>
                    </span>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className={awayWin ? 'text-white font-extrabold' : 'text-gray-400'}>{g.away_team}</span>
                      <span className={`font-mono font-black ${awayWin ? 'text-[#FF9100]' : 'text-gray-500'}`}>{g.away_score}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={homeWin ? 'text-white font-extrabold' : 'text-gray-400'}>{g.home_team}</span>
                      <span className={`font-mono font-black ${homeWin ? 'text-[#00E676]' : 'text-gray-500'}`}>{g.home_score}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 單場詳細覆盤 */}
      {selectedGameId && detailLoading && (
        <div className="flex items-center justify-center py-16 space-x-3 text-gray-400">
          <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
          <span>正在載入 {selectedGameId} 覆盤數據...</span>
        </div>
      )}
      {selectedGameId && detailError && <EmptyBox text={`無法取得 ${selectedGameId} 數據：${detailError.message}`} />}

      {game && !detailLoading && !detailError && (
        <>
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

          {/* 2. 攻防對決條 */}
          {metricItems.length > 0 ? (
            <MetricsPanel items={metricItems} away={game.away_team} home={game.home_team} />
          ) : (
            <EmptyBox text="本場尚無攻防指標數據" />
          )}

          {/* 3a. 單場最佳陣容與搭檔效益 */}
          <section className="space-y-4">
            <SectionTitle icon={<Users className="w-5 h-5" />} title="單場最佳陣容與核心搭檔效益" hint="含最佳五人與 Key Pairs 雙人搭檔" />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
              <LineupPairTable team={game.away_team} lineups={awayLineups} pairs={awayPairs} accent="amber" />
              <LineupPairTable team={game.home_team} lineups={homeLineups} pairs={homePairs} accent="emerald" />
            </div>
          </section>

          {/* 3b. 單場主力 On/Off 淨勝分 */}
          <section className="space-y-4">
            <SectionTitle icon={<Crosshair className="w-5 h-5" />} title="單場主力 On/Off 淨勝分 (≥ 8分鐘)" hint="依淨影響力排序" />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
              <PlayerOnOffTable team={game.away_team} items={awayOnOff} accent="amber" stage={game.stage} />
              <PlayerOnOffTable team={game.home_team} items={homeOnOff} accent="emerald" stage={game.stage} />
            </div>
          </section>

          {/* 3c. 單場焦點對位交鋒與戰術結論 */}
          <section className="space-y-4">
            <SectionTitle icon={<Swords className="w-5 h-5" />} title="單場焦點對位交鋒與戰術結論" hint="關鍵球員防守壓迫與對位分析" />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
              <TacticsWowyTable team={game.away_team} items={awayTactics} accent="amber" />
              <TacticsWowyTable team={game.home_team} items={homeTactics} accent="emerald" />
            </div>
          </section>

          {/* 4. 單場進階 Box Score */}
          <section className="space-y-4">
            <SectionTitle icon={<Table2 className="w-5 h-5" />} title="單場進階 Box Score" hint="支援基礎與進階雙視圖、點擊表頭排序與球隊加總" />
            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6 items-start">
              <BoxScoreTable team={game.away_team} players={awayPlayers} accent="amber" stage={game.stage} />
              <BoxScoreTable team={game.home_team} players={homePlayers} accent="emerald" stage={game.stage} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
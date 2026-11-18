'use client';

import React, { useRef, useState } from 'react';
import { Download, Share2, X, Sparkles, Check, Flame } from 'lucide-react';
import {
  AdvStatsCircleLogo,
  CardTeamLogo,
  calcDualBarWidths,
  downloadDataUrl,
  exportCardToPng,
} from './ShareCardCommon';

export interface WeeklyPreviewShareReport {
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
  home_summary: {
    record: string;
    pace: number;
    ortg: number;
    drtg: number;
    net_rtg: number;
    efg_pct: number;
    tov_pct: number;
    orb_pct: number;
  };
  away_summary: {
    record: string;
    pace: number;
    ortg: number;
    drtg: number;
    net_rtg: number;
    efg_pct: number;
    tov_pct: number;
    orb_pct: number;
  };
  situation_analysis: {
    overview: string;
  };
  x_factors_and_prediction: {
    home_x_factor: { player: string; role_tag: string; reason: string };
    away_x_factor: { player: string; role_tag: string; reason: string };
    predicted_home_score: number;
    predicted_away_score: number;
    predicted_margin_range: string;
    fun_prediction_verdict: string;
  };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  report: WeeklyPreviewShareReport;
}

const CARD_WIDTH = 900;
const CARD_HEIGHT = 1125; // 4:5 Threads 滿版比例

export default function WeeklyPreviewShareCardModal({ isOpen, onClose, report }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const homeProb = Number(report.home_win_prob || 50);
  const awayProb = Number(report.away_win_prob || 50);
  const [winBarHome, winBarAway] = calcDualBarWidths(homeProb, awayProb);

  const metrics = [
    {
      label: '進攻效率 (ORtg)',
      valA: report.home_summary.ortg,
      valB: report.away_summary.ortg,
      suffix: '',
      lowerBetter: false,
    },
    {
      label: '防守效率 (DRtg · 越低越佳)',
      valA: report.home_summary.drtg,
      valB: report.away_summary.drtg,
      suffix: '',
      lowerBetter: true,
    },
    {
      label: '有效命中率 (eFG%)',
      valA: report.home_summary.efg_pct,
      valB: report.away_summary.efg_pct,
      suffix: '%',
      lowerBetter: false,
    },
    {
      label: '進攻節奏 (Pace)',
      valA: report.home_summary.pace,
      valB: report.away_summary.pace,
      suffix: '',
      lowerBetter: false,
    },
    {
      label: '失誤控制 (TOV% · 越低越佳)',
      valA: report.home_summary.tov_pct,
      valB: report.away_summary.tov_pct,
      suffix: '%',
      lowerBetter: true,
    },
    {
      label: '進攻籃板率 (ORB%)',
      valA: report.home_summary.orb_pct,
      valB: report.away_summary.orb_pct,
      suffix: '%',
      lowerBetter: false,
    },
  ];

  const handleDownload = async () => {
    if (!cardRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const dataUrl = await exportCardToPng(cardRef.current, CARD_WIDTH, CARD_HEIGHT);
      downloadDataUrl(
        dataUrl,
        `TPBL_4-5_Preview_${report.home_team}_vs_${report.away_team}_${report.game_date}.png`
      );
    } catch (err) {
      console.error('賽前預測圖卡輸出失敗:', err);
      alert('圖片生成失敗，請稍後再試。');
    } finally {
      setIsExporting(false);
    }
  };

  const handleNativeShare = async () => {
    if (!cardRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const dataUrl = await exportCardToPng(cardRef.current, CARD_WIDTH, CARD_HEIGHT);
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File(
        [blob],
        `TPBL_Preview_${report.home_team}_vs_${report.away_team}.png`,
        { type: 'image/png' }
      );

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `TPBL 賽前預測：${report.home_team} vs ${report.away_team}`,
          text: `${report.headline}\n勝率預測：${report.home_team} ${homeProb}% vs ${awayProb}% ${report.away_team}\n詳細球探報告：tpbl-advstats.com/weekly-preview`,
          files: [file],
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(
          `【TPBL 本週賽前預測】\n${report.home_team} vs ${report.away_team} (${report.game_date})\n${report.headline}\n勝率推演：${report.home_team} ${homeProb}% · ${report.away_team} ${awayProb}%\n👉 完整球探報告：https://tpbl-advstats.com/weekly-preview`
        );
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.warn('分享或繪圖異常:', err);
        alert('圖卡分享失敗，請改用下載按鈕儲存圖片。');
      }
    } finally {
      setIsExporting(false);
    }
  };

  const fmtNetRtg = (val: number) => (val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1));

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[#161B22] border border-[#30363D] rounded-2xl max-w-5xl w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto">
        {/* 頂部操作列 */}
        <div className="flex items-center justify-between pb-3 border-b border-[#21262D]">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-[#FF9100]" />
            <h3 className="text-sm sm:text-base font-black text-white">
              Threads 4:5 賽前預測圖卡
            </h3>
            <span className="hidden sm:inline-block text-[11px] font-mono text-gray-400 bg-[#0E1117] px-2 py-0.5 rounded-md border border-[#30363D]">
              900 × 1125 HD PNG
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 圖卡預覽區 (固定 900x1125 避免行動端縮放裁切) */}
        <div className="flex justify-center overflow-auto max-h-[70vh] p-2 bg-[#090C10] rounded-xl border border-[#21262D]">
          <div
            ref={cardRef}
            style={{ width: `${CARD_WIDTH}px`, height: `${CARD_HEIGHT}px` }}
            className="bg-[#0E1117] text-white p-8 rounded-2xl border border-[#30363D] flex flex-col justify-between select-none relative shadow-2xl shrink-0 overflow-hidden font-sans"
          >
            {/* 背景漸層光暈 */}
            <div
              className="absolute -top-36 -left-36 w-96 h-96 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(255,145,0,0.16) 0%, rgba(255,145,0,0) 70%)' }}
            />
            <div
              className="absolute -bottom-36 -right-36 w-96 h-96 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.16) 0%, rgba(56,189,248,0) 70%)' }}
            />

            {/* 1. 頂部品牌列：左上角圓形 ADV STATS 新 Logo + 賽前預測標籤 */}
            <div className="flex items-center justify-between pb-4 border-b border-[#21262D] z-10">
              <div className="flex items-center gap-3.5">
                <AdvStatsCircleLogo size={48} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black tracking-wider text-white uppercase">
                      TPBL ADVSTATS PRO
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#FF9100]/15 text-[#FF9100] border border-[#FF9100]/40 text-[11px] font-bold">
                      賽前深度預測
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 font-mono mt-0.5">
                    {report.game_date} · {report.game_label} · {report.season_stage}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-mono text-gray-400">預估分差區間</div>
                <div className="text-sm font-black text-[#00E676] font-mono">
                  {report.x_factors_and_prediction.predicted_margin_range}
                </div>
              </div>
            </div>

            {/* 2. 主標題與副標題 */}
            <div className="z-10 py-1">
              <h2 className="text-[26px] font-black text-white leading-snug line-clamp-2">
                {report.headline}
              </h2>
              <p className="text-sm text-gray-300 mt-1.5 leading-relaxed line-clamp-2">
                {report.subheadline}
              </p>
            </div>

            {/* 3. 對戰雙方隊名 + 勝率預測對比條 */}
            <div className="bg-[#161B22]/90 border border-[#30363D] rounded-2xl p-5 space-y-4 z-10 shadow-xl">
              <div className="grid grid-cols-11 items-center gap-3">
                {/* 主隊 */}
                <div className="col-span-5 flex items-center gap-3.5">
                  <CardTeamLogo teamName={report.home_team} color="#FF9100" sizeClass="w-16 h-16" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-black text-[#FF9100] uppercase tracking-wider">
                      HOME 主隊
                    </div>
                    <div className="text-xl font-black text-white truncate">
                      {report.home_team}
                    </div>
                    <div className="text-xs text-gray-400 font-mono mt-0.5">
                      戰績 {report.home_summary.record} · Net {fmtNetRtg(report.home_summary.net_rtg)}
                    </div>
                  </div>
                </div>

                {/* 中央予測比分 */}
                <div className="col-span-1 flex flex-col items-center justify-center">
                  <span className="text-xs font-black italic text-gray-400 tracking-widest">VS</span>
                </div>

                {/* 客隊 */}
                <div className="col-span-5 flex items-center justify-end gap-3.5 text-right">
                  <div className="min-w-0">
                    <div className="text-[11px] font-black text-[#38BDF8] uppercase tracking-wider">
                      AWAY 客隊
                    </div>
                    <div className="text-xl font-black text-white truncate">
                      {report.away_team}
                    </div>
                    <div className="text-xs text-gray-400 font-mono mt-0.5">
                      戰績 {report.away_summary.record} · Net {fmtNetRtg(report.away_summary.net_rtg)}
                    </div>
                  </div>
                  <CardTeamLogo teamName={report.away_team} color="#38BDF8" sizeClass="w-16 h-16" />
                </div>
              </div>

              {/* 勝率預測對比條 */}
              <div className="pt-1">
                <div className="flex items-end justify-between mb-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black font-mono text-[#FF9100]">
                      {homeProb}%
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      推演 {report.x_factors_and_prediction.predicted_home_score} 分
                    </span>
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                    MODEL WIN PROBABILITY
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-gray-400 font-mono">
                      推演 {report.x_factors_and_prediction.predicted_away_score} 分
                    </span>
                    <span className="text-2xl font-black font-mono text-[#38BDF8]">
                      {awayProb}%
                    </span>
                  </div>
                </div>
                <div className="w-full h-4 bg-[#0E1117] rounded-full overflow-hidden flex border border-[#30363D] shadow-inner">
                  <div style={{ width: `${winBarHome}%` }} className="bg-[#FF9100]" />
                  <div style={{ width: `${winBarAway}%` }} className="bg-[#38BDF8]" />
                </div>
              </div>
            </div>

            {/* 4. 核心攻防指標對比 (6 項進階效率) */}
            <div className="bg-[#161B22]/75 border border-[#21262D] rounded-2xl p-5 z-10 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-gray-400 pb-1 border-b border-[#21262D]">
                <span className="text-[#FF9100]">{report.home_team}</span>
                <span className="uppercase tracking-wider text-gray-300">核心攻防四要素對比</span>
                <span className="text-[#38BDF8]">{report.away_team}</span>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
                {metrics.map((m) => {
                  const [wA, wB] = calcDualBarWidths(m.valA, m.valB);
                  const aWins = m.lowerBetter ? m.valA < m.valB : m.valA > m.valB;
                  const bWins = m.lowerBetter ? m.valB < m.valA : m.valB > m.valA;
                  return (
                    <div key={m.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span
                          className={`font-mono font-black ${
                            aWins ? 'text-[#FF9100]' : 'text-gray-300'
                          }`}
                        >
                          {aWins ? '▲ ' : ''}
                          {m.valA}
                          {m.suffix}
                        </span>
                        <span className="text-[11px] font-bold text-gray-400">{m.label}</span>
                        <span
                          className={`font-mono font-black ${
                            bWins ? 'text-[#38BDF8]' : 'text-gray-300'
                          }`}
                        >
                          {m.valB}
                          {m.suffix}
                          {bWins ? ' ▲' : ''}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-[#0E1117] rounded-full overflow-hidden flex border border-[#21262D]">
                        <div style={{ width: `${wA}%` }} className="bg-[#FF9100]" />
                        <div style={{ width: `${wB}%` }} className="bg-[#38BDF8]" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 5. 關鍵球探洞察摘要 & 雙方 X-Factor */}
            <div className="bg-[#161B22]/85 border border-[#FF9100]/30 rounded-2xl p-5 z-10 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-black text-[#FF9100] uppercase tracking-wider">
                  <Flame className="w-4 h-4" />
                  <span>關鍵球探洞察摘要 (SCOUTING VERDICT)</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-[#FF9100]/15 text-[#FF9100] border border-[#FF9100]/30">
                    主 X因子：{report.x_factors_and_prediction.home_x_factor.player}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30">
                    客 X因子：{report.x_factors_and_prediction.away_x_factor.player}
                  </span>
                </div>
              </div>

              <p className="text-sm font-bold text-white leading-relaxed line-clamp-3">
                {report.x_factors_and_prediction.fun_prediction_verdict}
              </p>
              <p className="text-xs text-gray-300 leading-relaxed line-clamp-3 border-t border-[#21262D] pt-2.5">
                {report.situation_analysis.overview}
              </p>
            </div>

            {/* 6. 底部浮水印：右下角 tpbl-advstats.com */}
            <div className="flex items-center justify-between pt-3 border-t border-[#21262D] text-xs font-mono z-10">
              <span className="text-gray-500">
                DEAN OLIVER 4-FACTORS · TACTICAL SCOUTING ENGINE
              </span>
              <span className="text-[#FF9100] font-black tracking-wide">
                tpbl-advstats.com
              </span>
            </div>
          </div>
        </div>

        {/* 底部操作按鈕 */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={handleNativeShare}
            disabled={isExporting}
            className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-[#21262D] hover:bg-[#30363D] text-white text-xs font-bold border border-[#30363D] transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-[#00E676]" />
                <span className="text-[#00E676]">已複製預測摘要</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4" />
                <span>社群分享</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={isExporting}
            className="flex items-center space-x-1.5 px-5 py-2.5 rounded-xl bg-[#FF9100] hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors shadow-lg shadow-[#FF9100]/20"
          >
            <Download className="w-4 h-4" />
            <span>{isExporting ? '高清渲染中...' : '下載 4:5 Threads 圖卡'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

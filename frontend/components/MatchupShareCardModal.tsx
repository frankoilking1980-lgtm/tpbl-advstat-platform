'use client';

import React, { useRef, useState, useEffect } from 'react';
import { toPng } from 'html-to-image';
import { Download, Share2, X, Sparkles, Check } from 'lucide-react';

interface Player {
  player_name: string;
  jersey_number: string;
  position: string;
  identity: string;
  ppg: number;
  mpg: number;
}

interface TeamAggregate {
  rawStarterPts: number;
  rawBenchPts: number;
  totalUsg: number;
  efg: number;
  totalReb: number;
  totalAst: number;
  totalStocks: number;
}

interface MatchupResult {
  netDiff: number;
  scoreA: number;
  scoreB: number;
  winRateA: number;
  winRateB: number;
}

interface ForeignStats {
  starters: number;
  total: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  teamA: string;
  teamB: string;
  startersA: (Player | null)[];
  startersB: (Player | null)[];
  benchA: Player[];
  benchB: Player[];
  aggA: TeamAggregate;
  aggB: TeamAggregate;
  matchupResults: MatchupResult;
  foreignStatsA: ForeignStats;
  foreignStatsB: ForeignStats;
}

const TEAM_LOGO_MAP: Record<string, string> = {
  新北國王: 'kings',
  臺北台新戰神: 'mars',
  新北中信特攻: 'dea',
  桃園台啤永豐雲豹: 'leopards',
  新竹御嵿攻城獅: 'lioneers',
  福爾摩沙夢想家: 'dreamers',
  高雄全家海神: 'aquas',
};

// 放大對齊之 Logo 元件
function CardTeamLogo({ teamName, color }: { teamName: string; color: string }) {
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
        className="w-20 h-20 rounded-2xl bg-[#161B22] border-2 flex items-center justify-center p-2 text-center shadow-lg font-black text-base"
        style={{ borderColor: color, color }}
      >
        {teamName.slice(-2)}
      </div>
    );
  }

  return (
    <div className="w-20 h-20 rounded-2xl bg-[#161B22] border-2 border-[#30363D] p-2 flex items-center justify-center shrink-0 shadow-lg overflow-hidden">
      <img
        src={`/logos/${fileBase}.${ext}`}
        alt={teamName}
        crossOrigin="anonymous"
        decoding="sync"
        loading="eager"
        className="w-full h-full object-contain"
        onError={handleError}
      />
    </div>
  );
}

const calcDualBarWidths = (valA: number, valB: number): [number, number] => {
  const safeA = Number.isFinite(valA) && valA > 0 ? valA : 0;
  const safeB = Number.isFinite(valB) && valB > 0 ? valB : 0;
  const sum = safeA + safeB;
  if (sum <= 0) return [50, 50];
  const widthA = Math.min(95, Math.max(5, (safeA / sum) * 100));
  return [widthA, 100 - widthA];
};

export default function MatchupShareCardModal({
  isOpen,
  onClose,
  teamA,
  teamB,
  startersA,
  startersB,
  benchA,
  benchB,
  aggA,
  aggB,
  matchupResults,
  foreignStatsA,
  foreignStatsB,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const renderCardDataUrl = async (): Promise<string> => {
    if (!cardRef.current) throw new Error('Card container not mounted');

    if (typeof document !== 'undefined' && document.fonts?.ready) {
      await document.fonts.ready;
    }

    const imgs = Array.from(cardRef.current.querySelectorAll('img'));
    await Promise.all(
      imgs.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        });
      })
    );

    const isMobile =
      typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const ratios = isMobile ? [1.5, 1] : [2, 1.5, 1];
    let lastError: unknown;

    for (const pixelRatio of ratios) {
      try {
        return await toPng(cardRef.current, {
          cacheBust: false,
          pixelRatio,
          width: 1200,
          height: 675,
        });
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  };

  const handleDownload = async () => {
    if (!cardRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const dataUrl = await renderCardDataUrl();
      const link = document.createElement('a');
      link.download = `TPBL_16-9_Matchup_${teamA}_vs_${teamB}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('戰報輸出失敗:', err);
      alert('圖片生成失敗，請稍後再試。');
    } finally {
      setIsExporting(false);
    }
  };

  const handleNativeShare = async () => {
    if (!cardRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const dataUrl = await renderCardDataUrl();
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `TPBL_${teamA}_vs_${teamB}.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `TPBL 對決戰報：${teamA} vs ${teamB}`,
          text: `推演比分 ${teamA} ${matchupResults.scoreA} : ${matchupResults.scoreB} ${teamB}！詳細對決數據請見：tpbl-advstats.com`,
          files: [file],
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(
          `【TPBL 對決模擬戰報】\n${teamA} ${matchupResults.scoreA} : ${matchupResults.scoreB} ${teamB}\n勝率推演：${teamA} ${matchupResults.winRateA}% · ${teamB} ${matchupResults.winRateB}%\n👉 深度排陣模擬：https://tpbl-advstats.com/matchup`
        );
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.warn('分享或繪圖異常:', err);
        alert('戰報卡分享失敗，請改用下載按鈕儲存圖片。');
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#161B22] border border-[#30363D] rounded-2xl max-w-6xl w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
        {/* 頂部操作列 */}
        <div className="flex items-center justify-between pb-3 border-b border-[#21262D]">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-[#FF9100]" />
            <h3 className="text-base font-black text-white">社群 16:9 全景對決戰報卡</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 戰報卡預覽視窗 (1200x675 寬螢幕規格) */}
        <div className="flex justify-center overflow-x-auto p-1 bg-[#090C10] rounded-xl border border-[#21262D]">
          <div
            ref={cardRef}
            style={{ width: '1200px', height: '675px' }}
            className="bg-[#0E1117] text-white p-7 rounded-2xl border border-[#30363D] flex flex-col justify-between select-none relative shadow-2xl shrink-0 overflow-hidden font-sans"
          >
            {/* 背景科技光暈（以 radial-gradient 替代大面積 blur filter，降低行動端 Canvas 記憶體壓力） */}
            <div
              className="absolute -top-32 -left-32 w-80 h-80 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(255,145,0,0.14) 0%, rgba(255,145,0,0) 70%)' }}
            />
            <div
              className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(41,121,255,0.14) 0%, rgba(41,121,255,0) 70%)' }}
            />

            {/* 1. 卡片頂部：標題與資訊列 */}
            <div className="flex items-center justify-between pb-2.5 border-b border-[#21262D] z-10">
              <div className="flex items-center space-x-2.5">
                <span className="w-3 h-3 rounded-full bg-[#FF9100] animate-pulse" />
                <span className="text-sm font-black tracking-widest uppercase text-white">
                  TPBL ADVSTATS PRO • HEAD-TO-HEAD MATCHUP
                </span>
              </div>
              <div className="flex items-center space-x-3 text-xs">
                <span className="text-gray-400 font-mono">
                  MODEL: 4-FACTORS + ADVANCED WOWY
                </span>
                <span className="px-3 py-1 rounded-full bg-[#161B22] text-[#FF9100] border border-[#FF9100]/30 font-bold">
                  14人全景陣容推演
                </span>
              </div>
            </div>

            {/* 2. 卡片上半部：左右收縮、Logo 放大對齊、中央 VS 強調放大 */}
            <div className="flex items-center justify-between gap-4 z-10 py-1">
              {/* 主隊 (Team A：資訊緊湊、Logo 放大) */}
              <div className="w-[39%] bg-[#161B22]/85 border border-[#FF9100]/40 rounded-xl p-3.5 flex items-center justify-between shadow-lg">
                <div className="space-y-1 text-left flex-1 pr-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-400 font-mono font-bold">TEAM A</span>
                    <h3 className="text-lg font-black text-[#FF9100] truncate">{teamA}</h3>
                  </div>

                  <div className="text-xs text-gray-300 space-y-0.5">
                    <div>
                      推演得分：<span className="text-xl font-black font-mono text-white ml-1">{matchupResults.scoreA}</span> 分
                    </div>
                    <div className="text-[11px] text-gray-300">
                      先發火力：<strong className="text-white">{aggA.rawStarterPts.toFixed(1)}</strong> 分 · 板凳：<strong className="text-white">{aggA.rawBenchPts.toFixed(1)}</strong> 分
                    </div>
                    <div className="text-[11px]">
                      球權負荷：
                      <span className={`font-bold ml-1 ${aggA.totalUsg > 115 ? 'text-red-400' : 'text-amber-300'}`}>
                        {aggA.totalUsg.toFixed(1)}% {aggA.totalUsg > 115 && '(嚴重排擠)'}
                      </span>
                    </div>
                    <div className="text-[11px]">
                      洋將檢驗：
                      <span className="text-purple-400 font-bold ml-1">
                        先發 {foreignStatsA.starters}/2 · 登錄 {foreignStatsA.total}/3
                      </span>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 flex items-center justify-center">
                  <CardTeamLogo teamName={teamA} color="#FF9100" />
                </div>
              </div>

              {/* 中央 VS 核心 (空間加大、顯眼度提升) */}
              <div className="w-[22%] flex flex-col items-center justify-center space-y-2 px-2 bg-[#0E1117]/60 py-2 rounded-xl border border-[#21262D]/60 shadow-inner">
                <span className="text-base font-black italic tracking-widest text-gray-400">VS</span>

                <div className="w-full">
                  <div className="flex justify-between text-xs font-mono font-black mb-1 px-0.5">
                    <span className="text-[#FF9100] text-sm">{matchupResults.winRateA}%</span>
                    <span className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">動態勝率</span>
                    <span className="text-[#2979FF] text-sm">{matchupResults.winRateB}%</span>
                  </div>
                  <div className="w-full h-3 bg-[#21262D] rounded-full overflow-hidden flex shadow-inner border border-[#30363D]">
                    <div
                      style={{ width: `${matchupResults.winRateA}%` }}
                      className="bg-[#FF9100] transition-all"
                    />
                    <div
                      style={{ width: `${matchupResults.winRateB}%` }}
                      className="bg-[#2979FF] transition-all"
                    />
                  </div>
                </div>

                <div className="text-xs text-gray-400 font-mono text-center">
                  淨效率差{' '}
                  <strong
                    className={`text-sm ${matchupResults.netDiff >= 0 ? 'text-[#FF9100]' : 'text-[#2979FF]'}`}
                  >
                    {matchupResults.netDiff > 0
                      ? `+${matchupResults.netDiff}`
                      : matchupResults.netDiff}
                  </strong>
                </div>
              </div>

              {/* 客隊 (Team B：資訊緊湊、Logo 放大) */}
              <div className="w-[39%] bg-[#161B22]/85 border border-[#2979FF]/40 rounded-xl p-3.5 flex items-center justify-between shadow-lg">
                <div className="shrink-0 flex items-center justify-center">
                  <CardTeamLogo teamName={teamB} color="#2979FF" />
                </div>

                <div className="space-y-1 text-right flex-1 pl-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <h3 className="text-lg font-black text-[#2979FF] truncate">{teamB}</h3>
                    <span className="text-[10px] text-gray-400 font-mono font-bold">TEAM B</span>
                  </div>

                  <div className="text-xs text-gray-300 space-y-0.5">
                    <div>
                      推演得分：<span className="text-xl font-black font-mono text-white mr-1">{matchupResults.scoreB}</span> 分
                    </div>
                    <div className="text-[11px] text-gray-300">
                      先發火力：<strong className="text-white">{aggB.rawStarterPts.toFixed(1)}</strong> 分 · 板凳：<strong className="text-white">{aggB.rawBenchPts.toFixed(1)}</strong> 分
                    </div>
                    <div className="text-[11px]">
                      球權負荷：
                      <span className={`font-bold mr-1 ${aggB.totalUsg > 115 ? 'text-red-400' : 'text-amber-300'}`}>
                        {aggB.totalUsg.toFixed(1)}% {aggB.totalUsg > 115 && '(嚴重排擠)'}
                      </span>
                    </div>
                    <div className="text-[11px]">
                      洋將檢驗：
                      <span className="text-purple-400 font-bold mr-1">
                        先發 {foreignStatsB.starters}/2 · 登錄 {foreignStatsB.total}/3
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. 卡片中下部：先發 5 人 ＋ 替補席陣容 (防止折行修復) */}
            <div className="grid grid-cols-2 gap-4 z-10">
              {/* 主隊陣容 */}
              <div className="bg-[#161B22]/70 border border-[#21262D] rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between border-b border-[#21262D] pb-1">
                  <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                    {teamA} • 先發五人 (Starting 5)
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">
                    先發火力 {aggA.rawStarterPts.toFixed(1)} PTS
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1.5 text-center">
                  {startersA.map((p, idx) => (
                    <div
                      key={idx}
                      className="bg-[#0E1117] p-1.5 rounded-lg border border-[#30363D]/70"
                    >
                      <div className="text-[9px] font-mono text-gray-500 font-bold truncate">
                        {p?.position || `P${idx + 1}`}
                      </div>
                      <div className="text-xs font-bold text-white truncate max-w-[85px] mx-auto">
                        {p?.player_name || '未指派'}
                      </div>
                      <div className="text-[10px] text-[#FF9100] font-mono font-bold mt-0.5">
                        {p ? `${p.ppg}分` : '-'}
                      </div>
                      <div className="text-[8px] text-gray-500">
                        {p?.identity === '洋將' ? '洋將' : '本土'}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-1 border-t border-[#21262D]/60">
                  <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
                    替補席 ({benchA.length}人 • 戰力支援 {aggA.rawBenchPts.toFixed(1)}分)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {benchA.map((p) => (
                      <span
                        key={p.player_name}
                        className="px-2 py-0.5 rounded bg-[#0E1117] border border-[#21262D] text-[10px] font-mono text-gray-300 whitespace-nowrap inline-flex items-center"
                      >
                        #{p.jersey_number} {p.player_name}
                        <span className="text-emerald-400 font-bold ml-1">{p.ppg}分</span>
                      </span>
                    ))}
                    {benchA.length === 0 && (
                      <span className="text-[10px] text-gray-500">無指定替補球員</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 客隊陣容 */}
              <div className="bg-[#161B22]/70 border border-[#21262D] rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between border-b border-[#21262D] pb-1">
                  <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">
                    {teamB} • 先發五人 (Starting 5)
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">
                    先發火力 {aggB.rawStarterPts.toFixed(1)} PTS
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1.5 text-center">
                  {startersB.map((p, idx) => (
                    <div
                      key={idx}
                      className="bg-[#0E1117] p-1.5 rounded-lg border border-[#30363D]/70"
                    >
                      <div className="text-[9px] font-mono text-gray-500 font-bold truncate">
                        {p?.position || `P${idx + 1}`}
                      </div>
                      <div className="text-xs font-bold text-white truncate max-w-[85px] mx-auto">
                        {p?.player_name || '未指派'}
                      </div>
                      <div className="text-[10px] text-[#2979FF] font-mono font-bold mt-0.5">
                        {p ? `${p.ppg}分` : '-'}
                      </div>
                      <div className="text-[8px] text-gray-500">
                        {p?.identity === '洋將' ? '洋將' : '本土'}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-1 border-t border-[#21262D]/60">
                  <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
                    替補席 ({benchB.length}人 • 戰力支援 {aggB.rawBenchPts.toFixed(1)}分)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {benchB.map((p) => (
                      <span
                        key={p.player_name}
                        className="px-2 py-0.5 rounded bg-[#0E1117] border border-[#21262D] text-[10px] font-mono text-gray-300 whitespace-nowrap inline-flex items-center"
                      >
                        #{p.jersey_number} {p.player_name}
                        <span className="text-emerald-400 font-bold ml-1">{p.ppg}分</span>
                      </span>
                    ))}
                    {benchB.length === 0 && (
                      <span className="text-[10px] text-gray-500">無指定替補球員</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 4. 底層四大進階攻防數據：改為精緻「雙色長條圖 (Dual-Color Progress Bar)」 */}
            <div className="grid grid-cols-4 gap-3 z-10 pt-1">
              {[
                { label: '投籃效率 (eFG%)', valA: aggA.efg, valB: aggB.efg, suffix: '%' },
                { label: '全隊籃板 (14人)', valA: aggA.totalReb, valB: aggB.totalReb, suffix: '' },
                { label: '全隊助攻 (14人)', valA: aggA.totalAst, valB: aggB.totalAst, suffix: '' },
                { label: '防守壓迫 (STL+BLK)', valA: aggA.totalStocks, valB: aggB.totalStocks, suffix: '' },
              ].map((item) => {
                const [widthA, widthB] = calcDualBarWidths(item.valA, item.valB);
                return (
                  <div key={item.label} className="bg-[#161B22] p-2.5 rounded-xl border border-[#21262D]">
                    <div className="flex justify-between items-center text-[10px] text-gray-400 font-bold mb-1">
                      <span>{item.label}</span>
                      <span className="font-mono">
                        <span className="text-[#FF9100]">{item.valA}{item.suffix}</span> :{' '}
                        <span className="text-[#2979FF]">{item.valB}{item.suffix}</span>
                      </span>
                    </div>
                    <div className="w-full h-2 bg-[#21262D] rounded-full overflow-hidden flex shadow-inner">
                      <div style={{ width: `${widthA}%` }} className="bg-[#FF9100] transition-all" />
                      <div style={{ width: `${widthB}%` }} className="bg-[#2979FF] transition-all" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 5. 卡片最底部：版權與官方網址 */}
            <div className="flex items-center justify-between pt-2 border-t border-[#21262D] text-[11px] text-gray-500 font-mono z-10">
              <span>POWERED BY DEAN OLIVER 4-FACTORS & TACTICAL WOWY MATRIX</span>
              <span className="text-[#FF9100] font-bold">tpbl-advstats.com/matchup</span>
            </div>
          </div>
        </div>

        {/* 底部操作按鈕 */}
        <div className="flex items-center justify-end space-x-3 pt-2">
          <button
            type="button"
            onClick={handleNativeShare}
            disabled={isExporting}
            className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-[#21262D] hover:bg-[#30363D] text-white text-xs font-bold border border-[#30363D] transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-[#00E676]" />
                <span className="text-[#00E676]">已複製戰報文字</span>
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
            <span>{isExporting ? '高清渲染中...' : '下載 16:9 全景戰報圖'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
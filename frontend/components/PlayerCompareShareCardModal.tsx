'use client';

import React, { useRef, useState } from 'react';
import { Download, Share2, X, Sparkles, Check, Crown } from 'lucide-react';
import {
  AdvStatsCircleLogo,
  CardPlayerAvatar,
  calcDualBarWidths,
  downloadDataUrl,
  exportCardToPng,
} from './ShareCardCommon';

export interface PlayerShareSide {
  name: string;
  stage: string;
  team: string;
  jersey?: string;
  position?: string;
  identity?: string;
  gamesPlayed: number;
  mpg: number;
  ppg: number;
  tsPct: number;
  usgPct: number;
  onOffDiff: number | null; // null 表示該賽季無 PBP On/Off，改顯示 plusMinus
  plusMinus: number;
  q4Ppg: number | null;
  q4TsPct: number | null;
  gmsc: number;
  rpg: number;
  apg: number;
}

interface RadarDim {
  key: string;
  label: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  playerA: PlayerShareSide;
  playerB: PlayerShareSide;
  radarMode: 'traditional' | 'situational';
  poolLabel: string;
  currentDims: RadarDim[];
  polyA: string;
  polyB: string;
}

const CARD_WIDTH = 900;
const CARD_HEIGHT = 1125;

export default function PlayerCompareShareCardModal({
  isOpen,
  onClose,
  playerA,
  playerB,
  radarMode,
  poolLabel,
  currentDims,
  polyA,
  polyB,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const isSamePlayerCrossSeason =
    playerA.name.trim() === playerB.name.trim() && playerA.stage !== playerB.stage;

  const center = 175;
  const radius = 122;

  // On/Off 顯示邏輯：若任一方有 On/Off 淨效率差則顯示 On/Off，否則退回場均正負值 (+/-)
  const useOnOff = playerA.onOffDiff !== null || playerB.onOffDiff !== null;
  const valOnOffA = useOnOff ? (playerA.onOffDiff ?? 0) : playerA.plusMinus;
  const valOnOffB = useOnOff ? (playerB.onOffDiff ?? 0) : playerB.plusMinus;
  const hasOnOffA = useOnOff ? playerA.onOffDiff !== null : true;
  const hasOnOffB = useOnOff ? playerB.onOffDiff !== null : true;

  const hasQ4 = playerA.q4Ppg !== null || playerB.q4Ppg !== null;
  const q4ValA = playerA.q4Ppg ?? 0;
  const q4ValB = playerB.q4Ppg ?? 0;

  const statRows: {
    label: string;
    subLabel?: string;
    valA: number;
    valB: number;
    dispA: string;
    dispB: string;
    lowerBetter?: boolean;
    availableA?: boolean;
    availableB?: boolean;
  }[] = [
    {
      label: '場均得分 (PPG)',
      valA: playerA.ppg,
      valB: playerB.ppg,
      dispA: playerA.ppg.toFixed(1),
      dispB: playerB.ppg.toFixed(1),
    },
    {
      label: '真實命中率 (TS%)',
      valA: playerA.tsPct,
      valB: playerB.tsPct,
      dispA: `${playerA.tsPct.toFixed(1)}%`,
      dispB: `${playerB.tsPct.toFixed(1)}%`,
    },
    {
      label: '球權使用率 (USG%)',
      valA: playerA.usgPct,
      valB: playerB.usgPct,
      dispA: `${playerA.usgPct.toFixed(1)}%`,
      dispB: `${playerB.usgPct.toFixed(1)}%`,
    },
    {
      label: useOnOff ? 'On/Off 淨效率差' : '場均正負值 (+/-)',
      subLabel: useOnOff ? 'PBP WOWY' : 'Box +/-',
      valA: valOnOffA,
      valB: valOnOffB,
      dispA: hasOnOffA ? `${valOnOffA > 0 ? '+' : ''}${valOnOffA.toFixed(1)}` : '—',
      dispB: hasOnOffB ? `${valOnOffB > 0 ? '+' : ''}${valOnOffB.toFixed(1)}` : '—',
      availableA: hasOnOffA,
      availableB: hasOnOffB,
    },
    {
      label: hasQ4 ? '末節 Clutch (Q4 得分)' : '單場表現 (GmSc)',
      subLabel: hasQ4 ? 'Q4 TS%' : '綜合效率',
      valA: hasQ4 ? q4ValA : playerA.gmsc,
      valB: hasQ4 ? q4ValB : playerB.gmsc,
      dispA: hasQ4
        ? playerA.q4Ppg !== null
          ? `${playerA.q4Ppg.toFixed(1)}分${playerA.q4TsPct !== null ? ` (${playerA.q4TsPct.toFixed(0)}%)` : ''}`
          : '—'
        : playerA.gmsc.toFixed(1),
      dispB: hasQ4
        ? playerB.q4Ppg !== null
          ? `${playerB.q4Ppg.toFixed(1)}分${playerB.q4TsPct !== null ? ` (${playerB.q4TsPct.toFixed(0)}%)` : ''}`
          : '—'
        : playerB.gmsc.toFixed(1),
      availableA: hasQ4 ? playerA.q4Ppg !== null : true,
      availableB: hasQ4 ? playerB.q4Ppg !== null : true,
    },
    {
      label: '籃板 / 助攻 (RPG · APG)',
      valA: playerA.rpg + playerA.apg,
      valB: playerB.rpg + playerB.apg,
      dispA: `${playerA.rpg.toFixed(1)} / ${playerA.apg.toFixed(1)}`,
      dispB: `${playerB.rpg.toFixed(1)} / ${playerB.apg.toFixed(1)}`,
    },
  ];

  const winsCount = statRows.reduce(
    (acc, r) => {
      if (r.availableA === false || r.availableB === false) return acc;
      if (r.valA > r.valB) acc.a += 1;
      else if (r.valB > r.valA) acc.b += 1;
      return acc;
    },
    { a: 0, b: 0 }
  );

  const handleDownload = async () => {
    if (!cardRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const dataUrl = await exportCardToPng(cardRef.current, CARD_WIDTH, CARD_HEIGHT);
      downloadDataUrl(
        dataUrl,
        `TPBL_4-5_Compare_${playerA.name}_vs_${playerB.name}.png`
      );
    } catch (err) {
      console.error('球員對決圖卡輸出失敗:', err);
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
        `TPBL_Compare_${playerA.name}_vs_${playerB.name}.png`,
        { type: 'image/png' }
      );

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `TPBL 球員對決：${playerA.name} vs ${playerB.name}`,
          text: `${playerA.name} (${playerA.stage}) vs ${playerB.name} (${playerB.stage}) 進階數據正面對決！詳見：tpbl-advstats.com/player-cards`,
          files: [file],
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(
          `【TPBL 球員戰力卡正面對決】\n${playerA.name} (${playerA.stage}) vs ${playerB.name} (${playerB.stage})\nPPG：${playerA.ppg.toFixed(1)} vs ${playerB.ppg.toFixed(1)} | TS%：${playerA.tsPct.toFixed(1)}% vs ${playerB.tsPct.toFixed(1)}%\n👉 完整六維雷達對比：https://tpbl-advstats.com/player-cards`
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

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[#161B22] border border-[#30363D] rounded-2xl max-w-5xl w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto">
        {/* 頂部操作列 */}
        <div className="flex items-center justify-between pb-3 border-b border-[#21262D]">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-[#FF9100]" />
            <h3 className="text-sm sm:text-base font-black text-white">
              Threads 4:5 球員正面對決圖卡
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

        {/* 圖卡預覽區 */}
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
              style={{ background: 'radial-gradient(circle, rgba(0,230,118,0.15) 0%, rgba(0,230,118,0) 70%)' }}
            />

            {/* 1. 頂部品牌列：左上角圓形 ADV STATS 新 Logo */}
            <div className="flex items-center justify-between pb-3.5 border-b border-[#21262D] z-10">
              <div className="flex items-center gap-3.5">
                <AdvStatsCircleLogo size={48} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black tracking-wider text-white uppercase">
                      TPBL ADVSTATS PRO
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#FF9100]/15 text-[#FF9100] border border-[#FF9100]/40 text-[11px] font-bold">
                      {isSamePlayerCrossSeason ? '跨賽季進化對決' : 'HEAD-TO-HEAD 對決'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 font-mono mt-0.5">
                    雷達模型：{radarMode === 'traditional' ? '傳統基礎六維' : '情境高階六維'} · 基準池：{poolLabel}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-[11px] font-mono text-gray-400">關鍵指標領先數</div>
                <div className="text-sm font-black font-mono">
                  <span className="text-[#FF9100]">{winsCount.a}</span>
                  <span className="text-gray-500 mx-1">:</span>
                  <span className="text-[#00E676]">{winsCount.b}</span>
                </div>
              </div>
            </div>

            {/* 2. 雙人基礎資料區 */}
            <div className="grid grid-cols-11 gap-3 items-center z-10">
              {/* 球員 A */}
              <div className="col-span-5 bg-[#161B22]/90 border border-[#FF9100]/45 rounded-2xl p-4 flex items-center gap-3.5 shadow-lg">
                <CardPlayerAvatar
                  playerName={playerA.name}
                  accentColor="#FF9100"
                  sizeClass="w-20 h-20"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#FF9100] shrink-0" />
                    <span className="text-[11px] font-mono font-bold text-[#FF9100] truncate">
                      {playerA.stage}
                    </span>
                  </div>
                  <div className="text-xl font-black text-white truncate mt-0.5">
                    {playerA.name}
                  </div>
                  <div className="text-xs text-gray-300 font-bold truncate">
                    {playerA.team} · #{playerA.jersey || '-'} · {playerA.position || '-'}
                  </div>
                  <div className="text-[11px] text-gray-400 font-mono mt-1">
                    {playerA.identity || '球員'} · {playerA.gamesPlayed}場 · {playerA.mpg.toFixed(1)}分
                  </div>
                </div>
              </div>

              {/* 中央 VS */}
              <div className="col-span-1 flex flex-col items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-[#161B22] border border-[#30363D] flex items-center justify-center text-xs font-black italic text-gray-300 shadow">
                  VS
                </div>
              </div>

              {/* 球員 B */}
              <div className="col-span-5 bg-[#161B22]/90 border border-[#00E676]/45 rounded-2xl p-4 flex items-center gap-3.5 flex-row-reverse text-right shadow-lg">
                <CardPlayerAvatar
                  playerName={playerB.name}
                  accentColor="#00E676"
                  sizeClass="w-20 h-20"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="text-[11px] font-mono font-bold text-[#00E676] truncate">
                      {playerB.stage}
                    </span>
                    <span className="w-2 h-2 rounded-full bg-[#00E676] shrink-0" />
                  </div>
                  <div className="text-xl font-black text-white truncate mt-0.5">
                    {playerB.name}
                  </div>
                  <div className="text-xs text-gray-300 font-bold truncate">
                    {playerB.team} · #{playerB.jersey || '-'} · {playerB.position || '-'}
                  </div>
                  <div className="text-[11px] text-gray-400 font-mono mt-1">
                    {playerB.identity || '球員'} · {playerB.gamesPlayed}場 · {playerB.mpg.toFixed(1)}分
                  </div>
                </div>
              </div>
            </div>

            {/* 3. 重疊六維雷達圖 */}
            <div className="bg-[#161B22]/75 border border-[#21262D] rounded-2xl p-4 z-10 flex flex-col items-center">
              <div className="w-full flex items-center justify-between text-xs font-bold px-2 mb-1">
                <div className="flex items-center gap-1.5 text-[#FF9100]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FF9100]" />
                  <span>{playerA.name}</span>
                  <span className="text-[11px] font-mono opacity-80">({playerA.stage.slice(2, 9)})</span>
                </div>
                <span className="text-[11px] text-gray-400 font-mono uppercase tracking-wider">
                  6D RADAR OVERLAY
                </span>
                <div className="flex items-center gap-1.5 text-[#00E676]">
                  <span className="text-[11px] font-mono opacity-80">({playerB.stage.slice(2, 9)})</span>
                  <span>{playerB.name}</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-[#00E676]" />
                </div>
              </div>

              <svg viewBox="0 0 350 350" className="w-[300px] h-[300px] select-none">
                {[0.25, 0.5, 0.75, 1.0].map((scale) => {
                  const pts = currentDims
                    .map((_, i) => {
                      const angle = (Math.PI / 3) * i - Math.PI / 2;
                      const r = radius * scale;
                      return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
                    })
                    .join(' ');
                  return (
                    <polygon
                      key={scale}
                      points={pts}
                      fill="none"
                      stroke="#30363D"
                      strokeWidth="1"
                      strokeDasharray={scale === 1 ? 'none' : '3 3'}
                    />
                  );
                })}
                {currentDims.map((_, i) => {
                  const angle = (Math.PI / 3) * i - Math.PI / 2;
                  return (
                    <line
                      key={i}
                      x1={center}
                      y1={center}
                      x2={center + radius * Math.cos(angle)}
                      y2={center + radius * Math.sin(angle)}
                      stroke="#30363D"
                      strokeWidth="1"
                    />
                  );
                })}
                {polyA && (
                  <polygon
                    points={polyA
                      .split(' ')
                      .map((pt) => {
                        const [ox, oy] = pt.split(',').map(Number);
                        // 將原 400x400 (center=200, radius=145) 座標等比例映射到 350x350 (center=175, radius=122)
                        const nx = center + ((ox - 200) / 145) * radius;
                        const ny = center + ((oy - 200) / 145) * radius;
                        return `${nx.toFixed(2)},${ny.toFixed(2)}`;
                      })
                      .join(' ')}
                    fill="#FF9100"
                    fillOpacity="0.32"
                    stroke="#FF9100"
                    strokeWidth="2.5"
                  />
                )}
                {polyB && (
                  <polygon
                    points={polyB
                      .split(' ')
                      .map((pt) => {
                        const [ox, oy] = pt.split(',').map(Number);
                        const nx = center + ((ox - 200) / 145) * radius;
                        const ny = center + ((oy - 200) / 145) * radius;
                        return `${nx.toFixed(2)},${ny.toFixed(2)}`;
                      })
                      .join(' ')}
                    fill="#00E676"
                    fillOpacity="0.32"
                    stroke="#00E676"
                    strokeWidth="2.5"
                  />
                )}
                {currentDims.map((d, i) => {
                  const angle = (Math.PI / 3) * i - Math.PI / 2;
                  const lx = center + (radius + 24) * Math.cos(angle);
                  const ly = center + (radius + 17) * Math.sin(angle);
                  return (
                    <text
                      key={d.key}
                      x={lx}
                      y={ly + 4}
                      fill={radarMode === 'situational' ? '#C084FC' : '#CBD5E1'}
                      fontSize="11"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {d.label.split(' ')[0]}
                    </text>
                  );
                })}
              </svg>
            </div>

            {/* 4. 關鍵進階數據勝負亮點對比 */}
            <div className="bg-[#161B22]/85 border border-[#30363D] rounded-2xl p-4 z-10 space-y-2.5">
              {statRows.map((row) => {
                const canCompare = row.availableA !== false && row.availableB !== false;
                const aWins = canCompare && (row.lowerBetter ? row.valA < row.valB : row.valA > row.valB);
                const bWins = canCompare && (row.lowerBetter ? row.valB < row.valA : row.valB > row.valA);
                const [wA, wB] = calcDualBarWidths(
                  Math.max(0, row.valA),
                  Math.max(0, row.valB)
                );
                return (
                  <div key={row.label} className="space-y-1">
                    <div className="grid grid-cols-12 items-center text-xs">
                      <div className="col-span-4 flex items-center gap-1.5 font-mono font-black">
                        <span className={aWins ? 'text-[#FF9100] text-sm' : 'text-gray-300'}>
                          {row.dispA}
                        </span>
                        {aWins && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#FF9100]/20 text-[#FF9100] text-[10px] font-black border border-[#FF9100]/40">
                            <Crown className="w-2.5 h-2.5" /> WIN
                          </span>
                        )}
                      </div>
                      <div className="col-span-4 text-center">
                        <span className="text-[11px] font-bold text-gray-300">{row.label}</span>
                      </div>
                      <div className="col-span-4 flex items-center justify-end gap-1.5 font-mono font-black">
                        {bWins && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#00E676]/20 text-[#00E676] text-[10px] font-black border border-[#00E676]/40">
                            WIN <Crown className="w-2.5 h-2.5" />
                          </span>
                        )}
                        <span className={bWins ? 'text-[#00E676] text-sm' : 'text-gray-300'}>
                          {row.dispB}
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-[#0E1117] rounded-full overflow-hidden flex border border-[#21262D]">
                      <div style={{ width: `${wA}%` }} className="bg-[#FF9100]" />
                      <div style={{ width: `${wB}%` }} className="bg-[#00E676]" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 5. 底部浮水印：右下角 tpbl-advstats.com */}
            <div className="flex items-center justify-between pt-3 border-t border-[#21262D] text-xs font-mono z-10">
              <span className="text-gray-500">
                TPBL PLAYER CARDS · ADVANCED PERCENTILE & CLUTCH ENGINE
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
                <span className="text-[#00E676]">已複製對決數據</span>
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
            <span>{isExporting ? '高清渲染中...' : '下載 4:5 對決圖卡'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useRef, useState } from 'react';
import { Download, Share2, X, Sparkles, Check, Flame } from 'lucide-react';
import {
  AdvStatsCircleLogo,
  CardPlayerAvatar,
  downloadDataUrl,
  exportCardToPng,
} from './ShareCardCommon';

export interface SinglePlayerArchetype {
  id: string;
  name: string;
  enName: string;
}

export interface SinglePlayerShareData {
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
  efgPct: number;
  usgPct: number;
  rpg: number;
  apg: number;
  gmsc: number;
  plusMinus: number;
  onOffDiff: number | null;
  q4Ppg: number | null;
  q4TsPct: number | null;
  paintPct: number | null;
  threePct: number | null;
  midPct: number | null;
  ptsPr?: number;
  tsPr?: number;
  gmscPr?: number;
  prPrefix?: string;
  poolLabel: string;
  archetypes: SinglePlayerArchetype[];
}

interface RadarDim {
  key: string;
  label: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  player: SinglePlayerShareData;
  radarMode: 'traditional' | 'situational';
  currentDims: RadarDim[];
  radarScores?: Record<string, number>;
  poly: string;
}

const CARD_WIDTH = 900;
const CARD_HEIGHT = 1125;

export default function PlayerSingleShareCardModal({
  isOpen,
  onClose,
  player,
  radarMode,
  currentDims,
  radarScores,
  poly,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const center = 165;
  const radius = 115;

  const formatPrBadge = (pr?: number) => {
    if (pr === undefined || !Number.isFinite(pr)) return null;
    const rounded = Math.round(pr);
    const label = `${player.prPrefix || ''}PR ${rounded}`;
    const tone =
      rounded >= 90
        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
        : rounded >= 75
        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
        : 'bg-[#21262D] text-gray-300 border-[#30363D]';
    return (
      <span className={`px-2 py-0.5 rounded-md border text-[10px] font-mono font-black ${tone}`}>
        {label}
      </span>
    );
  };

  const handleDownload = async () => {
    if (!cardRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const dataUrl = await exportCardToPng(cardRef.current, CARD_WIDTH, CARD_HEIGHT);
      downloadDataUrl(dataUrl, `TPBL_4-5_Player_${player.name}_${player.stage}.png`);
    } catch (err) {
      console.error('單人球員圖卡輸出失敗:', err);
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
      const file = new File([blob], `TPBL_Player_${player.name}.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `TPBL 球員戰力卡：${player.name} (${player.team})`,
          text: `${player.name}｜${player.stage}\n場均 ${player.ppg.toFixed(1)} 分 · TS% ${player.tsPct.toFixed(1)}% · GmSc ${player.gmsc.toFixed(1)}\n詳細雷達與進階數據：tpbl-advstats.com/player-cards`,
          files: [file],
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(
          `【TPBL 球員戰力卡】${player.name} (${player.team} #${player.jersey || '-'})\n賽季：${player.stage}\n場均 ${player.ppg.toFixed(1)} 分 | TS% ${player.tsPct.toFixed(1)}% | USG% ${player.usgPct.toFixed(1)}% | GmSc ${player.gmsc.toFixed(1)}\n👉 完整六維雷達：https://tpbl-advstats.com/player-cards`
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
              Threads 4:5 單人球員戰力圖卡
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
              style={{ background: 'radial-gradient(circle, rgba(255,145,0,0.18) 0%, rgba(255,145,0,0) 70%)' }}
            />
            <div
              className="absolute -bottom-36 -right-36 w-96 h-96 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.16) 0%, rgba(168,85,247,0) 70%)' }}
            />

            {/* 1. 頂部品牌列：左上角圓形 ADV STATS 新 Logo + 賽季/球隊/背號/位置/身份 */}
            <div className="flex items-center justify-between pb-4 border-b border-[#21262D] z-10">
              <div className="flex items-center gap-3.5">
                <AdvStatsCircleLogo size={48} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black tracking-wider text-white uppercase">
                      TPBL ADVSTATS PRO
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-[#FF9100]/15 text-[#FF9100] border border-[#FF9100]/40 text-[11px] font-bold">
                      {player.stage}
                    </span>
                  </div>
                  <div className="text-xs text-gray-300 font-bold mt-0.5">
                    {player.team} · #{player.jersey || '-'} · {player.position || '-'} · {player.identity || '球員'}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-[11px] font-mono text-gray-400">出賽場數 / 基準池</div>
                <div className="text-xs font-black text-white font-mono mt-0.5">
                  {player.gamesPlayed} GP · {player.poolLabel}
                </div>
              </div>
            </div>

            {/* 2. 上半部主視覺：左側半身照 + GMSC PR 徽章 / 右側姓名 + 定位標籤 + 4 項核心數據卡 */}
            <div className="grid grid-cols-12 gap-5 items-stretch z-10">
              {/* 左側：高清半身照 + 聯盟 GMSC PR 徽章 */}
              <div className="col-span-5 bg-[#161B22]/90 border border-[#FF9100]/40 rounded-2xl p-4 flex flex-col items-center justify-between shadow-xl">
                <CardPlayerAvatar
                  playerName={player.name}
                  accentColor="#FF9100"
                  sizeClass="w-48 h-52"
                />

                <div className="w-full mt-3 pt-3 border-t border-[#21262D] flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    聯盟 GMSC 評級
                  </span>
                  {player.gmscPr !== undefined && Number.isFinite(player.gmscPr) ? (
                    <span className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-300 border border-amber-500/50 text-xs font-mono font-black">
                      {player.prPrefix || ''}PR {Math.round(player.gmscPr)}
                    </span>
                  ) : (
                    <span className="text-xs font-mono font-bold text-gray-400">
                      GmSc {player.gmsc.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>

              {/* 右側：姓名、角色定位標籤、4 項核心數據卡 */}
              <div className="col-span-7 flex flex-col justify-between gap-3">
                <div className="bg-[#161B22]/85 border border-[#30363D] rounded-2xl p-5 space-y-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-3xl font-black text-white tracking-tight truncate">
                      {player.name}
                    </h2>
                    <span className="text-xs font-mono text-[#FF9100] font-bold shrink-0">
                      RPG {player.rpg.toFixed(1)} · APG {player.apg.toFixed(1)}
                    </span>
                  </div>

                  {/* 角色定位標籤 */}
                  <div className="flex flex-wrap gap-1.5">
                    {player.archetypes.slice(0, 4).map((b) => (
                      <span
                        key={b.id}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#FF9100]/15 text-amber-300 border border-[#FF9100]/35"
                      >
                        {b.name}{' '}
                        <span className="opacity-70 font-mono text-[10px] font-normal">
                          ({b.enName})
                        </span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* 4 項核心數據卡 */}
                <div className="grid grid-cols-2 gap-3 flex-1">
                  <div className="bg-[#161B22]/90 border border-[#21262D] rounded-2xl p-3.5 flex flex-col justify-between">
                    <span className="text-xs text-gray-400 font-bold">場均時間 (MPG)</span>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-2xl font-black font-mono text-white">
                        {player.mpg.toFixed(1)}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">分鐘</span>
                    </div>
                  </div>

                  <div className="bg-[#161B22]/90 border border-[#FF9100]/35 rounded-2xl p-3.5 flex flex-col justify-between">
                    <span className="text-xs text-gray-400 font-bold">場均得分 (PPG)</span>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-2xl font-black font-mono text-[#FF9100]">
                        {player.ppg.toFixed(1)}
                      </span>
                      {formatPrBadge(player.ptsPr)}
                    </div>
                  </div>

                  <div className="bg-[#161B22]/90 border border-[#21262D] rounded-2xl p-3.5 flex flex-col justify-between">
                    <span className="text-xs text-gray-400 font-bold">真實命中率 (TS%)</span>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-2xl font-black font-mono text-amber-300">
                        {player.tsPct.toFixed(1)}%
                      </span>
                      {formatPrBadge(player.tsPr)}
                    </div>
                  </div>

                  <div className="bg-[#161B22]/90 border border-[#21262D] rounded-2xl p-3.5 flex flex-col justify-between">
                    <span className="text-xs text-gray-400 font-bold">單場表現 (GmSc)</span>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-2xl font-black font-mono text-white">
                        {player.gmsc.toFixed(1)}
                      </span>
                      {formatPrBadge(player.gmscPr)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. 下半部：單人六維雷達圖 + 關鍵進階亮點摘要 */}
            <div className="grid grid-cols-12 gap-5 items-stretch z-10">
              {/* 單人六維雷達圖 */}
              <div className="col-span-6 bg-[#161B22]/85 border border-[#30363D] rounded-2xl p-4 flex flex-col items-center justify-between">
                <div className="w-full flex items-center justify-between border-b border-[#21262D] pb-2">
                  <span className="text-xs font-black text-white">
                    {radarMode === 'traditional' ? '傳統基礎六維雷達' : '情境高階六維雷達'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      radarMode === 'situational'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                        : 'bg-[#FF9100]/20 text-[#FF9100] border border-[#FF9100]/40'
                    }`}
                  >
                    {radarMode === 'situational' ? '情境高階' : '傳統基礎'}
                  </span>
                </div>

                <svg viewBox="0 0 330 330" className="w-[290px] h-[290px] select-none my-1">
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
                  {poly && (
                    <polygon
                      points={poly
                        .split(' ')
                        .map((pt) => {
                          const [ox, oy] = pt.split(',').map(Number);
                          const nx = center + ((ox - 200) / 145) * radius;
                          const ny = center + ((oy - 200) / 145) * radius;
                          return `${nx.toFixed(2)},${ny.toFixed(2)}`;
                        })
                        .join(' ')}
                      fill={radarMode === 'situational' ? '#A855F7' : '#FF9100'}
                      fillOpacity="0.34"
                      stroke={radarMode === 'situational' ? '#C084FC' : '#FF9100'}
                      strokeWidth="2.5"
                    />
                  )}
                  {currentDims.map((d, i) => {
                    const angle = (Math.PI / 3) * i - Math.PI / 2;
                    const lx = center + (radius + 25) * Math.cos(angle);
                    const ly = center + (radius + 18) * Math.sin(angle);
                    return (
                      <text
                        key={d.key}
                        x={lx}
                        y={ly + 4}
                        fill={radarMode === 'situational' ? '#D8B4FE' : '#CBD5E1'}
                        fontSize="11"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {d.label.split(' ')[0]}
                      </text>
                    );
                  })}
                </svg>

                <div className="w-full grid grid-cols-3 gap-1.5 pt-2 border-t border-[#21262D] text-center">
                  {currentDims.map((d) => {
                    const score = radarScores?.[d.key];
                    return (
                      <div key={d.key} className="bg-[#0E1117] rounded-lg py-1 px-1.5">
                        <div className="text-[10px] text-gray-400 truncate">
                          {d.label.split(' ')[0]}
                        </div>
                        <div className="text-xs font-mono font-black text-white">
                          {score !== undefined && Number.isFinite(score) ? Math.round(score) : '-'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 右側：進階攻守亮點摘要 */}
              <div className="col-span-6 bg-[#161B22]/85 border border-[#30363D] rounded-2xl p-5 flex flex-col justify-between space-y-3">
                <div className="flex items-center gap-2 border-b border-[#21262D] pb-2.5">
                  <Flame className="w-4 h-4 text-[#FF9100]" />
                  <span className="text-xs font-black text-white uppercase tracking-wider">
                    進階戰力亮點摘要 (ADVANCED HIGHLIGHTS)
                  </span>
                </div>

                <div className="space-y-3 flex-1 flex flex-col justify-center">
                  <div className="bg-[#0E1117] border border-[#21262D] rounded-xl p-3.5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-gray-300">球權負荷 & 投籃效率</div>
                      <div className="text-[11px] text-gray-500 font-mono">USG% / eFG%</div>
                    </div>
                    <div className="text-right font-mono">
                      <span className="text-base font-black text-[#FF9100]">
                        {player.usgPct.toFixed(1)}%
                      </span>
                      <span className="text-gray-500 mx-1.5">/</span>
                      <span className="text-base font-black text-amber-300">
                        {player.efgPct.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <div className="bg-[#0E1117] border border-[#21262D] rounded-xl p-3.5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-gray-300">
                        {player.onOffDiff !== null ? 'On/Off 淨效率差' : '場均正負值 (+/-)'}
                      </div>
                      <div className="text-[11px] text-gray-500 font-mono">
                        {player.onOffDiff !== null ? 'PBP WOWY 場上場下差值' : 'Box Score Plus/Minus'}
                      </div>
                    </div>
                    {(() => {
                      const val = player.onOffDiff !== null ? player.onOffDiff : player.plusMinus;
                      return (
                        <span
                          className={`text-xl font-black font-mono ${
                            val >= 0 ? 'text-[#00E676]' : 'text-red-400'
                          }`}
                        >
                          {val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)}
                        </span>
                      );
                    })()}
                  </div>

                  <div className="bg-[#0E1117] border border-[#21262D] rounded-xl p-3.5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-gray-300">末節 Clutch (Q4 表現)</div>
                      <div className="text-[11px] text-gray-500 font-mono">
                        第四節場均得分 · 真實命中率
                      </div>
                    </div>
                    {player.q4Ppg !== null ? (
                      <div className="text-right font-mono">
                        <span className="text-base font-black text-purple-300">
                          {player.q4Ppg.toFixed(1)} 分
                        </span>
                        {player.q4TsPct !== null && (
                          <div className="text-[11px] text-gray-400">
                            TS% {player.q4TsPct.toFixed(1)}%
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs font-mono text-gray-500">無 PBP 末節紀錄</span>
                    )}
                  </div>

                  <div className="bg-[#0E1117] border border-[#21262D] rounded-xl p-3.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-gray-300">得分熱區分佈</span>
                      <span className="text-[10px] text-gray-500 font-mono">禁區 / 三分 / 中距離</span>
                    </div>
                    {player.paintPct !== null && player.threePct !== null && player.midPct !== null ? (
                      <div className="grid grid-cols-3 gap-2 text-center font-mono">
                        <div className="bg-[#161B22] rounded-lg py-1.5">
                          <div className="text-[10px] text-gray-400">油漆區</div>
                          <div className="text-sm font-black text-[#FF9100]">
                            {player.paintPct.toFixed(0)}%
                          </div>
                        </div>
                        <div className="bg-[#161B22] rounded-lg py-1.5">
                          <div className="text-[10px] text-gray-400">三分外線</div>
                          <div className="text-sm font-black text-[#38BDF8]">
                            {player.threePct.toFixed(0)}%
                          </div>
                        </div>
                        <div className="bg-[#161B22] rounded-lg py-1.5">
                          <div className="text-[10px] text-gray-400">中距離</div>
                          <div className="text-sm font-black text-[#00E676]">
                            {player.midPct.toFixed(0)}%
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 font-mono">
                        需逐場 PBP 投籃紀錄（當前賽季支援）
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 4. 底部浮水印：右下角 tpbl-advstats.com */}
            <div className="flex items-center justify-between pt-3 border-t border-[#21262D] text-xs font-mono z-10">
              <span className="text-gray-500">
                TPBL PLAYER CARDS · 6D RADAR & ADVANCED PERCENTILE
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
                <span className="text-[#00E676]">已複製球員戰力摘要</span>
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
            <span>{isExporting ? '高清渲染中...' : '下載 4:5 球員戰力卡'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

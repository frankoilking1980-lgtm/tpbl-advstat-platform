'use client';

import React from 'react';

interface ShotStats {
  fga: number;
  fgm: number;
  fg_pct: number;
}

export interface PlayerSituationsData {
  team: string;
  number: string;
  position: string;
  games_played: number;
  mpg: number;
  ppg: number;
  point_composition: {
    paint_pct: number;
    paint_ppg: number;
    three_pt_pct: number;
    three_pt_ppg: number;
    mid_range_pct: number;
    mid_range_ppg: number;
    free_throw_pct: number;
    free_throw_ppg: number;
  };
  tactical_situations: {
    fast_break: { ppg: number; share_pct: number; fg_pct: number };
    second_chance: { ppg: number; share_pct: number; fg_pct: number };
    points_off_tov: { ppg: number; share_pct: number };
  };
  finishing_breakdown: {
    jump_shot_total: ShotStats;
    two_jump_shot: ShotStats;
    three_jump_shot: ShotStats;
    layup: ShotStats;
    dunk: ShotStats;
    self_created: ShotStats;
  };
  q4_crunch_time: {
    q4_games: number;
    q4_mpg: number;
    q4_ppg: number;
    q4_fg_pct: number;
    q4_ts_pct: number;
    q4_tov_pg: number;
    q4_plus_minus_pg: number;
  };
}

interface Props {
  activeTab: 'scoring' | 'q4';
  data?: PlayerSituationsData;
}

export default function PlayerSituationsTab({ activeTab, data }: Props) {
  if (!data) {
    return (
      <div className="py-12 text-center text-xs text-gray-500 bg-[#0d1117] rounded-xl border border-gray-800/80">
        此球員於 2026-2027 例行賽尚無詳細情境數據紀錄
      </div>
    );
  }

  const { point_composition: comp, tactical_situations: tac, finishing_breakdown: fin, q4_crunch_time: q4 } = data;

  if (activeTab === 'scoring') {
    return (
      <div className="space-y-4">
        {/* 1. 得分來源幾何構成 (互斥加總 = 100%) */}
        <div className="bg-[#161b22] border border-gray-800 rounded-xl p-4 shadow-inner">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-200 tracking-wider">🎯 得分分佈比例 (加總 100%)</span>
            <span className="text-[11px] text-gray-500 font-mono">場均 {data.ppg} 分 • {data.games_played} 場</span>
          </div>

          {/* 堆疊長條圖 */}
          <div className="h-3 w-full bg-gray-900 rounded-full overflow-hidden flex mb-3 border border-gray-800">
            <div 
              style={{ width: `${comp.paint_pct}%` }} 
              className="bg-amber-500 h-full transition-all" 
              title={`禁區得分: ${comp.paint_ppg}分 (${comp.paint_pct}%)`}
            />
            <div 
              style={{ width: `${comp.three_pt_pct}%` }} 
              className="bg-sky-400 h-full transition-all" 
              title={`三分外線: ${comp.three_pt_ppg}分 (${comp.three_pt_pct}%)`}
            />
            <div 
              style={{ width: `${comp.mid_range_pct}%` }} 
              className="bg-purple-400 h-full transition-all" 
              title={`中距離跳投: ${comp.mid_range_ppg}分 (${comp.mid_range_pct}%)`}
            />
            <div 
              style={{ width: `${comp.free_throw_pct}%` }} 
              className="bg-emerald-400 h-full transition-all" 
              title={`罰球得分: ${comp.free_throw_ppg}分 (${comp.free_throw_pct}%)`}
            />
          </div>

          {/* 四大互斥分佈標籤 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-[#0e1117] p-2.5 rounded-lg border border-gray-800/80">
              <div className="flex items-center gap-1.5 text-amber-400 font-semibold mb-1 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                禁區 (Paint)
              </div>
              <div className="text-sm font-bold text-gray-100">{comp.paint_ppg} <span className="text-[10px] font-normal text-gray-500">分</span></div>
              <div className="text-[10px] text-gray-400 mt-0.5">{comp.paint_pct}% 總得分比</div>
            </div>

            <div className="bg-[#0e1117] p-2.5 rounded-lg border border-gray-800/80">
              <div className="flex items-center gap-1.5 text-sky-400 font-semibold mb-1 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                三分 (3-Point)
              </div>
              <div className="text-sm font-bold text-gray-100">{comp.three_pt_ppg} <span className="text-[10px] font-normal text-gray-500">分</span></div>
              <div className="text-[10px] text-gray-400 mt-0.5">{comp.three_pt_pct}% 總得分比</div>
            </div>

            <div className="bg-[#0e1117] p-2.5 rounded-lg border border-gray-800/80">
              <div className="flex items-center gap-1.5 text-purple-400 font-semibold mb-1 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                中距離 (Mid)
              </div>
              <div className="text-sm font-bold text-gray-100">{comp.mid_range_ppg} <span className="text-[10px] font-normal text-gray-500">分</span></div>
              <div className="text-[10px] text-gray-400 mt-0.5">{comp.mid_range_pct}% 總得分比</div>
            </div>

            <div className="bg-[#0e1117] p-2.5 rounded-lg border border-gray-800/80">
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold mb-1 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                罰球 (FT)
              </div>
              <div className="text-sm font-bold text-gray-100">{comp.free_throw_ppg} <span className="text-[10px] font-normal text-gray-500">分</span></div>
              <div className="text-[10px] text-gray-400 mt-0.5">{comp.free_throw_pct}% 總得分比</div>
            </div>
          </div>
        </div>

        {/* 2. 戰術反擊與拼勁情境 (Tactical Play Types) */}
        <div className="bg-[#161b22] border border-gray-800 rounded-xl p-4 shadow-inner">
          <div className="text-xs font-bold text-gray-300 tracking-wider mb-2.5">⚡ 戰術推進與反擊情境</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-[#0e1117] p-2.5 rounded-lg border border-gray-800/80">
              <div className="text-gray-400 text-[11px] mb-0.5">快攻轉換 (Fast Break)</div>
              <div className="text-sm font-bold text-cyan-400">{tac.fast_break.ppg} <span className="text-[10px] font-normal text-gray-500">PPG</span></div>
              <div className="text-[10px] text-gray-500 mt-0.5">命中率: <span className="text-gray-300 font-medium">{tac.fast_break.fg_pct}%</span></div>
            </div>

            <div className="bg-[#0e1117] p-2.5 rounded-lg border border-gray-800/80">
              <div className="text-gray-400 text-[11px] mb-0.5">二次進攻 (2nd Chance)</div>
              <div className="text-sm font-bold text-emerald-400">{tac.second_chance.ppg} <span className="text-[10px] font-normal text-gray-500">PPG</span></div>
              <div className="text-[10px] text-gray-500 mt-0.5">命中率: <span className="text-gray-300 font-medium">{tac.second_chance.fg_pct}%</span></div>
            </div>

            <div className="bg-[#0e1117] p-2.5 rounded-lg border border-gray-800/80">
              <div className="text-gray-400 text-[11px] mb-0.5">抓失誤反擊 (Off TOV)</div>
              <div className="text-sm font-bold text-purple-400">{tac.points_off_tov.ppg} <span className="text-[10px] font-normal text-gray-500">PPG</span></div>
              <div className="text-[10px] text-gray-500 mt-0.5">佔比: <span className="text-gray-300 font-medium">{tac.points_off_tov.share_pct}%</span></div>
            </div>
          </div>
        </div>

        {/* 3. 終結手法細分 (總跳投、兩分跳投、三分外線全數精確吻合) */}
        <div className="bg-[#161b22] border border-gray-800 rounded-xl p-4 shadow-inner">
          <div className="text-xs font-bold text-gray-300 tracking-wider mb-2.5">🗡️ 終結手段與把握度</div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            {/* 兩分跳投 */}
            <div className="bg-[#0e1117] p-2.5 rounded-lg border border-gray-800/80 flex justify-between items-center">
              <div>
                <div className="text-purple-400 text-[11px] font-semibold">兩分中距跳投</div>
                <div className="text-sm font-bold text-gray-100">{fin.two_jump_shot.fgm}/{fin.two_jump_shot.fga}</div>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-purple-400">{fin.two_jump_shot.fg_pct}%</span>
              </div>
            </div>

            {/* 三分外線跳投 (完整命中/出手，不漏算急停與後撤) */}
            <div className="bg-[#0e1117] p-2.5 rounded-lg border border-gray-800/80 flex justify-between items-center">
              <div>
                <div className="text-sky-400 text-[11px] font-semibold">三分外線 (全部)</div>
                <div className="text-sm font-bold text-gray-100">{fin.three_jump_shot.fgm}/{fin.three_jump_shot.fga}</div>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-sky-400">{fin.three_jump_shot.fg_pct}%</span>
              </div>
            </div>

            {/* 總跳投合計 (高亮藍色卡片) */}
            <div className="bg-[#0e1117] p-2.5 rounded-lg border border-blue-500/40 bg-blue-500/5 flex justify-between items-center">
              <div>
                <div className="text-blue-300 text-[11px] font-bold">總跳投合計 (Total JS)</div>
                <div className="text-sm font-bold text-white">{fin.jump_shot_total.fgm}/{fin.jump_shot_total.fga}</div>
              </div>
              <div className="text-right">
                <span className="text-xs font-black text-blue-400">{fin.jump_shot_total.fg_pct}%</span>
              </div>
            </div>

            {/* 突破上籃 */}
            <div className="bg-[#0e1117] p-2.5 rounded-lg border border-gray-800/80 flex justify-between items-center">
              <div>
                <div className="text-emerald-400 text-[11px] font-semibold">突破 / 上籃 (Layup)</div>
                <div className="text-sm font-bold text-gray-100">{fin.layup.fgm}/{fin.layup.fga}</div>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-emerald-400">{fin.layup.fg_pct}%</span>
              </div>
            </div>

            {/* 灌籃 */}
            <div className="bg-[#0e1117] p-2.5 rounded-lg border border-gray-800/80 flex justify-between items-center">
              <div>
                <div className="text-amber-400 text-[11px] font-semibold">禁區灌籃 (Dunk)</div>
                <div className="text-sm font-bold text-gray-100">{fin.dunk.fgm}/{fin.dunk.fga}</div>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-amber-400">{fin.dunk.fg_pct}%</span>
              </div>
            </div>

            {/* 自創單打 */}
            <div className="bg-[#0e1117] p-2.5 rounded-lg border border-gray-800/80 flex justify-between items-center">
              <div>
                <div className="text-rose-400 text-[11px] font-semibold">單打自創 (Pull-up/Fade)</div>
                <div className="text-sm font-bold text-gray-100">{fin.self_created.fgm}/{fin.self_created.fga}</div>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-rose-400">{fin.self_created.fg_pct}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Q4 Crunch Time Tab
  return (
    <div className="space-y-4">
      <div className="bg-[#161b22] border border-gray-800 rounded-xl p-4 shadow-inner">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-amber-400 tracking-wider">⏱️ 第四節 (Q4) 抗壓與關鍵表現</span>
          <span className="text-[11px] text-gray-500 font-mono">出戰 Q4: {q4.q4_games} 場</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <div className="bg-[#0e1117] p-2.5 rounded-lg border border-gray-800/80 text-center">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Q4 場均得分</div>
            <div className="text-base font-bold text-amber-400">{q4.q4_ppg}</div>
            <div className="text-[10px] text-gray-500 mt-0.5 font-mono">{q4.q4_mpg} MIN/Q4</div>
          </div>

          <div className="bg-[#0e1117] p-2.5 rounded-lg border border-gray-800/80 text-center">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Q4 真實命中率</div>
            <div className="text-base font-bold text-emerald-400">{q4.q4_ts_pct}%</div>
            <div className="text-[10px] text-gray-500 mt-0.5 font-mono">FG: {q4.q4_fg_pct}%</div>
          </div>

          <div className="bg-[#0e1117] p-2.5 rounded-lg border border-gray-800/80 text-center">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Q4 場均正負值</div>
            <div className={`text-base font-bold ${q4.q4_plus_minus_pg >= 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
              {q4.q4_plus_minus_pg > 0 ? `+${q4.q4_plus_minus_pg}` : q4.q4_plus_minus_pg}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">團隊淨勝分</div>
          </div>

          <div className="bg-[#0e1117] p-2.5 rounded-lg border border-gray-800/80 text-center">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Q4 失誤控管</div>
            <div className="text-base font-bold text-gray-200">{q4.q4_tov_pg}</div>
            <div className="text-[10px] text-gray-500 mt-0.5 font-mono">TOV / 節</div>
          </div>
        </div>

        <div className="text-[11px] text-gray-400 bg-gray-900/60 p-2.5 rounded-lg border border-gray-800/60 leading-relaxed">
          💡 <span className="font-semibold text-gray-300">數據解讀：</span>
          衡量球員在末節防守加壓下的攻防產出。TS% 反映終結把握度，正負值體現其在場時球隊的勝負傾向。
        </div>
      </div>
    </div>
  );
}
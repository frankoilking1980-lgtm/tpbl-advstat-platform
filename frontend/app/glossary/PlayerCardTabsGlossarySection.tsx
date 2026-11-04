'use client';

import React from 'react';
import { Target, Zap, Clock, ShieldAlert, BarChart3, Crosshair } from 'lucide-react';

export default function PlayerCardTabsGlossarySection() {
  return (
    <div className="space-y-8 text-gray-200">
      {/* 區塊前言 */}
      <div className="border-b border-[#30363D] pb-4">
        <h2 className="text-2xl font-black text-white flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#FF9100]" />
          🎴 球員卡三大分頁解析與戰術解讀指南
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          本平台球員卡摒棄傳統籠統的場均數據，拆解為「綜合戰力」、「得分情境與終結手段」以及「末節決勝抗壓」三大維度。本章節詳細說明各項指標的分子分母公式與戰術解讀思維。
        </p>
      </div>

      {/* Tab 1: 綜合戰力 (Overview) */}
      <section className="rounded-2xl border border-amber-500/30 bg-[#161B22] p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2 text-amber-400 font-black text-lg">
          <BarChart3 className="w-5 h-5" />
          <span>Tab 1：綜合戰力 (Overview) — 全能六維與全聯盟定位</span>
        </div>

        <p className="text-xs text-gray-300 leading-relaxed">
          採用標準化常模（Z-Score / Percentile）衡量球員在攻守各維度的聯盟位階，直觀呈現球員的優劣勢雷達。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div className="bg-[#0E1117] p-4 rounded-xl border border-gray-800 space-y-2">
            <span className="font-bold text-amber-300 font-sans block text-sm">六維雷達指標構成</span>
            <ul className="space-y-1.5 text-gray-300">
              <li><span className="text-white font-bold">得分 (Scoring)：</span> 結合 PPG 與 USG% 評估產量爆發力。</li>
              <li><span className="text-white font-bold">投射 (Shooting)：</span> eFG% 與三分外線質量的綜合評定。</li>
              <li><span className="text-white font-bold">組織 (Playmaking)：</span> APG 與助攻失誤比（AST/TOV）的導傳視野。</li>
              <li><span className="text-white font-bold">籃板 (Rebounding)：</span> 進攻/防守籃板率（ORB% / DRB%）的拼搶度。</li>
              <li><span className="text-white font-bold">防守 (Defense)：</span> 抄截、阻攻、犯規控制與防守正負值。</li>
              <li><span className="text-white font-bold">效率 (Efficiency)：</span> 真實命中率 TS% 與單場產能 GmSc。</li>
            </ul>
          </div>

          <div className="bg-[#0E1117] p-4 rounded-xl border border-gray-800 space-y-2">
            <span className="font-bold text-amber-300 font-sans block text-sm">Percentile Ranking (PR 值) 標籤</span>
            <p className="text-gray-300 font-sans leading-relaxed">
              將所有達標輪替球員由小到大排序。數值代表<span className="text-amber-400 font-bold">「擊敗全聯盟多少百分比的球員」</span>：
            </p>
            <div className="space-y-1 pt-1">
              <div><span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/50">PR 90+</span> <span className="font-sans text-gray-400">頂級菁英（聯盟前 10%）</span></div>
              <div><span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/50">PR 75-89</span> <span className="font-sans text-gray-400">優秀先發水平</span></div>
              <div><span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/50">PR 50-74</span> <span className="font-sans text-gray-400">合格輪替球員</span></div>
              <div><span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/50">PR &lt; 25</span> <span className="font-sans text-gray-400">需改善之短板</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* Tab 2: 得分情境與終結 (Scoring & Finishing) */}
      <section className="rounded-2xl border border-cyan-500/30 bg-[#161B22] p-6 shadow-xl space-y-5">
        <div className="flex items-center gap-2 text-cyan-400 font-black text-lg">
          <Target className="w-5 h-5" />
          <span>Tab 2：得分情境與終結手段 (Scoring & Finishing) — 拆解進攻武器庫</span>
        </div>

        <p className="text-xs text-gray-300 leading-relaxed">
          解決「只看得分多寡，看不出得分手段」的問題。將球員的得分從幾何落點（加總 100%）、戰術反擊產能、以及個別終結動作進行嚴密量化。
        </p>

        {/* 1. 得分分佈比例 */}
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            1. 得分幾何分佈（Scoring Distribution，加總嚴格 100%）
          </h4>
          <p className="text-xs text-gray-400">
            以球員每場的總得分為分母，將其得分精確劃分為互斥的四種幾何產出來源：
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
            <div className="bg-[#0E1117] p-3 rounded-xl border border-gray-800">
              <span className="text-amber-400 font-bold block mb-1">禁區 (Paint PTS %)</span>
              <p className="text-gray-400 text-[11px] leading-relaxed">
                油漆區內上籃、勾射、灌籃所得分數。佔比高代表球員以衝擊籃框、空手切或低位單打為生。
              </p>
            </div>
            <div className="bg-[#0E1117] p-3 rounded-xl border border-gray-800">
              <span className="text-sky-400 font-bold block mb-1">三分 (3-Point PTS %)</span>
              <p className="text-gray-400 text-[11px] leading-relaxed">
                外線投射總得分（命中數 × 3）。反映空間牽制力與現代魔球體系中的三分依賴度。
              </p>
            </div>
            <div className="bg-[#0E1117] p-3 rounded-xl border border-gray-800">
              <span className="text-purple-400 font-bold block mb-1">中距離 (Mid-Range PTS %)</span>
              <p className="text-gray-400 text-[11px] leading-relaxed">
                三分線內但禁區外的兩分跳投得分。中距離是季後賽陣地戰防守緊縮時的頂級硬解指標。
              </p>
            </div>
            <div className="bg-[#0E1117] p-3 rounded-xl border border-gray-800">
              <span className="text-emerald-400 font-bold block mb-1">罰球 (Free Throw PTS %)</span>
              <p className="text-gray-400 text-[11px] leading-relaxed">
                站上罰球線的得分（命中數 × 1）。反映球員的造犯規能力與身體對抗殺傷力。
              </p>
            </div>
          </div>
        </div>

        {/* 2. 戰術推進與反擊情境 */}
        <div className="space-y-3 pt-2">
          <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            2. 戰術推進與反擊情境（Tactical Situations，非互斥獨立統計）
          </h4>
          <div className="bg-[#0E1117] p-4 rounded-xl border border-gray-800 space-y-3 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <span className="text-cyan-400 font-bold block mb-1">⚡ 快攻轉換 (Fast Break)</span>
                <p className="text-gray-400 text-[11px] leading-relaxed">
                  <span className="text-white font-bold">PPG：</span>場均快攻得分。<br />
                  <span className="text-white font-bold">命中率：</span>快攻出手命中數 ÷ 快攻總出手次數。<br />
                  <span className="text-gray-500">解讀：衡量推動攻防轉換、前場偷跑與奔襲終結的威脅。</span>
                </p>
              </div>

              <div>
                <span className="text-emerald-400 font-bold block mb-1">🔄 二次進攻 (2nd Chance)</span>
                <p className="text-gray-400 text-[11px] leading-relaxed">
                  <span className="text-white font-bold">PPG：</span>前場進攻籃板後的場均得分。<br />
                  <span className="text-white font-bold">命中率：</span>二次進攻進球數 ÷ 二次進攻出手數。<br />
                  <span className="text-gray-500">解讀：考驗禁區球員補籃、點搶與二波反應的拼勁與效率。</span>
                </p>
              </div>

              <div>
                <span className="text-purple-400 font-bold block mb-1">🎯 抓失誤反擊 (Off TOV)</span>
                <p className="text-gray-400 text-[11px] leading-relaxed">
                  <span className="text-white font-bold">PPG：</span>對手失誤後的場均轉換得分。<br />
                  <span className="text-white font-bold">佔比 %：</span>抓失誤得分 ÷ 個人全季總得分。<br />
                  <span className="text-gray-500">解讀：反映其得分有多少來自防守抄截反擊（轉換進攻依賴度）。</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 3. 終結手段與把握度 */}
        <div className="space-y-3 pt-2">
          <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            3. 終結手段與把握度（Finishing Breakdown，分子/分母命中率）
          </h4>
          <p className="text-xs text-gray-400">
            下方百分比均為該技術動作的真實投籃命中率（進球數 FGM ÷ 出手數 FGA）：
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs font-mono">
            <div className="bg-[#0E1117] p-3 rounded-xl border border-purple-500/30">
              <span className="text-purple-300 font-bold font-sans block mb-1">兩分中距跳投</span>
              <p className="text-gray-400 text-[11px] font-sans">
                包含兩分定點跳投、急停、後撤步與翻身跳投的合計把握度。
              </p>
            </div>
            <div className="bg-[#0E1117] p-3 rounded-xl border border-sky-500/30">
              <span className="text-sky-300 font-bold font-sans block mb-1">三分外線 (全部)</span>
              <p className="text-gray-400 text-[11px] font-sans">
                涵蓋定點、急停、後撤步等所有三分出手。命中率與 Box Score 三分命中率一致。
              </p>
            </div>
            <div className="bg-[#0E1117] p-3 rounded-xl border border-blue-500/40 bg-blue-500/5">
              <span className="text-blue-300 font-bold font-sans block mb-1">總跳投合計 (Total JS)</span>
              <p className="text-gray-400 text-[11px] font-sans">
                (兩分進球 + 三分進球) ÷ (兩分出手 + 三分出手)。衡量球員純跳投基本盤。
              </p>
            </div>
            <div className="bg-[#0E1117] p-3 rounded-xl border border-emerald-500/30">
              <span className="text-emerald-300 font-bold font-sans block mb-1">突破 / 上籃 (Layup)</span>
              <p className="text-gray-400 text-[11px] font-sans">
                包含切入禁區後的普通挑籃、對抗上籃與反手上籃的終結把握度。
              </p>
            </div>
            <div className="bg-[#0E1117] p-3 rounded-xl border border-amber-500/30">
              <span className="text-amber-300 font-bold font-sans block mb-1">禁區灌籃 (Dunk)</span>
              <p className="text-gray-400 text-[11px] font-sans">
                空接、快攻灌籃與補灌的絕對禁區終結表現。
              </p>
            </div>
            <div className="bg-[#0E1117] p-3 rounded-xl border border-rose-500/30">
              <span className="text-rose-300 font-bold font-sans block mb-1">單打自創 (Pull-up / Fade)</span>
              <p className="text-gray-400 text-[11px] font-sans">
                持球急停跳投、後撤步（Step-back）與後仰跳投（Fadeaway）的無掩護硬解把握度。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Tab 3: 末節決勝抗壓 (Q4 Crunch Time) */}
      <section className="rounded-2xl border border-emerald-500/30 bg-[#161B22] p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2 text-emerald-400 font-black text-lg">
          <Clock className="w-5 h-5" />
          <span>Tab 3：末節決勝抗壓 (Q4 Crunch Time) — 關鍵先生判定</span>
        </div>

        <p className="text-xs text-gray-300 leading-relaxed">
          籃球比賽中前三節與第四節的防守對抗強度截然不同。本分頁直接過濾 Round 4（第四節）數據，排除垃圾時間無出賽者，量化評估球員在體能臨界點與比分膠著時的抗壓表現。
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="bg-[#0E1117] p-4 rounded-xl border border-gray-800 space-y-1">
            <span className="text-amber-400 font-bold block text-sm">Q4 場均得分 (Q4 PPG)</span>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              第四節總得分 ÷ 實際出戰第四節的場次。配合 Q4 MPG（第四節出場分鐘數），判斷教練團在末節是否信任該球員並賦予關鍵終結球權。
            </p>
          </div>

          <div className="bg-[#0E1117] p-4 rounded-xl border border-gray-800 space-y-1">
            <span className="text-emerald-400 font-bold block text-sm">Q4 真實命中率 (Q4 TS%)</span>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              公式：Q4 得分 ÷ [2 × (Q4 FGA + 0.44 × Q4 FTA)]。考量罰球與三分的真實終結把握度。若 Q4 TS% 高於全場平均，代表該球員具備「大心臟」抗壓特質。
            </p>
          </div>

          <div className="bg-[#0E1117] p-4 rounded-xl border border-gray-800 space-y-1">
            <span className="text-cyan-400 font-bold block text-sm">Q4 場均正負值 (Q4 +/-)</span>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              球員在第四節在場時，球隊的淨勝分傾向。正值表示該球員在末節攻防兩端能實質幫助球隊拉開或鎖定比分。
            </p>
          </div>

          <div className="bg-[#0E1117] p-4 rounded-xl border border-gray-800 space-y-1">
            <span className="text-rose-400 font-bold block text-sm">Q4 失誤控管 (Q4 TOV/節)</span>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              第四節平均每節失誤次數。末節對手往往提升全場壓迫，持球後衛此數值若 ≤ 0.8 次，代表在高壓防守下具備極佳的球權安全度。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
'use client';

import React, { useEffect, useState } from 'react';

interface TeamSituation {
  team_name: string;
  games_played: number;
  ppg: number;
  starter: { ppg: number; share_pct: number };
  bench: { ppg: number; share_pct: number };
  local: { ppg: number; share_pct: number };
  import: { ppg: number; share_pct: number };
  shot_distribution: {
    two_pt_fga_pg: number;
    two_pt_share_pct: number;
    three_pt_fga_pg: number;
    three_pt_share_pct: number;
  };
}

export default function TeamSituationsMatrix() {
  const [data, setData] = useState<TeamSituation[]>([]);
  const [activeTab, setActiveTab] = useState<'bench' | 'import' | 'shots'>('bench');

  useEffect(() => {
    fetch('/team_situations_stats.json')
      .then((res) => res.json())
      .then((json) => {
        if (json?.teams) setData(json.teams);
      })
      .catch(() => {});
  }, []);

  if (data.length === 0) return null;

  return (
    <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-6 shadow-xl my-8">
      {/* 標題與切換鈕 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-[#21262D] gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF9100]"></span>
            團隊火力構成與戰術矩陣
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            透過官方逐場 JSON 深度拆解先發板凳深度、本土洋將佔比與出手偏好
          </p>
        </div>

        <div className="flex bg-[#0E1117] p-1 rounded-lg border border-[#30363D] text-xs">
          <button
            onClick={() => setActiveTab('bench')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all ${
              activeTab === 'bench' ? 'bg-[#FF9100] text-black font-bold' : 'text-gray-400 hover:text-white'
            }`}
          >
            先發 vs 板凳
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all ${
              activeTab === 'import' ? 'bg-[#00E676] text-black font-bold' : 'text-gray-400 hover:text-white'
            }`}
          >
            本土 vs 洋將
          </button>
          <button
            onClick={() => setActiveTab('shots')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all ${
              activeTab === 'shots' ? 'bg-[#2979FF] text-white font-bold' : 'text-gray-400 hover:text-white'
            }`}
          >
            兩分 vs 三分出手
          </button>
        </div>
      </div>

      {/* 列表內容 */}
      <div className="mt-6 space-y-4">
        {data.map((team, idx) => {
          let leftVal = 0, rightVal = 0, leftPct = 0, rightPct = 0;
          let leftLabel = '', rightLabel = '';
          let leftColor = '', rightColor = '';
          let unit = '分';

          if (activeTab === 'bench') {
            leftVal = team.starter.ppg;
            leftPct = team.starter.share_pct;
            leftLabel = '先發';
            leftColor = 'bg-[#FF9100]';

            rightVal = team.bench.ppg;
            rightPct = team.bench.share_pct;
            rightLabel = '板凳';
            rightColor = 'bg-[#388E3C]';
            unit = '分';
          } else if (activeTab === 'import') {
            leftVal = team.local.ppg;
            leftPct = team.local.share_pct;
            leftLabel = '本土';
            leftColor = 'bg-[#00E676]';

            rightVal = team.import.ppg;
            rightPct = team.import.share_pct;
            rightLabel = '洋將';
            rightColor = 'bg-[#E040FB]';
            unit = '分';
          } else {
            leftVal = team.shot_distribution.two_pt_fga_pg;
            leftPct = team.shot_distribution.two_pt_share_pct;
            leftLabel = '兩分出手';
            leftColor = 'bg-[#2979FF]';

            rightVal = team.shot_distribution.three_pt_fga_pg;
            rightPct = team.shot_distribution.three_pt_share_pct;
            rightLabel = '三分出手';
            rightColor = 'bg-[#FFD600]';
            unit = '次';
          }

          return (
            <div key={team.team_name} className="p-4 bg-[#0E1117] rounded-lg border border-[#21262D]">
              <div className="flex justify-between items-center text-sm font-semibold mb-2">
                <span className="text-white flex items-center gap-2">
                  <span className="text-gray-500 text-xs w-4">#{idx + 1}</span>
                  {team.team_name}
                  <span className="text-xs font-normal text-gray-400">（場均 {team.ppg} 分）</span>
                </span>
                <span className="text-xs text-gray-300">
                  <span className="font-bold">{leftLabel}</span> {leftVal} {unit} ({leftPct}%)
                  <span className="mx-2 text-gray-600">|</span>
                  <span className="font-bold">{rightLabel}</span> {rightVal} {unit} ({rightPct}%)
                </span>
              </div>

              {/* 雙色佔比進度條 */}
              <div className="w-full h-3 bg-[#21262D] rounded-full overflow-hidden flex">
                <div
                  style={{ width: `${leftPct}%` }}
                  className={`${leftColor} transition-all duration-500`}
                  title={`${leftLabel}: ${leftPct}%`}
                ></div>
                <div
                  style={{ width: `${rightPct}%` }}
                  className={`${rightColor} transition-all duration-500`}
                  title={`${rightLabel}: ${rightPct}%`}
                ></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
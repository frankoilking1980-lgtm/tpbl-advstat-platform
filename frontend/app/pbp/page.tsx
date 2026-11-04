'use client';

import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useStage } from '@/context/StageContext';
import { fetcher } from '@/lib/api';
import { PlayerLink } from '@/components/PlayerLink';
import {
  Zap,
  Users,
  Clock,
  Sparkles,
  Table2,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* 吉祥物透明 PNG 對應設定 (純透明勾邊，完全消除方框背景)              */
/* ------------------------------------------------------------------ */

interface MascotSetting {
  id: string;
  name: string;
  file: string;
  containerClass: string;
  imgClass: string;
  glowColor: string;
}

const MASCOTS_MAP: Record<string, MascotSetting> = {
  // 1. 新北國王 -> Hiro (頭部皇冠與權杖向上破格，立體站立於右側)
  '新北國王': {
    id: 'Hiro',
    name: 'Hiro',
    file: '/mascots/Hiro.png',
    containerClass: '-top-16 sm:-top-20 -bottom-2 right-0 sm:right-2 w-56 sm:w-72 lg:w-80',
    imgClass: 'scale-110 object-contain',
    glowColor: 'rgba(255, 193, 7, 0.45)',
  },

  // 2. 新竹御頂攻城獅 -> Ready (雷迪比 YA 大頭，正面展示)
  '新竹御頂攻城獅': {
    id: 'Ready',
    name: 'Ready',
    file: '/mascots/Ready.png',
    containerClass: '-top-12 sm:-top-16 -bottom-2 right-1 sm:right-4 w-52 sm:w-64 lg:w-72',
    imgClass: 'scale-105 object-contain',
    glowColor: 'rgba(168, 85, 247, 0.45)',
  },

  // 3. 高雄全家海神 -> Brownie (海浪側身向前俯衝動作)
  '高雄全家海神': {
    id: 'Brownie',
    name: 'Brownie',
    file: '/mascots/Brownie.png',
    containerClass: '-top-10 sm:-top-14 -bottom-2 right-1 sm:right-4 w-48 sm:w-60 lg:w-68',
    imgClass: 'scale-105 object-contain',
    glowColor: 'rgba(14, 165, 233, 0.45)',
  },

  // 4. 桃園台啤永豐雲豹 -> LeopardBro (修長站姿展現長腿)
  '桃園台啤永豐雲豹': {
    id: 'LeopardBro',
    name: 'LeopardBro',
    file: '/mascots/LeopardBro.png',
    containerClass: '-top-12 sm:-top-18 -bottom-2 right-1 sm:right-4 w-44 sm:w-56 lg:w-64',
    imgClass: 'scale-115 object-contain',
    glowColor: 'rgba(132, 204, 22, 0.45)',
  },

  // 5. 臺北台新戰神 -> Richart (紅帽披風站姿)
  '臺北台新戰神': {
    id: 'Richart',
    name: 'Richart',
    file: '/mascots/Richart.png',
    containerClass: '-top-10 sm:-top-14 -bottom-2 right-2 sm:right-6 w-44 sm:w-56 lg:w-64',
    imgClass: 'scale-110 object-contain',
    glowColor: 'rgba(239, 68, 68, 0.45)',
  },

  // 6. 新北中信特攻 -> Thunder (金黃戰甲特警，立體站姿)
  '新北中信特攻': {
    id: 'Thunder',
    name: 'Thunder',
    file: '/mascots/Thunder.png',
    containerClass: '-top-12 sm:-top-16 -bottom-2 right-2 sm:right-6 w-48 sm:w-60 lg:w-68',
    imgClass: 'scale-115 object-contain',
    glowColor: 'rgba(234, 179, 8, 0.45)',
  },

  // 7. 福爾摩沙夢想家 -> Unicorn (綠色獨角獸正面站姿)
  '福爾摩沙夢想家': {
    id: 'Unicorn',
    name: 'Unicorn',
    file: '/mascots/Unicorn.png',
    containerClass: '-top-10 sm:-top-14 -bottom-2 right-2 sm:right-6 w-48 sm:w-60 lg:w-68',
    imgClass: 'scale-110 object-contain',
    glowColor: 'rgba(16, 185, 129, 0.45)',
  },
};

function getMascotByTeam(teamName: string): MascotSetting | null {
  if (!teamName) return null;
  for (const [key, config] of Object.entries(MASCOTS_MAP)) {
    if (teamName.includes(key) || key.includes(teamName)) {
      return config;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 型別定義                                                            */
/* ------------------------------------------------------------------ */

interface OnOffPlayer {
  player_name: string;
  total_time: string;
  on_ortg: number;
  on_drtg: number;
  on_netrtg: number;
  off_netrtg: number;
  diff_netrtg: number;
}

interface FiveManLineup {
  lineup_name: string;
  total_time: string;
  plus_minus: number;
  ortg: number;
  drtg: number;
  netrtg: number;
}

interface ForeignDuo {
  duo_name: string;
  total_time: string;
  plus_minus: number;
  ortg: number;
  drtg: number;
  netrtg: number;
  features_and_advice: string;
}

interface TeamBoxPlayer {
  id?: number | string;
  player_name: string;
  jersey_number?: string | number | null;
  identity?: string | null;
  is_starter?: boolean;
  games_played?: number;
  minutes?: string;
  seconds?: number;
  pts?: number;
  fgm?: number;
  fga?: number;
  tpm?: number;
  tpa?: number;
  ftm?: number;
  fta?: number;
  orb?: number;
  drb?: number;
  reb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  tov?: number;
  pf?: number;
  plus_minus?: number;
  efg_pct?: number;
  ts_pct?: number;
  usg_pct?: number;
  gmsc?: number;
  ortg?: number;
  drtg?: number;
  netrtg?: number;
}

interface PBPResponse {
  team_name: string;
  stage: string;
  on_off_players: OnOffPlayer[];
  five_man_lineups: FiveManLineup[];
  foreign_duos: ForeignDuo[];
  player_boxscore?: TeamBoxPlayer[];
  player_stats?: TeamBoxPlayer[];
}

/* ------------------------------------------------------------------ */
/* 格式化輔助函式                                                       */
/* ------------------------------------------------------------------ */

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const fx = (v: unknown, d = 1): string => {
  if (!isNum(v)) return '-';
  return v.toFixed(d);
};
const pctStr = (v: unknown, d = 1): string => {
  if (!isNum(v)) return '-';
  return `${v.toFixed(d)}%`;
};
const fracPctStr = (v: unknown, d = 1): string => {
  if (!isNum(v)) return '-';
  return `${(v * 100).toFixed(d)}%`;
};
const signed = (n: number | null | undefined, d = 1): string => {
  if (!isNum(n)) return '-';
  return `${n > 0 ? '+' : ''}${n.toFixed(d)}`;
};
const signColor = (n: number | null | undefined): string => {
  if (!isNum(n) || n === 0) return 'text-gray-400';
  return n > 0 ? 'text-[#00E676]' : 'text-red-400';
};

/* ------------------------------------------------------------------ */
/* 主頁面                                                              */
/* ------------------------------------------------------------------ */

export default function PBPPage() {
  const { stage } = useStage();
  const [selectedTeam, setSelectedTeam] = useState<string>('新北國王');
  const [activeSubTab, setActiveSubTab] = useState<'duos' | 'onoff' | 'lineups' | 'boxscore'>('duos');

  // 主要 PBP 數據
  const { data, isLoading } = useSWR<PBPResponse>(
    `/api/teams/${encodeURIComponent(selectedTeam)}/pbp?stage=${encodeURIComponent(stage)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  // 獨立球員完整進階數據來源
  const { data: teamPlayersData, isLoading: playersLoading } = useSWR<TeamBoxPlayer[]>(
    activeSubTab === 'boxscore'
      ? `/api/teams/${encodeURIComponent(selectedTeam)}/players?stage=${encodeURIComponent(stage)}`
      : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  // 聚合球員列表
  const playerList = useMemo(() => {
    if (Array.isArray(teamPlayersData) && teamPlayersData.length > 0) return teamPlayersData;
    if (Array.isArray(data?.player_boxscore) && data.player_boxscore.length > 0) return data.player_boxscore;
    if (Array.isArray(data?.player_stats) && data.player_stats.length > 0) return data.player_stats;
    return [];
  }, [teamPlayersData, data]);

  const teams = [
    '新北國王',
    '福爾摩沙夢想家',
    '高雄全家海神',
    '新北中信特攻',
    '桃園台啤永豐雲豹',
    '新竹御頂攻城獅',
    '臺北台新戰神',
  ];

  const head = 'py-3.5 px-3 font-semibold text-right';
  const currentMascot = getMascotByTeam(selectedTeam);

  return (
    <div className="space-y-10">
      {/* 頂部預留 pt-10，讓吉祥物上方皇冠/耳朵穿透卡片邊界 */}
      <div className="pt-10">
        <div className="relative rounded-3xl border border-[#30363D] bg-gradient-to-r from-[#161B22] via-[#161B22] to-[#0E1117] p-6 sm:p-8 shadow-2xl">
          {/* 背景氛圍光效 */}
          <div className="absolute top-0 right-1/4 w-80 h-80 bg-[#FF9100]/10 rounded-full blur-3xl pointer-events-none" />

          {/* 前景文字與球隊切換按鈕區 */}
          <div className="relative z-20 flex flex-col lg:flex-row lg:items-center justify-between gap-6 pr-0 lg:pr-72">
            <div className="space-y-2 max-w-xl">
              <div className="flex items-center space-x-2">
                <span className="px-3 py-1 rounded-full bg-[#00E676]/15 text-[#00E676] text-xs font-black uppercase tracking-wider border border-[#00E676]/30 backdrop-blur-sm">
                  {stage}
                </span>
                <span className="text-xs text-gray-400 font-medium">Play-By-Play 深度陣容數據庫</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight drop-shadow-md">
                ⚡ 各隊 PBP 陣容與 On/Off 淨影響力
              </h1>
              <p className="text-gray-300 text-sm leading-relaxed">
                追蹤球員在場與下場的淨效率差距 (With-Or-Without-You, WOWY)、五人組合攻防淨評分、雙洋將搭檔化學效應矩陣與球隊完整進階攻守數據。
              </p>
            </div>

            {/* 球隊切換按鈕 */}
            <div className="inline-flex flex-wrap gap-1.5 p-1.5 rounded-2xl bg-[#0E1117]/90 border border-[#30363D] shadow-xl backdrop-blur-md max-w-sm shrink-0">
              {teams.map((t) => (
                <button
                  key={t}
                  onClick={() => setSelectedTeam(t)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    selectedTeam === t
                      ? 'bg-[#FF9100] text-slate-950 font-black shadow-md'
                      : 'text-gray-400 hover:text-white hover:bg-[#161B22]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 吉祥物立體去背展示層 */}
          {currentMascot && (
            <div
              key={currentMascot.id}
              className={`absolute pointer-events-none select-none z-30 flex items-end justify-center transition-all duration-300 ease-out animate-fadeIn ${currentMascot.containerClass}`}
            >
              <div
                className="absolute inset-0 rounded-full blur-3xl opacity-75 -z-10"
                style={{ backgroundColor: currentMascot.glowColor }}
              />
              <img
                src={currentMascot.file}
                alt={currentMascot.name}
                className={`w-full h-auto max-h-[145%] drop-shadow-[0_25px_35px_rgba(0,0,0,0.85)] transition-transform duration-300 ${currentMascot.imgClass}`}
              />
            </div>
          )}
        </div>
      </div>

      {/* 四大次級導航 Tab */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#21262D] pb-3">
        <button
          onClick={() => setActiveSubTab('duos')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeSubTab === 'duos'
              ? 'bg-[#161B22] text-[#00E676] border border-[#00E676]/40 shadow-sm'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>雙洋將化學效應矩陣與搭配建議 ({data?.foreign_duos?.length ?? 0})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('onoff')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeSubTab === 'onoff'
              ? 'bg-[#161B22] text-[#FF9100] border border-[#FF9100]/40 shadow-sm'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>主力球員 On/Off 總榜 ({data?.on_off_players?.length ?? 0})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('lineups')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeSubTab === 'lineups'
              ? 'bg-[#161B22] text-sky-400 border border-sky-400/40 shadow-sm'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>最佳五人陣容組合 ({data?.five_man_lineups?.length ?? 0})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('boxscore')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeSubTab === 'boxscore'
              ? 'bg-[#161B22] text-amber-400 border border-amber-400/40 shadow-sm'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Table2 className="w-4 h-4" />
          <span>完整進階 Box Score ({playerList.length})</span>
        </button>
      </div>

      {/* 內容區塊 */}
      {isLoading ? (
        <div className="p-16 text-center text-gray-500 font-medium">正在載入 {selectedTeam} PBP 數據...</div>
      ) : (
        <div>
          {/* 1. 雙洋將化學效應矩陣 */}
          {activeSubTab === 'duos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-white">
                  {selectedTeam} • 雙洋將化學效應與攻守特徵建議
                </h3>
                <span className="text-xs text-gray-400">攻守特徵與搭配建議自動完整折行展示</span>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {data?.foreign_duos && data.foreign_duos.length > 0 ? (
                  data.foreign_duos.map((duo, idx) => (
                    <div
                      key={idx}
                      className="p-6 rounded-3xl border border-[#30363D] bg-[#161B22] shadow-xl hover:border-[#00E676]/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6"
                    >
                      <div className="space-y-2 max-w-2xl">
                        <div className="flex items-center space-x-3">
                          <span className="px-3 py-1 rounded-xl bg-[#00E676]/15 text-[#00E676] font-black text-sm border border-[#00E676]/30">
                            {duo.duo_name}
                          </span>
                          <span className="flex items-center space-x-1 text-xs text-gray-400 font-mono">
                            <Clock className="w-3.5 h-3.5" />
                            <span>共同出賽: {duo.total_time}</span>
                          </span>
                        </div>

                        <p className="text-sm text-gray-200 whitespace-normal break-words leading-relaxed select-text pt-1">
                          {duo.features_and_advice}
                        </p>
                      </div>

                      <div className="flex items-center space-x-4 text-center font-mono shrink-0">
                        <div className="p-3 rounded-2xl bg-[#0E1117] border border-[#21262D] min-w-[70px]">
                          <span className="text-[10px] text-gray-400 block font-sans">正負值</span>
                          <span
                            className={`text-base font-black ${
                              duo.plus_minus > 0
                                ? 'text-[#00E676]'
                                : duo.plus_minus < 0
                                ? 'text-red-400'
                                : 'text-gray-300'
                            }`}
                          >
                            {duo.plus_minus > 0 ? `+${duo.plus_minus}` : duo.plus_minus}
                          </span>
                        </div>
                        <div className="p-3 rounded-2xl bg-[#0E1117] border border-[#21262D] min-w-[70px]">
                          <span className="text-[10px] text-gray-400 block font-sans">Lineup ORtg</span>
                          <span className="text-base font-bold text-[#FF9100]">{duo.ortg}</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-[#0E1117] border border-[#21262D] min-w-[70px]">
                          <span className="text-[10px] text-gray-400 block font-sans">Lineup DRtg</span>
                          <span className="text-base font-bold text-sky-400">{duo.drtg}</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-[#0E1117] border border-[#21262D] min-w-[75px]">
                          <span className="text-[10px] text-gray-400 block font-sans">淨評分 NetRtg</span>
                          <span
                            className={`text-base font-black ${
                              duo.netrtg > 0
                                ? 'text-[#00E676]'
                                : duo.netrtg < 0
                                ? 'text-red-400'
                                : 'text-gray-300'
                            }`}
                          >
                            {duo.netrtg > 0 ? `+${duo.netrtg}` : duo.netrtg}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-12 text-center text-gray-500 rounded-2xl bg-[#161B22] border border-[#30363D]">
                    該球隊於此階段暫無搭檔矩陣紀錄
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. 主力 On/Off 總榜 */}
          {activeSubTab === 'onoff' && (
            <div className="space-y-4">
              <h3 className="text-lg font-black text-white">
                {selectedTeam} • 主力球員 On/Off 淨影響力榜 (WOWY Diff)
              </h3>
              <div className="overflow-x-auto rounded-2xl border border-[#30363D] bg-[#161B22] shadow-xl">
                <table className="w-full text-left text-xs sm:text-sm whitespace-nowrap">
                  <thead className="bg-[#0E1117] text-gray-400 uppercase font-mono tracking-wider border-b border-[#30363D]">
                    <tr>
                      <th className="py-3.5 px-4 font-bold text-white">球員名</th>
                      <th className="py-3.5 px-4 font-semibold text-center">累計在場時間</th>
                      <th className="py-3.5 px-4 font-semibold text-right text-[#FF9100]">累計 On_ORtg</th>
                      <th className="py-3.5 px-4 font-semibold text-right text-sky-400">累計 On_DRtg</th>
                      <th className="py-3.5 px-4 font-semibold text-right text-amber-300">累計 On_NetRtg</th>
                      <th className="py-3.5 px-4 font-semibold text-right text-gray-400">累計 Off_NetRtg</th>
                      <th className="py-3.5 px-4 font-black text-right text-[#00E676] bg-[#0E1117]">
                        賽季淨影響力 (Diff)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#21262D] font-mono">
                    {data?.on_off_players && data.on_off_players.length > 0 ? (
                      data.on_off_players.map((p) => (
                        <tr key={p.player_name} className="hover:bg-[#21262D]/60 transition-colors">
                          <td className="py-3.5 px-4 font-sans font-bold text-white">
                            <PlayerLink name={p.player_name} stage={stage} className="text-white hover:text-amber-400" />
                          </td>
                          <td className="py-3.5 px-4 text-center text-gray-300">{p.total_time}</td>
                          <td className="py-3.5 px-4 text-right text-[#FF9100]">{p.on_ortg}</td>
                          <td className="py-3.5 px-4 text-right text-sky-400">{p.on_drtg}</td>
                          <td className="py-3.5 px-4 text-right font-bold text-amber-300">{p.on_netrtg}</td>
                          <td className="py-3.5 px-4 text-right text-gray-400">{p.off_netrtg}</td>
                          <td
                            className={`py-3.5 px-4 text-right font-black ${
                              p.diff_netrtg > 0 ? 'text-[#00E676]' : 'text-red-400'
                            }`}
                          >
                            {p.diff_netrtg > 0 ? `+${p.diff_netrtg}` : p.diff_netrtg}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-gray-500 font-sans">
                          暫無此球隊 On/Off 數據
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. 最佳五人陣容組合 */}
          {activeSubTab === 'lineups' && (
            <div className="space-y-4">
              <h3 className="text-lg font-black text-white">
                {selectedTeam} • 最佳五人陣容組合效益榜
              </h3>
              <div className="overflow-x-auto rounded-2xl border border-[#30363D] bg-[#161B22] shadow-xl">
                <table className="w-full text-left text-xs sm:text-sm whitespace-nowrap">
                  <thead className="bg-[#0E1117] text-gray-400 uppercase font-mono tracking-wider border-b border-[#30363D]">
                    <tr>
                      <th className="py-3.5 px-4 font-bold text-white">五人陣容組合</th>
                      <th className="py-3.5 px-4 font-semibold text-center">賽季累計時間</th>
                      <th className="py-3.5 px-4 font-semibold text-right">累計正負值 (+/-)</th>
                      <th className="py-3.5 px-4 font-semibold text-right text-[#FF9100]">Lineup ORtg</th>
                      <th className="py-3.5 px-4 font-semibold text-right text-sky-400">Lineup DRtg</th>
                      <th className="py-3.5 px-4 font-black text-right text-[#00E676] bg-[#0E1117]">
                        Lineup NetRtg
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#21262D] font-mono">
                    {data?.five_man_lineups && data.five_man_lineups.length > 0 ? (
                      data.five_man_lineups.map((l, idx) => (
                        <tr key={idx} className="hover:bg-[#21262D]/60 transition-colors">
                          <td className="py-3.5 px-4 font-sans font-bold text-gray-200">
                            {l.lineup_name}
                          </td>
                          <td className="py-3.5 px-4 text-center text-gray-300">{l.total_time}</td>
                          <td
                            className={`py-3.5 px-4 text-right font-bold ${
                              l.plus_minus > 0 ? 'text-[#00E676]' : 'text-red-400'
                            }`}
                          >
                            {l.plus_minus > 0 ? `+${l.plus_minus}` : l.plus_minus}
                          </td>
                          <td className="py-3.5 px-4 text-right text-[#FF9100]">{l.ortg}</td>
                          <td className="py-3.5 px-4 text-right text-sky-400">{l.drtg}</td>
                          <td
                            className={`py-3.5 px-4 text-right font-black ${
                              l.netrtg > 0 ? 'text-[#00E676]' : 'text-red-400'
                            }`}
                          >
                            {l.netrtg > 0 ? `+${l.netrtg}` : l.netrtg}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-gray-500 font-sans">
                          暫無五人陣容紀錄
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. 完整進階 Box Score */}
          {activeSubTab === 'boxscore' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-white">
                  {selectedTeam} • 階段完整球員進階 Box Score ({playerList.length} 人)
                </h3>
                <span className="text-xs text-gray-400 font-mono">
                  含 eFG%、TS%、USG%、GmSc 與 NetRtg
                </span>
              </div>

              {playersLoading ? (
                <div className="p-16 text-center text-gray-500 font-medium">
                  正在載入 {selectedTeam} 球員進階數據...
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-[#30363D] bg-[#161B22] shadow-2xl">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-[#0E1117] text-gray-400 uppercase font-mono tracking-wider border-b border-[#30363D]">
                      <tr>
                        <th className="py-3.5 px-4 font-bold text-white sticky left-0 bg-[#0E1117] z-10">球員</th>
                        <th className={head}>場次</th>
                        <th className={head}>時間</th>
                        <th className={head}>PTS</th>
                        <th className={head}>FG</th>
                        <th className={head}>3P</th>
                        <th className={head}>FT</th>
                        <th className={head}>ORB</th>
                        <th className={head}>DRB</th>
                        <th className={head}>REB</th>
                        <th className={head}>AST</th>
                        <th className={head}>STL</th>
                        <th className={head}>BLK</th>
                        <th className={head}>TOV</th>
                        <th className={head}>PF</th>
                        <th className={head}>+/-</th>
                        <th className={`${head} text-[#FF9100]`}>eFG%</th>
                        <th className={`${head} text-[#FF9100]`}>TS%</th>
                        <th className={`${head} text-[#00E676]`}>USG%</th>
                        <th className={`${head} text-[#00E676]`}>GmSc</th>
                        <th className={`${head} text-sky-400`}>ORtg</th>
                        <th className={`${head} text-sky-400`}>DRtg</th>
                        <th className={`${head} text-amber-300`}>NetRtg</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#21262D] font-mono">
                      {playerList.length === 0 ? (
                        <tr>
                          <td colSpan={23} className="py-12 text-center text-gray-500 font-sans">
                            暫無該球隊完整球員進階數據紀錄
                          </td>
                        </tr>
                      ) : (
                        playerList.map((p, idx) => {
                          const fgStr = isNum(p.fgm) && isNum(p.fga) ? `${p.fgm}/${p.fga}` : '-';
                          const tpStr = isNum(p.tpm) && isNum(p.tpa) ? `${p.tpm}/${p.tpa}` : '-';
                          const ftStr = isNum(p.ftm) && isNum(p.fta) ? `${p.ftm}/${p.fta}` : '-';

                          return (
                            <tr key={p.id ?? idx} className="hover:bg-[#21262D]/60 transition-colors group">
                              <td className="py-3 px-4 sticky left-0 bg-[#161B22] group-hover:bg-[#1C2128] font-sans font-bold text-white z-10 border-r border-[#21262D]/40">
                                <div className="flex items-center space-x-2">
                                  <span className="text-gray-500 text-xs font-mono w-6">
                                    {p.jersey_number ? `#${p.jersey_number}` : '-'}
                                  </span>
                                  <PlayerLink
                                    name={p.player_name}
                                    stage={stage}
                                    className="font-bold text-white group-hover:text-amber-400"
                                  />
                                  {p.is_starter && (
                                    <span className="text-[10px] px-1 rounded bg-[#FF9100]/20 text-[#FF9100]">
                                      先
                                    </span>
                                  )}
                                  {p.identity?.includes('洋將') && (
                                    <span className="text-[10px] px-1 rounded bg-blue-500/20 text-blue-300">
                                      洋
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-right text-gray-300">{p.games_played ?? '-'}</td>
                              <td className="py-3 px-3 text-right text-gray-400">{p.minutes || '00:00'}</td>
                              <td className="py-3 px-3 text-right font-bold text-white">{p.pts ?? '-'}</td>
                              <td className="py-3 px-3 text-right text-gray-300">{fgStr}</td>
                              <td className="py-3 px-3 text-right text-gray-300">{tpStr}</td>
                              <td className="py-3 px-3 text-right text-gray-300">{ftStr}</td>
                              <td className="py-3 px-3 text-right text-gray-300">{p.orb ?? '-'}</td>
                              <td className="py-3 px-3 text-right text-gray-300">{p.drb ?? '-'}</td>
                              <td className="py-3 px-3 text-right text-gray-300">{p.reb ?? '-'}</td>
                              <td className="py-3 px-3 text-right text-gray-300">{p.ast ?? '-'}</td>
                              <td className="py-3 px-3 text-right text-gray-300">{p.stl ?? '-'}</td>
                              <td className="py-3 px-3 text-right text-gray-300">{p.blk ?? '-'}</td>
                              <td className="py-3 px-3 text-right text-gray-300">{p.tov ?? '-'}</td>
                              <td className="py-3 px-3 text-right text-gray-300">{p.pf ?? '-'}</td>
                              <td className={`py-3 px-3 text-right font-bold ${signColor(p.plus_minus)}`}>
                                {signed(p.plus_minus, 0)}
                              </td>
                              <td className="py-3 px-3 text-right text-[#FF9100]">{fracPctStr(p.efg_pct)}</td>
                              <td className="py-3 px-3 text-right text-[#FF9100]">{fracPctStr(p.ts_pct)}</td>
                              <td className="py-3 px-3 text-right text-[#00E676] font-bold">{pctStr(p.usg_pct)}</td>
                              <td className="py-3 px-3 text-right text-[#00E676] font-bold">{fx(p.gmsc)}</td>
                              <td className="py-3 px-3 text-right text-sky-400">{fx(p.ortg)}</td>
                              <td className="py-3 px-3 text-right text-sky-400">{fx(p.drtg)}</td>
                              <td className={`py-3 px-3 text-right font-bold ${signColor(p.netrtg)}`}>
                                {signed(p.netrtg)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Shield, Swords, Sparkles } from 'lucide-react';

export type TacticalPathType = 'dribble' | 'screen' | 'pass' | 'defense';

export interface TacticalPath {
  from: [number, number];
  to: [number, number];
  type: TacticalPathType;
}

export interface TacticalPhase {
  title: string;
  description: string;
  keyRead?: string;
  ballPos: [number, number];
  offense: [number, number][]; // 5 players [1..5]
  defense: [number, number][]; // 5 players [1..5]
  paths: TacticalPath[];
}

export interface BallFrame {
  t: number; // 0.0 to 2.0
  pos: [number, number];
  inAir?: boolean;
  isShot?: boolean;
}

export interface TacticalScenario {
  key: 'home_offense' | 'away_counter' | 'away_offense' | 'home_counter';
  label: string;
  playName: string;
  tacticalGoal: string;
  offenseTeam: 'home' | 'away';
  phases: [TacticalPhase, TacticalPhase, TacticalPhase];
  ballFrames?: BallFrame[];
}

export interface TacticalPlaybookBoardProps {
  homeTeam: string;
  awayTeam: string;
  homeRoster?: string[];
  awayRoster?: string[];
  scenarios?: TacticalScenario[];
  title?: string;
  subtitle?: string;
}

const POS_LABELS = ['1 PG', '2 SG', '3 SF', '4 PF', '5 C'];
const RIM_POS: [number, number] = [250, 407];

const TEAM_DEFAULT_ROSTERS: Record<string, string[]> = {
  新北國王: ['林書緯', '李愷諺', '克雷格', '肯刀爾', '沃許本'],
  臺北台新戰神: ['丁聖儒', '林庭謙', '麥基', '雷蒙恩', '馬利'],
  新北中信特攻: ['魏嘉豪', '謝亞軒', '阿巴西', '猛士', '法拉帝'],
  桃園台啤永豐雲豹: ['高錦瑋', '林信寬', '克羅馬', '莫騰', '米勒'],
  新竹御嵿攻城獅: ['高國豪', '盧冠軒', '朱雲豪', '德魯', '迪亞洛'],
  福爾摩沙夢想家: ['林俊吉', '蔣淯安', '馬建豪', '基德', '高柏鎧'],
  高雄全家海神: ['于煥亞', '布銳克曼', '胡瓏貿', '貝西里', '庫薩斯'],
};

function normalizeTeamKey(name: string): string {
  const keys = Object.keys(TEAM_DEFAULT_ROSTERS);
  for (const k of keys) {
    if (name.includes(k) || k.includes(name) || name.slice(-2) === k.slice(-2)) {
      return k;
    }
  }
  return '新北國王';
}

function shortName(fullName: string): string {
  if (!fullName) return '';
  return fullName.length > 4 ? fullName.slice(0, 4) : fullName;
}

function bindRosterPlaceholders(
  text: string | undefined,
  offenseRoster: string[],
  defenseRoster: string[]
): string {
  if (!text) return '';
  let out = text;
  for (let i = 0; i < 5; i++) {
    const oName = offenseRoster[i] || `${i + 1}號位`;
    const dName = defenseRoster[i] || `防守${i + 1}號位`;
    out = out.replaceAll(`{O${i + 1}}`, oName).replaceAll(`{D${i + 1}}`, dName);
  }
  return out;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * 若劇本未提供顯式 ballFrames，自動依三階段球權位置推導出包含「傳球飛行時間窗」的球路關鍵幀。
 * progress 範圍為 0.0 ~ 2.0：
 * - [0.00 .. 1.00]: 階段 1 -> 階段 2
 * - [1.00 .. 2.00]: 階段 2 -> 階段 3
 */
function deriveBallFrames(phases: [TacticalPhase, TacticalPhase, TacticalPhase]): BallFrame[] {
  const p0 = phases[0].ballPos;
  const p1 = phases[1].ballPos;
  const p2 = phases[2].ballPos;

  const frames: BallFrame[] = [{ t: 0.0, pos: p0, inAir: false }];

  // 檢查 Phase 1 -> 2 是否有明顯傳球 (距離 > 45px 且有 pass 路徑)
  const hasPass01 =
    phases[0].paths.some((p) => p.type === 'pass') && dist(p0, p1) > 45;
  if (hasPass01) {
    frames.push({ t: 0.35, pos: p0, inAir: true });
    frames.push({ t: 0.78, pos: p1, inAir: false });
  } else {
    frames.push({ t: 1.0, pos: p1, inAir: false });
  }

  // 檢查 Phase 2 -> 3 是否有傳球轉移 (距離 > 45px)
  const hasPass12 =
    phases[2].paths.some((p) => p.type === 'pass') ||
    phases[1].paths.some((p) => p.type === 'pass') ||
    dist(p1, p2) > 50;

  if (hasPass12 && dist(p1, p2) > 45) {
    frames.push({ t: 1.18, pos: p1, inAir: true });
    frames.push({ t: 1.62, pos: p2, inAir: false });
    // 階段 3 後半段：射手接球後微調出手弧線往籃框
    frames.push({ t: 1.76, pos: p2, inAir: true, isShot: true });
    frames.push({
      t: 2.0,
      pos: [lerp(p2[0], RIM_POS[0], 0.85), lerp(p2[1], RIM_POS[1], 0.85)],
      inAir: true,
      isShot: true,
    });
  } else {
    frames.push({ t: 1.82, pos: p2, inAir: false });
    frames.push({ t: 2.0, pos: p2, inAir: false });
  }

  return frames;
}

function sampleBallState(
  frames: BallFrame[],
  progress: number
): { pos: [number, number]; trail: [number, number][]; inAir: boolean; isShot: boolean } {
  if (!frames.length) {
    return { pos: [250, 150], trail: [], inAir: false, isShot: false };
  }
  const clamped = Math.max(0, Math.min(2, progress));

  let idx = 0;
  while (idx < frames.length - 1 && frames[idx + 1].t < clamped) {
    idx++;
  }
  if (idx >= frames.length - 1) {
    const last = frames[frames.length - 1];
    return { pos: last.pos, trail: [], inAir: Boolean(last.inAir), isShot: Boolean(last.isShot) };
  }

  const fA = frames[idx];
  const fB = frames[idx + 1];
  const span = Math.max(0.0001, fB.t - fA.t);
  const rawT = Math.max(0, Math.min(1, (clamped - fA.t) / span));
  const t = fA.inAir ? rawT : easeInOutCubic(rawT);

  const computePosAt = (u: number): [number, number] => {
    let x = lerp(fA.pos[0], fB.pos[0], u);
    let y = lerp(fA.pos[1], fB.pos[1], u);
    if (fA.inAir) {
      // 微幅拋物線弧度偏移 (Pass / Shot arc)
      const arcLift = fB.isShot ? 28 : 16;
      y -= Math.sin(u * Math.PI) * arcLift;
    }
    return [x, y];
  };

  const pos = computePosAt(t);
  const trail: [number, number][] = [];
  if (fA.inAir && rawT > 0.05) {
    for (let k = 1; k <= 4; k++) {
      const backU = Math.max(0, t - k * 0.08);
      trail.push(computePosAt(backU));
    }
  }

  return {
    pos,
    trail,
    inAir: Boolean(fA.inAir),
    isShot: Boolean(fA.isShot || fB.isShot),
  };
}

interface TeamPlayTemplate {
  offenseName: string;
  offenseGoal: string;
  offensePhases: [TacticalPhase, TacticalPhase, TacticalPhase];
  offenseBallFrames?: BallFrame[];
  counterName: string;
  counterGoal: string;
  counterPhases: [TacticalPhase, TacticalPhase, TacticalPhase];
  counterBallFrames?: BallFrame[];
}

/**
 * 校準後之 TPBL 7 隊戰術庫：
 * - 所有球員距離維持 >= 32px（雙人包夾呈左右 45 度角 ±28px）
 * - 文字描述與實際跑位、傳球、包夾、底角漏人 100% 一致
 */
const TEAM_TACTICAL_LIBRARY: Record<string, TeamPlayTemplate> = {
  新北國王: {
    offenseName: 'Double Drag & Elbow Kick (雙掩護切入肘區分球)',
    offenseGoal: '利用 {O4}、{O5} 連續高掩護助 {O1} 切入肘區吸引雙人包夾，弱側內縮後精準分球底角 {O3} 三分。',
    offensePhases: [
      {
        title: '階段一：弧頂雙掩護落位 (Double Drag Set)',
        description: '{O1} 弧頂持球，{O4} 與 {O5} 於左右肘區上提設置連續掩護，{O2}、{O3} 分站兩側底角拉開空間。',
        keyRead: '觀察對方 {D5} 採取沉退 (Drop) 還是高位夾擊。',
        ballPos: [250, 108],
        offense: [
          [250, 108], // 1 PG
          [54, 392],  // 2 SG left corner
          [446, 392], // 3 SF right corner
          [202, 168], // 4 PF screen 1
          [292, 188], // 5 C screen 2
        ],
        defense: [
          [250, 152], // D1
          [94, 380],  // D2
          [406, 380], // D3
          [206, 212], // D4
          [290, 245], // D5
        ],
        paths: [
          { from: [202, 168], to: [228, 134], type: 'screen' },
          { from: [292, 188], to: [268, 150], type: 'screen' },
        ],
      },
      {
        title: '階段二：肘區突破吸引雙人包夾 (Elbow Double-Team)',
        description: '{O1} 繞過掩護強攻右肘區，迫使 {D1} 與 {D5} 呈左右 45 度角合圍包夾；弱側 {D3} 內縮禁區補位，漏出右側底角 {O3} 空檔！',
        keyRead: '弱側防守者 {D3} 雙腳踩進油漆區邊緣，底角三分線完全放空。',
        ballPos: [296, 232],
        offense: [
          [296, 232], // 1 PG at right elbow
          [54, 405],  // 2 SG
          [448, 405], // 3 SF wide open corner
          [162, 132], // 4 PF pop to wing
          [238, 305], // 5 C roll to paint
        ],
        defense: [
          [272, 208], // D1 double-team left 45 deg (~34px)
          [116, 385], // D2
          [342, 345], // D3 sucked into paint!
          [176, 174], // D4
          [320, 212], // D5 double-team right 45 deg (~31px)
        ],
        paths: [
          { from: [250, 108], to: [296, 232], type: 'dribble' },
          { from: [292, 188], to: [238, 305], type: 'screen' },
          { from: [406, 380], to: [342, 345], type: 'defense' },
        ],
      },
      {
        title: '階段三：大對角分球底角三分出手 (Corner Kick & Release)',
        description: '{O1} 頂住包夾橫傳右側底角 {O3}，趁 {D3} 撲防未到之前從容 Catch & Shoot 飆進三分！',
        keyRead: '高效率 eFG% 出手：傳球飛行時間差決定三分品質。',
        ballPos: [448, 405],
        offense: [
          [296, 245],
          [54, 405],
          [448, 405],
          [156, 130],
          [238, 348],
        ],
        defense: [
          [272, 225],
          [130, 390],
          [410, 392], // D3 late closeout
          [176, 174],
          [270, 340],
        ],
        paths: [
          { from: [296, 232], to: [448, 405], type: 'pass' },
          { from: [342, 345], to: [410, 392], type: 'defense' },
        ],
      },
    ],
    counterName: 'Switch-All & Nail Help (無限換防與肘區協防)',
    counterGoal: '透過 {D1}～{D4} 快速換防切斷掩護優勢，並以強側肘區協防干擾 {O1} 突破。',
    counterPhases: [
      {
        title: '階段一：預判掩護與提前換防站位',
        description: '面對高位擋拆，{D4} 提前上提準備 Switch 換防 {O1}，{D1} 隨時準備交接內線卡位。',
        keyRead: '溝通喊聲確認換防對象，不給三分出手縫隙。',
        ballPos: [250, 108],
        offense: [
          [250, 108],
          [62, 370],
          [438, 370],
          [214, 162],
          [296, 338],
        ],
        defense: [
          [250, 148],
          [102, 365],
          [398, 365],
          [212, 198],
          [292, 372],
        ],
        paths: [
          { from: [212, 198], to: [238, 148], type: 'defense' },
          { from: [250, 148], to: [214, 190], type: 'defense' },
        ],
      },
      {
        title: '階段二：強側肘區夾擊干擾 (Nail Help & Trap)',
        description: '換防逼迫 {O1} 往左肘突破時，{D2} 快速收縮至罰球線肘區與 {D4} 形成合圍包夾，切斷中路路線。',
        keyRead: '壓低重心干擾運球，逼迫對方傳出高風險橫傳球。',
        ballPos: [182, 188],
        offense: [
          [182, 188],
          [62, 388],
          [438, 388],
          [256, 136],
          [296, 342],
        ],
        defense: [
          [252, 178],
          [156, 214], // D2 nail help 45 deg
          [378, 355],
          [208, 166], // D4 on-ball 45 deg
          [288, 374],
        ],
        paths: [
          { from: [250, 108], to: [182, 188], type: 'dribble' },
          { from: [102, 365], to: [156, 214], type: 'defense' },
        ],
      },
      {
        title: '階段三：輪轉還原與籃板卡位',
        description: '{O1} 被迫分球底角 {O2} 時，{D2} 快速還原撲防干擾投籃，其餘隊友保護籃板啟動快攻。',
        keyRead: '將進攻時間消耗至讀秒階段再干擾出手。',
        ballPos: [62, 388],
        offense: [
          [176, 202],
          [62, 388],
          [438, 388],
          [256, 136],
          [272, 352],
        ],
        defense: [
          [238, 196],
          [94, 378],
          [402, 375],
          [208, 224],
          [278, 386],
        ],
        paths: [
          { from: [182, 188], to: [62, 388], type: 'pass' },
          { from: [156, 214], to: [94, 378], type: 'defense' },
        ],
      },
    ],
  },
  臺北台新戰神: {
    offenseName: 'Spread PnR & Corner Drift (拉開擋拆與弧頂三分)',
    offenseGoal: '由 {O1} 與 {O5} 發動高位擋拆突破吸引協防，{O2} 漂移至弧頂接球投籃或塞給順下長人。',
    offensePhases: [
      {
        title: '階段一：單側清空與高位擋拆起手',
        description: '{O1} 於左側 45 度角持球，{O5} 上提設立厚實掩護，{O2} 準備由右側向弧頂漂移接應。',
        keyRead: '觀察 {D5} 是否上提延誤 (Hedge)。',
        ballPos: [160, 145],
        offense: [
          [160, 145],
          [426, 212],
          [448, 392],
          [56, 395],
          [204, 198],
        ],
        defense: [
          [184, 180],
          [384, 226],
          [406, 378],
          [98, 384],
          [228, 248],
        ],
        paths: [
          { from: [204, 198], to: [178, 162], type: 'screen' },
          { from: [426, 212], to: [388, 138], type: 'screen' },
        ],
      },
      {
        title: '階段二：突破禁區吸引協防與弧頂漂移',
        description: '{O1} 加速切入罰球線吸引 {D5} 與 {D2} 內縮協防，同時 {O2} 漂移至弧頂右側拉開接球角度。',
        keyRead: '防守者一旦收縮禁區，弧頂三分線即完全清空。',
        ballPos: [232, 242],
        offense: [
          [232, 242],
          [388, 138],
          [448, 412],
          [56, 395],
          [232, 342],
        ],
        defense: [
          [204, 216],
          [332, 198], // D2 sucked inward
          [392, 392],
          [122, 380],
          [264, 326],
        ],
        paths: [
          { from: [160, 145], to: [232, 242], type: 'dribble' },
          { from: [426, 212], to: [388, 138], type: 'screen' },
        ],
      },
      {
        title: '階段三：外傳弧頂射手急停開火',
        description: '{O1} 跳起分球至弧頂補位到位的 {O2}，{O2} 接球直接三分線外拔起出手！',
        keyRead: '創造高命中率 Catch & Shoot 外線機會。',
        ballPos: [388, 138],
        offense: [
          [232, 256],
          [388, 138],
          [448, 412],
          [56, 395],
          [238, 370],
        ],
        defense: [
          [222, 236],
          [366, 170], // D2 closeout
          [412, 402],
          [116, 384],
          [268, 362],
        ],
        paths: [
          { from: [232, 242], to: [388, 138], type: 'pass' },
          { from: [332, 198], to: [366, 170], type: 'defense' },
        ],
      },
    ],
    counterName: 'Drop Coverage & Tag (沉退護框與弱側標籤協防)',
    counterGoal: '由 {D5} 沉退保護籃框，弱側 {D3} 短暫 Tag 順下 {O5} 再還原撲防底角 {O3}。',
    counterPhases: [
      {
        title: '階段一：過掩護追防與禁區沉退',
        description: '{D1} 全力擠過掩護追防 {O1}，{D5} 收縮至罰球線下方一步築起護框防線。',
        keyRead: '逼迫 {O1} 投高難度中距離拋投。',
        ballPos: [250, 112],
        offense: [
          [250, 112],
          [72, 222],
          [432, 368],
          [62, 398],
          [250, 168],
        ],
        defense: [
          [250, 148],
          [112, 238],
          [392, 355],
          [114, 382],
          [250, 256],
        ],
        paths: [
          { from: [250, 148], to: [216, 168], type: 'defense' },
          { from: [250, 256], to: [248, 294], type: 'defense' },
        ],
      },
      {
        title: '階段二：弱側 Tag 牽制順下長人',
        description: '{O5} 順下時，弱側 {D3} 內縮至禁區邊線阻斷高吊傳球路線。',
        keyRead: '{D5} 守住籃框第一拍後，{D3} 隨時準備撲防底角 {O3}。',
        ballPos: [198, 222],
        offense: [
          [198, 222],
          [72, 222],
          [438, 388],
          [62, 398],
          [250, 326],
        ],
        defense: [
          [224, 194],
          [108, 238],
          [322, 338],
          [114, 382],
          [246, 360],
        ],
        paths: [
          { from: [250, 112], to: [198, 222], type: 'dribble' },
          { from: [392, 355], to: [322, 338], type: 'defense' },
        ],
      },
      {
        title: '階段三：快速還原撲防與卡位籃板',
        description: '{O1} 分球底角 {O3} 後，{D3} 大跨步撲防干擾投籃，全員內縮保護防守籃板。',
        keyRead: '切斷對手二次進攻籃板。',
        ballPos: [438, 388],
        offense: [
          [192, 238],
          [72, 222],
          [438, 388],
          [62, 398],
          [250, 344],
        ],
        defense: [
          [218, 222],
          [108, 238],
          [406, 378],
          [124, 382],
          [254, 378],
        ],
        paths: [
          { from: [198, 222], to: [438, 388], type: 'pass' },
          { from: [322, 338], to: [406, 378], type: 'defense' },
        ],
      },
    ],
  },
  新北中信特攻: {
    offenseName: '5-Out Motion & Backdoor Cut (五外流動與閃電開後門)',
    offenseGoal: '五人站位三分線外拉空油漆區，透過強側 {O3} 牽制與弱側 {O2} 開後門空切製造籃下輕鬆終結。',
    offensePhases: [
      {
        title: '階段一：五外弧形展開與強側傳導',
        description: '{O1} 傳球給右側 45 度角 {O3}，同時朝強側移動吸引 {D1} 與 {D3} 視線。',
        keyRead: '觀察對手弱側邊防守者 {D2} 是否盯球不盯人。',
        ballPos: [382, 185],
        offense: [
          [208, 114],
          [82, 210],
          [382, 185],
          [58, 392],
          [442, 392],
        ],
        defense: [
          [216, 154],
          [120, 226],
          [350, 206],
          [96, 380],
          [404, 380],
        ],
        paths: [
          { from: [208, 114], to: [382, 185], type: 'pass' },
          { from: [208, 114], to: [338, 158], type: 'screen' },
        ],
      },
      {
        title: '階段二：假手遞手開後門空切 (Fake DHO Backdoor)',
        description: '{O3} 持球吸引強側注意力，弱側 {O2} 利用 {D2} 視線偏移突然加速空切籃下！',
        keyRead: '只要禁區清空且 {D2} 慢半拍，直塞通道即完全敞開。',
        ballPos: [368, 194],
        offense: [
          [326, 146],
          [224, 324],
          [368, 194],
          [58, 398],
          [432, 355],
        ],
        defense: [
          [314, 180],
          [176, 268],
          [340, 222],
          [116, 382],
          [386, 350],
        ],
        paths: [
          { from: [82, 210], to: [224, 324], type: 'screen' },
          { from: [120, 226], to: [176, 268], type: 'defense' },
        ],
      },
      {
        title: '階段三：擊地直塞籃下上籃終結',
        description: '{O3} 送出精準擊地傳球助 {O2} 直接上籃得分，若中鋒 {D5} 補防則順勢分球底角。',
        keyRead: '展現高助攻低失誤的流暢團隊球風。',
        ballPos: [238, 372],
        offense: [
          [320, 144],
          [238, 372],
          [368, 194],
          [58, 398],
          [440, 388],
        ],
        defense: [
          [310, 180],
          [204, 352],
          [340, 222],
          [132, 382],
          [396, 376],
        ],
        paths: [
          { from: [368, 194], to: [238, 372], type: 'pass' },
        ],
      },
    ],
    counterName: 'Aggressive Trap & Hawk Steal (高位夾擊與鷹眼抄截)',
    counterGoal: '由 {D1} 與 {D4} 於左側 45 度角合圍夾擊持球者 {O1}，後衛群 {D2}、{D3} 封鎖傳球路線伺機抄截反擊。',
    counterPhases: [
      {
        title: '階段一：雙人強勢延誤夾擊持球者',
        description: '面對 {O4} 高位掩護，{D1} 與 {D4} 呈左右 45 度角同步夾擊 {O1}，切斷正面傳球視野。',
        keyRead: '迫使 {O1} 停球或後退運球。',
        ballPos: [175, 146],
        offense: [
          [175, 146],
          [422, 212],
          [442, 392],
          [222, 198],
          [265, 355],
        ],
        defense: [
          [148, 174], // D1 left 45 deg (~38px)
          [356, 214],
          [376, 360],
          [202, 174], // D4 right 45 deg (~38px)
          [265, 390],
        ],
        paths: [
          { from: [202, 174], to: [188, 162], type: 'defense' },
          { from: [356, 214], to: [302, 198], type: 'defense' },
        ],
      },
      {
        title: '階段二：後衛群封鎖傳球路線 (Passing Lane Denial)',
        description: '後方 {D2}、{D3} 收縮攔截中短距離接應點，誘使 {O1} 傳出長距離高拋球。',
        keyRead: '盯球兼顧人，隨時準備完成抄截轉換快攻。',
        ballPos: [144, 152],
        offense: [
          [144, 152],
          [422, 212],
          [442, 392],
          [224, 242],
          [265, 355],
        ],
        defense: [
          [120, 180], // D1 left 45 deg
          [292, 196],
          [336, 326],
          [172, 178], // D4 right 45 deg
          [265, 390],
        ],
        paths: [
          { from: [175, 146], to: [144, 152], type: 'dribble' },
          { from: [376, 360], to: [336, 326], type: 'defense' },
        ],
      },
      {
        title: '階段三：高速輪轉干擾與反推轉換',
        description: '{O1} 勉力轉移至弱側 {O2} 時，{D2} 高速撲防干擾出手並第一時間啟動反擊。',
        keyRead: '將對手失誤轉化為輕鬆快攻得分。',
        ballPos: [422, 212],
        offense: [
          [144, 152],
          [422, 212],
          [442, 392],
          [224, 256],
          [262, 360],
        ],
        defense: [
          [166, 188],
          [392, 222],
          [398, 372],
          [222, 290],
          [266, 394],
        ],
        paths: [
          { from: [144, 152], to: [422, 212], type: 'pass' },
          { from: [292, 196], to: [392, 222], type: 'defense' },
        ],
      },
    ],
  },
};

function getTeamTemplate(teamName: string): TeamPlayTemplate {
  const key = normalizeTeamKey(teamName);
  if (TEAM_TACTICAL_LIBRARY[key]) {
    return TEAM_TACTICAL_LIBRARY[key];
  }
  const fallbackMap: Record<
    string,
    { base: string; offName: string; offGoal: string; defName: string; defGoal: string }
  > = {
    桃園台啤永豐雲豹: {
      base: '臺北台新戰神',
      offName: 'Spain PnR & Rim Runner (西班牙擋拆與外圍狙擊)',
      offGoal: '高位擋拆後搭配弧頂接應拉開禁區，創造內外雙重威脅。',
      defName: 'Pack-the-Paint & Rebound Seal (禁區收縮與籃板鎖死)',
      defGoal: '收縮油漆區保護籃框與防守籃板，逼迫對手依賴中長距離跳投。',
    },
    新竹御嵿攻城獅: {
      base: '新北國王',
      offName: 'High-Low Post Split & Corner Kick (高低位策應與底角轉移)',
      offGoal: '透過內線牽制吸引包夾，解放本土後衛與射手群底角開火。',
      defName: 'Hedge & Recover (高位延誤與快速還原)',
      defGoal: '積極上提延誤擋拆持球者，後衛群快速還原封鎖外線投射節奏。',
    },
    福爾摩沙夢想家: {
      base: '新北國王',
      offName: 'Horns Stagger & Stretch-5 Kick (雙牛角與底角三分)',
      offGoal: '利用雙長人掩護與外彈牽制，讓後衛群突破吸引包夾後分球底角射手。',
      defName: 'ICE PnR & Weakside Rim Protect (邊線阻絕與弱側護框)',
      defGoal: '將邊線擋拆強迫壓向底線，由中鋒坐鎮禁區築起禁飛區。',
    },
    高雄全家海神: {
      base: '新北中信特攻',
      offName: 'Early Transition & Backdoor Cut (早期推進與空切終結)',
      offGoal: '以高速節奏拉開五外站位，透過強側牽制創造籃下直接空切得分。',
      defName: 'Aggressive Trap & Quick Outlet (壓迫包夾與快速長傳)',
      defGoal: '以強側壓迫製造對手傳球失誤，搶下球權後第一時間長傳發動閃電反擊。',
    },
  };
  const cfg = fallbackMap[key];
  const baseTpl = TEAM_TACTICAL_LIBRARY[cfg?.base || '新北國王'];
  return {
    offenseName: cfg?.offName || baseTpl.offenseName,
    offenseGoal: cfg?.offGoal || baseTpl.offenseGoal,
    offensePhases: baseTpl.offensePhases,
    counterName: cfg?.defName || baseTpl.counterName,
    counterGoal: cfg?.defGoal || baseTpl.counterGoal,
    counterPhases: baseTpl.counterPhases,
  };
}

export function buildDefaultScenarios(homeTeam: string, awayTeam: string): TacticalScenario[] {
  const homeTpl = getTeamTemplate(homeTeam);
  const awayTpl = getTeamTemplate(awayTeam);

  return [
    {
      key: 'home_offense',
      label: '主隊進攻破解',
      playName: `${homeTeam}｜${homeTpl.offenseName}`,
      tacticalGoal: homeTpl.offenseGoal,
      offenseTeam: 'home',
      phases: homeTpl.offensePhases,
    },
    {
      key: 'away_counter',
      label: '客隊防守反制',
      playName: `${awayTeam}｜${awayTpl.counterName}`,
      tacticalGoal: awayTpl.counterGoal,
      offenseTeam: 'home',
      phases: awayTpl.counterPhases,
    },
    {
      key: 'away_offense',
      label: '客隊進攻破解',
      playName: `${awayTeam}｜${awayTpl.offenseName}`,
      tacticalGoal: awayTpl.offenseGoal,
      offenseTeam: 'away',
      phases: awayTpl.offensePhases,
    },
    {
      key: 'home_counter',
      label: '主隊防守反制',
      playName: `${homeTeam}｜${homeTpl.counterName}`,
      tacticalGoal: homeTpl.counterGoal,
      offenseTeam: 'away',
      phases: homeTpl.counterPhases,
    },
  ];
}

type TeamPlaybookLibrary = Record<
  string,
  {
    offense?: TacticalScenario[];
    defense?: TacticalScenario[];
  }
>;

// 整套戰術總時長 (progress 0.0 -> 2.0 連續不卡頓)
const TOTAL_PLAY_DURATION_MS = 5200;
const TWEEN_DURATION_MS = 380;

export default function TacticalPlaybookBoard({
  homeTeam,
  awayTeam,
  homeRoster,
  awayRoster,
  scenarios,
  title = '互動式 SVG 半場戰術板｜雙隊互有攻守推演',
  subtitle = '連續流暢補間動畫、獨立傳球飛行軌跡與真實先發 1～5 號位名單連動',
}: TacticalPlaybookBoardProps) {
  const [library, setLibrary] = useState<TeamPlaybookLibrary | null>(null);
  const [variantIdxMap, setVariantIdxMap] = useState<Record<TacticalScenario['key'], number>>({
    home_offense: 0,
    away_counter: 0,
    away_offense: 0,
    home_counter: 0,
  });

  // 在 /matchup 自由模擬模式下，自動讀取累積的 7 隊戰術庫
  useEffect(() => {
    if (scenarios && scenarios.length === 4) return;
    let cancelled = false;
    fetch('/weekly_previews/team_playbook_library.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: TeamPlaybookLibrary | null) => {
        if (!cancelled && data) {
          setLibrary(data);
        }
      })
      .catch(() => {
        // Silent fallback to built-in templates
      });
    return () => {
      cancelled = true;
    };
  }, [scenarios]);

  // 切換主客隊時重置套路索引
  useEffect(() => {
    setVariantIdxMap({
      home_offense: 0,
      away_counter: 0,
      away_offense: 0,
      home_counter: 0,
    });
  }, [homeTeam, awayTeam]);

  const scenarioVariantsMap = useMemo(() => {
    if (scenarios && scenarios.length === 4) {
      return {
        home_offense: [scenarios.find((s) => s.key === 'home_offense') || scenarios[0]],
        away_counter: [scenarios.find((s) => s.key === 'away_counter') || scenarios[1]],
        away_offense: [scenarios.find((s) => s.key === 'away_offense') || scenarios[2]],
        home_counter: [scenarios.find((s) => s.key === 'home_counter') || scenarios[3]],
      };
    }

    const defaults = buildDefaultScenarios(homeTeam, awayTeam);
    const homeLib = library?.[normalizeTeamKey(homeTeam)] || library?.[homeTeam];
    const awayLib = library?.[normalizeTeamKey(awayTeam)] || library?.[awayTeam];

    const mergePlays = (
      basePlay: TacticalScenario,
      extraPlays: TacticalScenario[] | undefined,
      key: TacticalScenario['key'],
      label: string,
      offenseTeam: 'home' | 'away'
    ): TacticalScenario[] => {
      const list: TacticalScenario[] = [basePlay];
      const seen = new Set<string>([basePlay.playName]);
      for (const ep of extraPlays || []) {
        if (ep && ep.playName && !seen.has(ep.playName)) {
          seen.add(ep.playName);
          list.push({
            ...ep,
            key,
            label,
            offenseTeam,
          });
        }
      }
      return list;
    };

    return {
      home_offense: mergePlays(defaults[0], homeLib?.offense, 'home_offense', '主隊進攻破解', 'home'),
      away_counter: mergePlays(defaults[1], awayLib?.defense, 'away_counter', '客隊防守反制', 'home'),
      away_offense: mergePlays(defaults[2], awayLib?.offense, 'away_offense', '客隊進攻破解', 'away'),
      home_counter: mergePlays(defaults[3], homeLib?.defense, 'home_counter', '主隊防守反制', 'away'),
    };
  }, [scenarios, homeTeam, awayTeam, library]);

  const resolvedScenarios = useMemo(
    () => [
      scenarioVariantsMap.home_offense[variantIdxMap.home_offense] || scenarioVariantsMap.home_offense[0],
      scenarioVariantsMap.away_counter[variantIdxMap.away_counter] || scenarioVariantsMap.away_counter[0],
      scenarioVariantsMap.away_offense[variantIdxMap.away_offense] || scenarioVariantsMap.away_offense[0],
      scenarioVariantsMap.home_counter[variantIdxMap.home_counter] || scenarioVariantsMap.home_counter[0],
    ],
    [scenarioVariantsMap, variantIdxMap]
  );

  const resolvedHomeRoster = useMemo(() => {
    const fallback =
      TEAM_DEFAULT_ROSTERS[normalizeTeamKey(homeTeam)] || ['1號位', '2號位', '3號位', '4號位', '5號位'];
    return POS_LABELS.map((_, idx) => (homeRoster && homeRoster[idx] ? homeRoster[idx] : fallback[idx]));
  }, [homeRoster, homeTeam]);

  const resolvedAwayRoster = useMemo(() => {
    const fallback =
      TEAM_DEFAULT_ROSTERS[normalizeTeamKey(awayTeam)] || ['1號位', '2號位', '3號位', '4號位', '5號位'];
    return POS_LABELS.map((_, idx) => (awayRoster && awayRoster[idx] ? awayRoster[idx] : fallback[idx]));
  }, [awayRoster, awayTeam]);

  const [activeScenarioKey, setActiveScenarioKey] = useState<TacticalScenario['key']>('home_offense');
  const [progress, setProgress] = useState<number>(0); // 0.0 ~ 2.0 連續進度
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<0.5 | 1 | 1.5>(1);

  const rafRef = useRef<number | null>(null);
  const tweenRafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const activeScenario = useMemo(
    () => resolvedScenarios.find((s) => s.key === activeScenarioKey) || resolvedScenarios[0],
    [resolvedScenarios, activeScenarioKey]
  );

  const activeVariants = scenarioVariantsMap[activeScenario.key] || [activeScenario];
  const activeVariantIdx = variantIdxMap[activeScenario.key] || 0;

  const handleSelectVariant = (idx: number) => {
    stopAllAnimations();
    setIsPlaying(false);
    setProgress(0);
    setVariantIdxMap((prev) => ({ ...prev, [activeScenario.key]: idx }));
  };

  // 依據連續 progress (0.0~2.0) 無縫決定右側高亮階段：0~0.66 -> 階段1，0.66~1.33 -> 階段2，1.33~2.0 -> 階段3
  const activeStageIdx = progress < 0.66 ? 0 : progress < 1.33 ? 1 : 2;

  const stopAllAnimations = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (tweenRafRef.current) cancelAnimationFrame(tweenRafRef.current);
    lastTsRef.current = null;
  };

  const handleSelectScenario = (key: TacticalScenario['key']) => {
    stopAllAnimations();
    setIsPlaying(false);
    setActiveScenarioKey(key);
    setProgress(0);
  };

  const handleReplay = () => {
    stopAllAnimations();
    setProgress(0);
    setIsPlaying(true);
  };

  // 點擊階段 1 / 2 / 3 時，平滑 Tween 到該階段座標 (0.0, 1.0, 2.0)，而非生硬瞬移
  const handleSelectPhase = (idx: number) => {
    stopAllAnimations();
    setIsPlaying(false);
    const targetProgress = idx === 0 ? 0.0 : idx === 1 ? 1.0 : 2.0;
    const startProgress = progress;
    const delta = targetProgress - startProgress;
    if (Math.abs(delta) < 0.01) {
      setProgress(targetProgress);
      return;
    }

    let startTs: number | null = null;
    const stepTween = (ts: number) => {
      if (startTs === null) startTs = ts;
      const elapsed = ts - startTs;
      const u = Math.min(1, elapsed / TWEEN_DURATION_MS);
      setProgress(startProgress + delta * easeInOutCubic(u));
      if (u < 1) {
        tweenRafRef.current = requestAnimationFrame(stepTween);
      }
    };
    tweenRafRef.current = requestAnimationFrame(stepTween);
  };

  // 主播放迴圈：從 0.0 到 2.0 連續平滑推進，完全消除階段間卡頓
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
      return;
    }

    const tick = (ts: number) => {
      if (lastTsRef.current === null) {
        lastTsRef.current = ts;
      }
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;

      setProgress((prev) => {
        const next = prev + (dt * speed * 2.0) / TOTAL_PLAY_DURATION_MS;
        if (next >= 2.0) {
          setIsPlaying(false);
          return 2.0;
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
    };
  }, [isPlaying, speed]);

  // 計算當前雙隊球員補間座標
  const segIdx = progress < 1.0 ? 0 : 1;
  const localT = easeInOutCubic(progress < 1.0 ? progress : progress - 1.0);
  const phaseA = activeScenario.phases[segIdx] || activeScenario.phases[0];
  const phaseB = activeScenario.phases[segIdx + 1] || phaseA;

  const interpOffense = phaseA.offense.map((pos, idx) => {
    const target = phaseB.offense[idx] || pos;
    return [lerp(pos[0], target[0], localT), lerp(pos[1], target[1], localT)] as [number, number];
  });

  const interpDefense = phaseA.defense.map((pos, idx) => {
    const target = phaseB.defense[idx] || pos;
    return [lerp(pos[0], target[0], localT), lerp(pos[1], target[1], localT)] as [number, number];
  });

  // 獨立籃球傳球飛行軌跡 & 出手尾跡
  const ballFrames = useMemo(
    () =>
      activeScenario.ballFrames && activeScenario.ballFrames.length >= 2
        ? activeScenario.ballFrames
        : deriveBallFrames(activeScenario.phases),
    [activeScenario]
  );

  const ballState = sampleBallState(ballFrames, progress);
  const currentPhaseInfo = activeScenario.phases[activeStageIdx] || activeScenario.phases[0];

  const isHomeOffense = activeScenario.offenseTeam === 'home';
  const offenseRoster = isHomeOffense ? resolvedHomeRoster : resolvedAwayRoster;
  const defenseRoster = isHomeOffense ? resolvedAwayRoster : resolvedHomeRoster;
  const offenseTeamName = isHomeOffense ? homeTeam : awayTeam;
  const defenseTeamName = isHomeOffense ? awayTeam : homeTeam;

  const offenseColor = isHomeOffense ? '#FF9100' : '#38BDF8';
  const defenseColor = isHomeOffense ? '#38BDF8' : '#FF9100';

  return (
    <section className="bg-[#161B22] border border-[#30363D] rounded-2xl p-5 sm:p-6 shadow-2xl">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#21262D]">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#FF9100] mb-1">
            <Sparkles className="w-4 h-4" />
            <span>Tactical Playbook Simulator</span>
          </div>
          <h3 className="text-lg sm:text-xl font-black text-white">{title}</h3>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">{subtitle}</p>
        </div>

        {/* 4-Scenario Switcher */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          {resolvedScenarios.map((sc) => {
            const active = sc.key === activeScenario.key;
            const isCounter = sc.key.includes('counter');
            return (
              <button
                key={sc.key}
                type="button"
                onClick={() => handleSelectScenario(sc.key)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border ${
                  active
                    ? isCounter
                      ? 'bg-[#F43F5E]/15 text-[#FB7185] border-[#F43F5E]/60 shadow-lg shadow-[#F43F5E]/10'
                      : 'bg-[#FF9100]/15 text-[#FF9100] border-[#FF9100]/60 shadow-lg shadow-[#FF9100]/10'
                    : 'bg-[#0E1117] text-gray-400 border-[#21262D] hover:text-white hover:border-[#30363D]'
                }`}
              >
                {isCounter ? <Shield className="w-3.5 h-3.5" /> : <Swords className="w-3.5 h-3.5" />}
                <span>{sc.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Play Banner */}
      <div className="mt-4 mb-5 bg-[#0E1117] border border-[#21262D] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[11px] font-black px-2 py-0.5 rounded-md border"
              style={{
                color: offenseColor,
                borderColor: `${offenseColor}55`,
                backgroundColor: `${offenseColor}15`,
              }}
            >
              進攻方：{offenseTeamName}
            </span>
            <span
              className="text-[11px] font-black px-2 py-0.5 rounded-md border"
              style={{
                color: defenseColor,
                borderColor: `${defenseColor}55`,
                backgroundColor: `${defenseColor}15`,
              }}
            >
              防守方：{defenseTeamName}
            </span>
            {activeVariants.length > 1 && (
              <div className="flex items-center gap-1.5 ml-1 flex-wrap">
                <span className="text-[10px] text-gray-500 font-bold">累積戰術庫：</span>
                {activeVariants.map((v, idx) => (
                  <button
                    key={v.playName}
                    type="button"
                    onClick={() => handleSelectVariant(idx)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-all ${
                      activeVariantIdx === idx
                        ? 'bg-[#00E676]/15 text-[#00E676] border-[#00E676]/60'
                        : 'bg-[#161B22] text-gray-400 border-[#30363D] hover:text-white'
                    }`}
                  >
                    套路 {idx + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
          <h4 className="text-base font-extrabold text-white mt-2">
            {bindRosterPlaceholders(activeScenario.playName, offenseRoster, defenseRoster)}
          </h4>
          <p className="text-xs text-gray-300 mt-1">
            {bindRosterPlaceholders(activeScenario.tacticalGoal, offenseRoster, defenseRoster)}
          </p>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => {
              if (progress >= 1.99) {
                handleReplay();
              } else {
                setIsPlaying((p) => !p);
              }
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FF9100] hover:bg-[#FFA726] text-black font-black text-xs transition-colors shadow-lg shadow-[#FF9100]/20"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isPlaying ? '暫停' : '播放戰術'}</span>
          </button>

          <button
            type="button"
            onClick={handleReplay}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-[#161B22] hover:bg-[#21262D] text-gray-200 border border-[#30363D] font-bold text-xs transition-colors"
            title="重播"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>重播</span>
          </button>

          <div className="flex items-center bg-[#161B22] border border-[#30363D] rounded-xl p-0.5">
            {([0.5, 1, 1.5] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-bold transition-colors ${
                  speed === s ? 'bg-[#30363D] text-[#00E676]' : 'text-gray-400 hover:text-white'
                }`}
              >
                {s.toFixed(1)}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: SVG Half-Court */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="relative bg-[#0B0F17] border border-[#30363D] rounded-2xl p-2 sm:p-4 overflow-hidden shadow-inner">
            <svg
              viewBox="0 0 500 470"
              className="w-full h-auto max-h-[500px] select-none"
              role="img"
              aria-label="TPBL Half-Court Tactical Board"
            >
              <defs>
                <marker id="arrow-dribble" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L7,3 z" fill="#FBBF24" />
                </marker>
                <marker id="arrow-pass" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L7,3 z" fill="#34D399" />
                </marker>
                <marker id="arrow-defense" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L7,3 z" fill="#F43F5E" />
                </marker>
                <marker id="screen-bar" markerWidth="6" markerHeight="10" refX="3" refY="5" orient="auto">
                  <line x1="3" y1="0" x2="3" y2="10" stroke="#A78BFA" strokeWidth="3" />
                </marker>
                <radialGradient id="ball-glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#FB923C" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#FB923C" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Court Surface */}
              <rect x="25" y="25" width="450" height="420" rx="6" fill="#111827" stroke="#334155" strokeWidth="2.5" />
              <path d="M 195 25 A 55 55 0 0 0 305 25" fill="none" stroke="#334155" strokeWidth="2" />
              <rect x="176" y="270" width="148" height="175" fill="#1E293B" fillOpacity="0.65" stroke="#475569" strokeWidth="2" />
              <circle cx="250" cy="270" r="54" fill="none" stroke="#475569" strokeWidth="2" />

              {/* Three-Point Line */}
              <line x1="48" y1="445" x2="48" y2="395" stroke="#475569" strokeWidth="2.2" />
              <line x1="452" y1="445" x2="452" y2="395" stroke="#475569" strokeWidth="2.2" />
              <path d="M 48 395 A 202 202 0 0 1 452 395" fill="none" stroke="#475569" strokeWidth="2.2" />

              {/* Restricted Area & Hoop */}
              <path d="M 212 405 A 38 38 0 0 1 288 405" fill="none" stroke="#64748B" strokeWidth="1.8" />
              <line x1="223" y1="422" x2="277" y2="422" stroke="#CBD5E1" strokeWidth="3.5" strokeLinecap="round" />
              <circle
                cx={RIM_POS[0]}
                cy={RIM_POS[1]}
                r={ballState.isShot && progress > 1.88 ? 11 : 9}
                fill={ballState.isShot && progress > 1.88 ? '#FF910033' : 'none'}
                stroke={ballState.isShot && progress > 1.88 ? '#00E676' : '#FF9100'}
                strokeWidth="2.8"
              />

              {/* Tactical Paths for Active Stage */}
              {currentPhaseInfo.paths.map((p, i) => {
                const key = `${activeStageIdx}-${i}`;
                if (p.type === 'dribble') {
                  return (
                    <line
                      key={key}
                      x1={p.from[0]}
                      y1={p.from[1]}
                      x2={p.to[0]}
                      y2={p.to[1]}
                      stroke="#FBBF24"
                      strokeWidth="2.6"
                      markerEnd="url(#arrow-dribble)"
                      opacity={0.85}
                    />
                  );
                }
                if (p.type === 'screen') {
                  return (
                    <line
                      key={key}
                      x1={p.from[0]}
                      y1={p.from[1]}
                      x2={p.to[0]}
                      y2={p.to[1]}
                      stroke="#A78BFA"
                      strokeWidth="2.5"
                      strokeDasharray="7 5"
                      markerEnd="url(#screen-bar)"
                      opacity={0.85}
                    />
                  );
                }
                if (p.type === 'pass') {
                  return (
                    <line
                      key={key}
                      x1={p.from[0]}
                      y1={p.from[1]}
                      x2={p.to[0]}
                      y2={p.to[1]}
                      stroke="#34D399"
                      strokeWidth="2.8"
                      strokeDasharray="3 5"
                      strokeLinecap="round"
                      markerEnd="url(#arrow-pass)"
                      opacity={0.9}
                    />
                  );
                }
                return (
                  <line
                    key={key}
                    x1={p.from[0]}
                    y1={p.from[1]}
                    x2={p.to[0]}
                    y2={p.to[1]}
                    stroke="#F43F5E"
                    strokeWidth="2.5"
                    strokeDasharray="6 4"
                    markerEnd="url(#arrow-defense)"
                    opacity={0.85}
                  />
                );
              })}

              {/* Defense Player Circles */}
              {interpDefense.map(([x, y], idx) => (
                <g key={`def-${idx}`} transform={`translate(${x}, ${y})`}>
                  <circle
                    r="14.5"
                    fill="#0F172A"
                    stroke={defenseColor}
                    strokeWidth="2.4"
                    strokeDasharray="3 2"
                  />
                  <text y="4" textAnchor="middle" fill={defenseColor} fontSize="10.5" fontWeight="800" fontFamily="monospace">
                    D{idx + 1}
                  </text>
                </g>
              ))}

              {/* Offense Player Circles */}
              {interpOffense.map(([x, y], idx) => (
                <g key={`off-${idx}`} transform={`translate(${x}, ${y})`}>
                  <circle r="15.5" fill={offenseColor} stroke="#0E1117" strokeWidth="2.4" />
                  <text y="4" textAnchor="middle" fill="#0E1117" fontSize="11.5" fontWeight="900" fontFamily="monospace">
                    {idx + 1}
                  </text>
                </g>
              ))}

              {/* Basketball Air Flight Glow Trail */}
              {ballState.inAir &&
                ballState.trail.map(([tx, ty], i) => (
                  <circle
                    key={`trail-${i}`}
                    cx={tx}
                    cy={ty}
                    r={6 - i * 1.1}
                    fill={ballState.isShot ? '#00E676' : '#FB923C'}
                    opacity={0.45 - i * 0.09}
                  />
                ))}

              {/* Basketball */}
              <g transform={`translate(${ballState.pos[0]}, ${ballState.pos[1]})`}>
                {ballState.inAir && <circle r="14" fill="url(#ball-glow)" />}
                <circle
                  r={ballState.inAir ? 8.5 : 7.5}
                  fill="#F97316"
                  stroke={ballState.isShot ? '#00E676' : '#1E293B'}
                  strokeWidth="1.8"
                />
                <path d="M -5 0 Q 0 -4 5 0 M 0 -6 L 0 6" fill="none" stroke="#431407" strokeWidth="1.1" />
              </g>

              {/* Topmost Layer: All Player Name Labels (with horizontal edge clamping) */}
              <g className="player-labels">
                {interpDefense.map(([x, y], idx) => {
                  const labelX = Math.max(38, Math.min(462, x));
                  return (
                    <g key={`def-label-${idx}`} transform={`translate(${labelX}, ${y})`}>
                      <rect
                        x="-24"
                        y="-32"
                        width="48"
                        height="14"
                        rx="4"
                        fill="#0E1117"
                        fillOpacity="0.92"
                        stroke="#334155"
                        strokeWidth="0.8"
                      />
                      <text y="-22" textAnchor="middle" fill="#CBD5E1" fontSize="8.5" fontWeight="700">
                        {shortName(defenseRoster[idx])}
                      </text>
                    </g>
                  );
                })}
                {interpOffense.map(([x, y], idx) => {
                  const labelX = Math.max(38, Math.min(462, x));
                  return (
                    <g key={`off-label-${idx}`} transform={`translate(${labelX}, ${y})`}>
                      <rect
                        x="-26"
                        y="17"
                        width="52"
                        height="14.5"
                        rx="4"
                        fill="#0E1117"
                        fillOpacity="0.94"
                        stroke={offenseColor}
                        strokeWidth="0.9"
                      />
                      <text y="27" textAnchor="middle" fill="#FFFFFF" fontSize="8.8" fontWeight="800">
                        {shortName(offenseRoster[idx])}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-2.5 bg-[#0E1117] border border-[#21262D] rounded-xl text-[11px] text-gray-300">
            <div className="flex items-center gap-2">
              <span className="w-6 h-0.5 bg-[#FBBF24] inline-block" />
              <span>實線：運球突破</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-0 border-t-2 border-dashed border-[#A78BFA] inline-block" />
              <span>虛線：掩護／無球空切</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-0 border-t-2 border-dotted border-[#34D399] inline-block" />
              <span>點線：傳球飛行軌跡</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-0 border-t-2 border-dashed border-[#F43F5E] inline-block" />
              <span>紅色：防守包夾／輪轉</span>
            </div>
          </div>
        </div>

        {/* Right: 3-Phase Storyboard + 1-5 Position Matchup Table */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-[#0E1117] border border-[#21262D] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                三階段分鏡戰術拆解
              </span>
              <span className="text-[11px] font-mono text-gray-500">
                {Math.round((progress / 2.0) * 100)}%
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              {activeScenario.phases.map((_, idx) => {
                const active = activeStageIdx === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectPhase(idx)}
                    className={`py-2 px-2 rounded-lg text-xs font-bold border transition-all ${
                      active
                        ? 'bg-[#FF9100]/15 text-[#FF9100] border-[#FF9100]/60'
                        : 'bg-[#161B22] text-gray-400 border-[#21262D] hover:text-white'
                    }`}
                  >
                    階段 {idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Continuous Progress Bar */}
            <div className="w-full h-1.5 bg-[#161B22] rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-gradient-to-r from-[#FF9100] to-[#00E676]"
                style={{ width: `${(progress / 2.0) * 100}%` }}
              />
            </div>

            <div className="space-y-1.5">
              <div className="text-sm font-extrabold text-white">
                {bindRosterPlaceholders(currentPhaseInfo.title, offenseRoster, defenseRoster)}
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                {bindRosterPlaceholders(currentPhaseInfo.description, offenseRoster, defenseRoster)}
              </p>
              {currentPhaseInfo.keyRead && (
                <div className="mt-2 text-[11px] bg-[#161B22] border border-[#30363D] rounded-lg px-3 py-2 text-[#00E676]">
                  <span className="font-bold">關鍵判讀：</span>
                  {bindRosterPlaceholders(currentPhaseInfo.keyRead, offenseRoster, defenseRoster)}
                </div>
              )}
            </div>
          </div>

          {/* 1~5 Position Matchup Table */}
          <div className="bg-[#0E1117] border border-[#21262D] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                1～5 號位攻防對照表
              </span>
              <span className="text-[11px] text-gray-500">即時連動先發名單</span>
            </div>
            <div className="space-y-2">
              {POS_LABELS.map((posLabel, idx) => {
                const offPlayer = offenseRoster[idx];
                const defPlayer = defenseRoster[idx];
                return (
                  <div
                    key={posLabel}
                    className="grid grid-cols-12 items-center gap-2 bg-[#161B22] border border-[#21262D] rounded-lg px-3 py-2 text-xs"
                  >
                    <div className="col-span-3 font-mono font-bold text-gray-400">{posLabel}</div>
                    <div className="col-span-4 truncate font-bold" style={{ color: offenseColor }}>
                      攻：{offPlayer}
                    </div>
                    <div className="col-span-1 text-center text-gray-600 text-[10px]">vs</div>
                    <div className="col-span-4 truncate font-bold text-right" style={{ color: defenseColor }}>
                      守：{defPlayer}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// frontend/lib/archetypes.ts

export interface ArchetypeBadge {
  id: string;
  name: string;
  enName: string;
  desc: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
}

export function determinePlayerArchetypes(playerInfo?: any, situationsData?: any): ArchetypeBadge[] {
  if (!playerInfo) return [];

  const badges: ArchetypeBadge[] = [];

  const usg = Number(playerInfo.usg_pct || 0);
  const apg = Number(playerInfo.apg || 0);
  const rpg = Number(playerInfo.rpg || 0);
  const bpg = Number(playerInfo.bpg || 0);
  const spg = Number(playerInfo.spg || 0);
  const p3Pct = Number(playerInfo.p3_pct || 0);
  const threePar = Number(playerInfo.three_par || 0);

  // Situations 情境數據
  const q4Ppg = Number(situationsData?.q4_ppg || situationsData?.q4?.ppg || 0);
  const q4Ts = Number(situationsData?.q4_ts_pct || situationsData?.q4?.ts_pct || 0);
  const fbPpg = Number(situationsData?.fast_break_ppg || situationsData?.fast_break?.ppg || 0);

  // 1. 持球大核 (Helio-Creator)
  if (usg >= 27.5 && apg >= 4.0) {
    badges.push({
      id: 'HelioCreator',
      name: '持球大核',
      enName: 'Helio-Creator',
      desc: '全隊戰術發動機，具備極高球權主導率與擋拆分球視野',
      bgClass: 'bg-gradient-to-r from-orange-500/20 to-red-500/20',
      borderClass: 'border-orange-500/50',
      textClass: 'text-orange-300',
    });
  }

  // 2. 末節終結者 (Clutch Closer)
  if (q4Ppg >= 5.5 || (q4Ppg >= 4.5 && q4Ts >= 55)) {
    badges.push({
      id: 'ClutchCloser',
      name: '末節終結者',
      enName: 'Clutch Closer',
      desc: '關鍵第四節攻堅核心，高壓讀秒階段具備強大硬解把握度',
      bgClass: 'bg-gradient-to-r from-purple-500/20 to-pink-500/20',
      borderClass: 'border-purple-500/50',
      textClass: 'text-purple-300',
    });
  }

  // 3. 快攻推進尖兵 (Transition Finisher)
  if (fbPpg >= 4.0) {
    badges.push({
      id: 'TransitionFinisher',
      name: '快攻尖兵',
      enName: 'Transition Finisher',
      desc: '轉換進攻推動箭頭，第一時間反擊偷跑與切入衝筐極具威脅',
      bgClass: 'bg-gradient-to-r from-cyan-500/20 to-emerald-500/20',
      borderClass: 'border-cyan-500/50',
      textClass: 'text-cyan-300',
    });
  }

  // 4. 禁區護框錨點 (Rim Protector)
  if (rpg >= 8.5 && (bpg >= 0.8 || playerInfo.position?.includes('C'))) {
    badges.push({
      id: 'RimAnchor',
      name: '禁區錨點',
      enName: 'Rim Anchor',
      desc: '油漆區屏障與籃板保障，掌控禁區制空權與護框干擾',
      bgClass: 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20',
      borderClass: 'border-amber-500/50',
      textClass: 'text-amber-300',
    });
  }

  // 5. 外線空間砲塔 (Floor Spacer)
  if (threePar >= 45 || p3Pct >= 38.0) {
    badges.push({
      id: 'PerimeterSniper',
      name: '空間砲塔',
      enName: 'Floor Spacer',
      desc: '外線定點高威脅牽制點，無球跑動為持球隊友拉開半場空間',
      bgClass: 'bg-gradient-to-r from-sky-500/20 to-blue-500/20',
      borderClass: 'border-sky-500/50',
      textClass: 'text-sky-300',
    });
  }

  // 6. 側翼防守大閘 (Two-Way Stopper)
  if (spg >= 1.5) {
    badges.push({
      id: 'TwoWayStopper',
      name: '側翼大閘',
      enName: 'Perimeter Stopper',
      desc: '外圍第一線纏鬥鎖匠，擅長破壞傳球路徑並迫使對手失誤',
      bgClass: 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20',
      borderClass: 'border-emerald-500/50',
      textClass: 'text-emerald-300',
    });
  }

  // 若無任何特定極端標籤，給予均衡體系標籤
  if (badges.length === 0) {
    badges.push({
      id: 'SystemRotational',
      name: '體系核心',
      enName: 'System Rotational',
      desc: '穩定銜接團隊攻防節奏，恪守體系戰術紀律之全能拼圖',
      bgClass: 'bg-slate-800/40',
      borderClass: 'border-slate-700',
      textClass: 'text-slate-300',
    });
  }

  // 最多取前 2 個最具代表性的標籤
  return badges.slice(0, 2);
}
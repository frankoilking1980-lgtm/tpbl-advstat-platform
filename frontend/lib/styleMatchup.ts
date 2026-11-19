export interface TeamStyleMetrics {
  team_name: string;
  three_par: number;
  orb_pct: number;
  opp_3pt_pct: number;
  dreb_pct: number;
  league_avg_opp_3pt_pct?: number;
  league_avg_orb_pct?: number;
  league_avg_dreb_pct?: number;
}

export interface LeagueStyleAverage {
  opp_3pt_pct: number;
  orb_pct: number;
  dreb_pct: number;
}

export interface StyleMatchupResult {
  primary_tag: string;
  tags: string[];
  summary: string;
  home_delta_efg: number;
  away_delta_efg: number;
  home_delta_oreb: number;
  away_delta_oreb: number;
  home_total_adj: number;
  away_total_adj: number;
  net_efg_diff: number;
  net_oreb_diff: number;
  net_style_adj: number;
}

const DEFAULT_LEAGUE_AVG: LeagueStyleAverage = {
  opp_3pt_pct: 34.4,
  orb_pct: 27.9,
  dreb_pct: 69.2,
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Four Factors 風格相剋係數（與後端 style_matchup.py 完全一致）：
 * (a) 外線風格相剋 (ΔeFG) = 0.5 * (進攻方 3PAr / 100) * (防守方被對手 3PT% - 聯盟均值)
 * (b) 籃板衝搶相剋 (ΔOREB) = 0.4 * ((進攻方 OREB% - 防守方 DREB%) - (聯盟均值 OREB% - 聯盟均值 DREB%))
 */
export function computeStyleMatchupAdjustment(
  homeTeamName: string,
  awayTeamName: string,
  homeStats?: Partial<TeamStyleMetrics> | null,
  awayStats?: Partial<TeamStyleMetrics> | null,
  leagueAvgInput?: Partial<LeagueStyleAverage> | null
): StyleMatchupResult {
  const lgOpp3pt =
    leagueAvgInput?.opp_3pt_pct ??
    homeStats?.league_avg_opp_3pt_pct ??
    awayStats?.league_avg_opp_3pt_pct ??
    DEFAULT_LEAGUE_AVG.opp_3pt_pct;
  const lgOrb =
    leagueAvgInput?.orb_pct ??
    homeStats?.league_avg_orb_pct ??
    awayStats?.league_avg_orb_pct ??
    DEFAULT_LEAGUE_AVG.orb_pct;
  const lgDreb =
    leagueAvgInput?.dreb_pct ??
    homeStats?.league_avg_dreb_pct ??
    awayStats?.league_avg_dreb_pct ??
    DEFAULT_LEAGUE_AVG.dreb_pct;

  const h3par = Number(homeStats?.three_par ?? 40.0);
  const hOrb = Number(homeStats?.orb_pct ?? lgOrb);
  const hOpp3pt = Number(homeStats?.opp_3pt_pct ?? lgOpp3pt);
  const hDreb = Number(homeStats?.dreb_pct ?? lgDreb);

  const a3par = Number(awayStats?.three_par ?? 40.0);
  const aOrb = Number(awayStats?.orb_pct ?? lgOrb);
  const aOpp3pt = Number(awayStats?.opp_3pt_pct ?? lgOpp3pt);
  const aDreb = Number(awayStats?.dreb_pct ?? lgDreb);

  const homeDeltaEfg = round2(0.5 * (h3par / 100.0) * (aOpp3pt - lgOpp3pt));
  const awayDeltaEfg = round2(0.5 * (a3par / 100.0) * (hOpp3pt - lgOpp3pt));

  const baselineRebGap = lgOrb - lgDreb;
  const homeDeltaOreb = round2(0.4 * ((hOrb - aDreb) - baselineRebGap));
  const awayDeltaOreb = round2(0.4 * ((aOrb - hDreb) - baselineRebGap));

  const homeTotalAdj = round2(homeDeltaEfg + homeDeltaOreb);
  const awayTotalAdj = round2(awayDeltaEfg + awayDeltaOreb);

  const netEfgDiff = round2(homeDeltaEfg - awayDeltaEfg);
  const netOrebDiff = round2(homeDeltaOreb - awayDeltaOreb);
  const netStyleAdj = round2(homeTotalAdj - awayTotalAdj);

  const absEfg = Math.abs(netEfgDiff);
  const absOreb = Math.abs(netOrebDiff);

  const tags: string[] = [];
  let primaryTag = '⚖️ 攻防節奏拉鋸';
  let summary = `雙方外線與籃板風格相剋幅度接近（總風格淨修正 ${netStyleAdj >= 0 ? '+' : ''}${netStyleAdj.toFixed(2)}），勝負將回歸臨場節奏與主力執行力。`;

  if (absEfg >= 0.35 && absEfg >= absOreb) {
    const edgeTeam = netEfgDiff > 0 ? homeTeamName : awayTeamName;
    primaryTag = '🔥 外線火力克制';
    tags.push(primaryTag);
    if (absOreb >= 0.45) {
      tags.push('💪 禁區二次進攻優勢');
    }
    summary = `${edgeTeam} 外線對位佔優（ΔeFG 淨差 ${netEfgDiff >= 0 ? '+' : ''}${netEfgDiff.toFixed(2)}）：高三分比重遇上對手外圍防守落差。`;
  } else if (absOreb >= 0.45 && absOreb > absEfg) {
    const edgeTeam = netOrebDiff > 0 ? homeTeamName : awayTeamName;
    primaryTag = '💪 禁區二次進攻優勢';
    tags.push(primaryTag);
    if (absEfg >= 0.35) {
      tags.push('🔥 外線火力克制');
    }
    summary = `${edgeTeam} 籃板衝搶佔優（ΔOREB 淨差 ${netOrebDiff >= 0 ? '+' : ''}${netOrebDiff.toFixed(2)}）：進攻籃板率對上對手防守籃板保護存在明顯落差。`;
  } else {
    tags.push(primaryTag);
  }

  return {
    primary_tag: primaryTag,
    tags,
    summary,
    home_delta_efg: homeDeltaEfg,
    away_delta_efg: awayDeltaEfg,
    home_delta_oreb: homeDeltaOreb,
    away_delta_oreb: awayDeltaOreb,
    home_total_adj: homeTotalAdj,
    away_total_adj: awayTotalAdj,
    net_efg_diff: netEfgDiff,
    net_oreb_diff: netOrebDiff,
    net_style_adj: netStyleAdj,
  };
}

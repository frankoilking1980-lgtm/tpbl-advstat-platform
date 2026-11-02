/**
 * game.ts - 逐場賽事覆盤核心型別定義
 */

export interface GameListItem {
  id: string;
  date: string;
  stage: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  status: string;
  venue?: string;
  notes?: string;
}

export interface MetricComparisonItem {
  id: string;
  label: string;
  code: string;
  subLabel: string;
  awayVal: number;
  homeVal: number;
  awayDisplay?: string;
  homeDisplay?: string;
  format: (v: number) => string;
  higherIsBetter: boolean;
  category: 'rating' | 'four_factors' | 'shooting';
}

export interface GameLineupItem {
  id: number | string;
  team_name: string;
  kind: 'lineup' | 'duo' | string;
  lineup_name: string;
  minutes: string;
  seconds: number;
  plus_minus: number | null;
  ortg: number | null;
  drtg: number | null;
  netrtg: number | null;
  display_order?: number;
}

export interface TeamLineupsAndPairs {
  lineups: GameLineupItem[];
  pairs: GameLineupItem[];
}

export interface LineupsAndPairs {
  away: TeamLineupsAndPairs;
  home: TeamLineupsAndPairs;
}

export interface GamePlayerOnOffItem {
  id: number | string;
  team_name: string;
  player_name: string;
  minutes_on: string;
  seconds_on: number;
  on_ortg: number | null;
  on_drtg: number | null;
  on_netrtg: number | null;
  off_netrtg: number | null;
  diff_netrtg: number | null;
  display_order?: number;
}

export interface PlayerOnOff {
  away: GamePlayerOnOffItem[];
  home: GamePlayerOnOffItem[];
}

export interface GameTacticItem {
  id: number | string;
  team_name: string;
  category: string;
  description: string;
  is_summary?: boolean;
  display_order?: number;
}

export interface TacticsWOWY {
  away: GameTacticItem[];
  home: GameTacticItem[];
}

export interface BoxScorePlayer {
  id: number | string;
  team_name: string;
  jersey_number: string;
  player_name: string;
  position: string;
  identity: string; // 本土 / 洋將 / 華裔
  is_starter?: boolean;
  minutes: string;
  seconds: number;
  pts: number;
  fgm: number;
  fga: number;
  fg_pct?: number;
  tpm: number;
  tpa: number;
  tp_pct?: number;
  ftm: number;
  fta: number;
  ft_pct?: number;
  orb: number;
  drb: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  plus_minus: number;
  efg_pct: number;
  ts_pct: number;
  usg_pct: number;
  gmsc: number;
}

export interface GameMetrics11 {
  ortg: { away: number; home: number };
  drtg: { away: number; home: number };
  possessions: { away: number; home: number };
  efg_pct: { away: number; home: number };
  tov_pct: { away: number; home: number };
  orb_pct: { away: number; home: number };
  threepar: { away: number; home: number };
  ftr: { away: number; home: number };
  fgm_a: { away_made: number; away_att: number; home_made: number; home_att: number };
  tpm_a: { away_made: number; away_att: number; home_made: number; home_att: number };
  ftm_a: { away_made: number; away_att: number; home_made: number; home_att: number };
}

export interface DetailedGameData {
  id: string;
  date: string;
  stage: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  status: string;
  venue?: string;
  quarter_scores?: {
    away: number[];
    home: number[];
  };
  metrics11?: GameMetrics11;
  lineups_and_pairs?: LineupsAndPairs;
  player_onoff?: PlayerOnOff;
  tactics_wowy?: TacticsWOWY;
  home_boxscore?: BoxScorePlayer[];
  away_boxscore?: BoxScorePlayer[];
  player_stats?: BoxScorePlayer[];
}

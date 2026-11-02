export const TEAM_LOGOS: Record<string, string> = {
  "新北國王": "/logos/kings.jpg",
  "國王": "/logos/kings.jpg",
  "新北中信特攻": "/logos/dea.jpg",
  "中信特攻": "/logos/dea.jpg",
  "特攻": "/logos/dea.jpg",
  "福爾摩沙夢想家": "/logos/dreamers.jpg",
  "夢想家": "/logos/dreamers.jpg",
  "高雄全家海神": "/logos/aquas.jpg",
  "海神": "/logos/aquas.jpg",
  "桃園台啤永豐雲豹": "/logos/leopards.jpg",
  "雲豹": "/logos/leopards.jpg",
  "新竹御嵿攻城獅": "/logos/lioneers.jpg",
  "攻城獅": "/logos/lioneers.jpg",
  "臺北台新戰神": "/logos/mars.jpg",
  "台北台新戰神": "/logos/mars.jpg",
  "戰神": "/logos/mars.jpg",
};

export const LEAGUE_LOGO = "/logos/tpbl.jpg";

/**
 * 依球隊名稱模糊比對隊徽
 */
export function getTeamLogo(teamName: string): string {
  if (!teamName) return LEAGUE_LOGO;
  for (const [key, path] of Object.entries(TEAM_LOGOS)) {
    if (teamName.includes(key) || key.includes(teamName)) {
      return path;
    }
  }
  return LEAGUE_LOGO;
}
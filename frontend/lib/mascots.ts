export interface MascotSetting {
  id: string;
  name: string;
  file: string;
  containerClass: string;
  imgClass: string;
  glowColor: string;
}

export const MASCOTS_MAP: Record<string, MascotSetting> = {
  // 1. 新北國王 -> Hiro (半身手持權杖，置於右下、稍微放大探出)
  "新北國王": {
    id: "Hiro",
    name: "Hiro",
    file: "/mascots/Hiro.jpg",
    containerClass: "right-[-10px] sm:right-2 bottom-[-15px] sm:bottom-[-25px] w-52 sm:w-68 lg:w-80",
    imgClass: "scale-115 object-contain",
    glowColor: "rgba(255, 193, 7, 0.35)",
  },

  // 2. 新竹御頂攻城獅 -> Ready (大頭比 YA 姿勢，正面飽滿展示)
  "新竹御頂攻城獅": {
    id: "Ready",
    name: "Ready",
    file: "/mascots/Ready.jpg",
    containerClass: "right-[-15px] sm:right-2 bottom-[-10px] sm:bottom-[-15px] w-48 sm:w-64 lg:w-72",
    imgClass: "scale-110 object-contain",
    glowColor: "rgba(156, 39, 176, 0.35)",
  },

  // 3. 高雄全家海神 -> Brownie (海浪側身向前俯衝動作，靠右微調)
  "高雄全家海神": {
    id: "Brownie",
    name: "Brownie",
    file: "/mascots/Brownie.jpg",
    containerClass: "right-0 sm:right-4 bottom-[-10px] w-48 sm:w-60 lg:w-68",
    imgClass: "scale-105 object-contain",
    glowColor: "rgba(3, 169, 244, 0.35)",
  },

  // 4. 桃園台啤永豐雲豹 -> LeopardBro (全身修長跨步走姿，拉大高度展現長腿)
  "桃園台啤永豐雲豹": {
    id: "LeopardBro",
    name: "LeopardBro",
    file: "/mascots/LeopardBro.jpg",
    containerClass: "right-2 sm:right-6 bottom-[-20px] w-44 sm:w-56 lg:w-64",
    imgClass: "scale-120 object-contain",
    glowColor: "rgba(139, 195, 74, 0.35)",
  },

  // 5. 臺北台新戰神 -> Richart (紅帽披風站姿)
  "臺北台新戰神": {
    id: "Richart",
    name: "Richart",
    file: "/mascots/Richart.jpg",
    containerClass: "right-1 sm:right-5 bottom-[-10px] w-44 sm:w-56 lg:w-64",
    imgClass: "scale-110 object-contain",
    glowColor: "rgba(244, 67, 54, 0.35)",
  },

  // 6. 新北中信特攻 -> Thunder (金黃戰甲特警站姿，硬核立體)
  "新北中信特攻": {
    id: "Thunder",
    name: "Thunder",
    file: "/mascots/Thunder.jpg",
    containerClass: "right-2 sm:right-6 bottom-[-15px] w-44 sm:w-56 lg:w-64",
    imgClass: "scale-115 object-contain",
    glowColor: "rgba(255, 214, 0, 0.35)",
  },

  // 7. 福爾摩沙夢想家 -> Unicorn (綠色獨角獸正面站姿)
  "福爾摩沙夢想家": {
    id: "Unicorn",
    name: "Unicorn",
    file: "/mascots/Unicorn.jpg",
    containerClass: "right-2 sm:right-6 bottom-[-10px] w-44 sm:w-56 lg:w-64",
    imgClass: "scale-110 object-contain",
    glowColor: "rgba(0, 230, 118, 0.35)",
  },
};

export function getMascotByTeam(teamName: string): MascotSetting | null {
  if (!teamName) return null;
  for (const [key, config] of Object.entries(MASCOTS_MAP)) {
    if (teamName.includes(key) || key.includes(teamName)) {
      return config;
    }
  }
  return null;
}
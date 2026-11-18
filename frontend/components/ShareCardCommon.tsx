'use client';

import React, { useEffect, useState } from 'react';
import { toPng } from 'html-to-image';

export const TEAM_LOGO_MAP: Record<string, string> = {
  新北國王: 'kings',
  臺北台新戰神: 'mars',
  新北中信特攻: 'dea',
  桃園台啤永豐雲豹: 'leopards',
  新竹御嵿攻城獅: 'lioneers',
  福爾摩沙夢想家: 'dreamers',
  高雄全家海神: 'aquas',
};

/**
 * 圓形 ADV STATS 新 Logo（純 SVG 向量繪製，在任何 pixelRatio 與行動裝置 Canvas 匯出皆保持銳利）
 */
export function AdvStatsCircleLogo({ size = 46 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full shrink-0 flex items-center justify-center shadow-lg shadow-[#FF9100]/20 overflow-hidden"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="advLogoBg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1C222D" />
            <stop offset="100%" stopColor="#090C10" />
          </linearGradient>
          <linearGradient id="advLogoRing" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FF9100" />
            <stop offset="55%" stopColor="#FFB300" />
            <stop offset="100%" stopColor="#00E676" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="30.5" fill="url(#advLogoBg)" stroke="url(#advLogoRing)" strokeWidth="2.5" />
        {/* 籃球弧線與數據軌跡底紋 */}
        <path
          d="M11 26C19 29 45 29 53 26"
          stroke="#FF9100"
          strokeOpacity="0.22"
          strokeWidth="1.5"
        />
        <path
          d="M14 42C22 37 42 37 50 42"
          stroke="#00E676"
          strokeOpacity="0.22"
          strokeWidth="1.5"
        />
        <text
          x="32"
          y="29"
          textAnchor="middle"
          fill="#FF9100"
          fontSize="11.5"
          fontWeight="900"
          fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
          letterSpacing="1"
        >
          ADV
        </text>
        <text
          x="32"
          y="42"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="10.5"
          fontWeight="900"
          fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
          letterSpacing="0.8"
        >
          STATS
        </text>
        <circle cx="32" cy="51.5" r="2.2" fill="#00E676" />
      </svg>
    </div>
  );
}

/**
 * 支援離線/Canvas 匯出的球隊 Logo（含 .jpg -> .png -> 文字 fallback）
 */
export function CardTeamLogo({
  teamName,
  color,
  sizeClass = 'w-16 h-16',
}: {
  teamName: string;
  color: string;
  sizeClass?: string;
}) {
  const fileBase = TEAM_LOGO_MAP[teamName] || 'tpbl';
  const [ext, setExt] = useState<'jpg' | 'png'>('jpg');
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setExt('jpg');
    setHasError(false);
  }, [teamName]);

  if (hasError) {
    return (
      <div
        className={`${sizeClass} rounded-2xl bg-[#161B22] border-2 flex items-center justify-center p-2 text-center shadow-lg font-black text-base shrink-0`}
        style={{ borderColor: color, color }}
      >
        {teamName.slice(-2)}
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-2xl bg-[#161B22] border-2 p-2 flex items-center justify-center shrink-0 shadow-lg overflow-hidden`}
      style={{ borderColor: `${color}66` }}
    >
      <img
        src={`/logos/${fileBase}.${ext}`}
        alt={teamName}
        crossOrigin="anonymous"
        decoding="sync"
        loading="eager"
        className="w-full h-full object-contain"
        onError={() => {
          if (ext === 'jpg') setExt('png');
          else setHasError(true);
        }}
      />
    </div>
  );
}

/**
 * 支援 Canvas 匯出的球員頭像（/players/{name}.png -> /players/player.png -> 姓名縮寫）
 */
export function CardPlayerAvatar({
  playerName,
  accentColor,
  sizeClass = 'w-20 h-20',
}: {
  playerName: string;
  accentColor: string;
  sizeClass?: string;
}) {
  const cleanName = (playerName || '').trim();
  const [src, setSrc] = useState(`/players/${encodeURIComponent(cleanName)}.png`);
  const [failedAll, setFailedAll] = useState(false);

  useEffect(() => {
    setSrc(`/players/${encodeURIComponent(cleanName)}.png`);
    setFailedAll(false);
  }, [cleanName]);

  if (!cleanName || failedAll) {
    return (
      <div
        className={`${sizeClass} rounded-2xl bg-[#0E1117] border-2 flex items-center justify-center font-black text-lg shrink-0 shadow-lg`}
        style={{ borderColor: accentColor, color: accentColor }}
      >
        {cleanName.slice(0, 2) || '?'}
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-2xl bg-[#0E1117] border-2 overflow-hidden shrink-0 shadow-lg flex items-end justify-center`}
      style={{ borderColor: `${accentColor}88` }}
    >
      <img
        src={src}
        alt={cleanName}
        crossOrigin="anonymous"
        decoding="sync"
        loading="eager"
        className="w-full h-full object-cover object-top"
        onError={() => {
          if (!src.endsWith('/players/player.png')) {
            setSrc('/players/player.png');
          } else {
            setFailedAll(true);
          }
        }}
      />
    </div>
  );
}

/**
 * 計算雙色對比條寬度（保留 5%~95% 安全視覺邊界）
 */
export const calcDualBarWidths = (valA: number, valB: number): [number, number] => {
  const safeA = Number.isFinite(valA) && valA > 0 ? valA : 0;
  const safeB = Number.isFinite(valB) && valB > 0 ? valB : 0;
  const sum = safeA + safeB;
  if (sum <= 0) return [50, 50];
  const widthA = Math.min(95, Math.max(5, (safeA / sum) * 100));
  return [widthA, 100 - widthA];
};

/**
 * 復用戰術模擬器驗證過的高清 PNG 匯出核心（含字體/圖片就緒等待與 iOS/Android pixelRatio 降級容錯）
 */
export async function exportCardToPng(
  element: HTMLElement,
  width: number,
  height: number
): Promise<string> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const imgs = Array.from(element.querySelectorAll('img'));
  await Promise.all(
    imgs.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      });
    })
  );

  const isMobile =
    typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const ratios = isMobile ? [1.5, 1] : [2, 1.5, 1];
  let lastError: unknown;

  for (const pixelRatio of ratios) {
    try {
      return await toPng(element, {
        cacheBust: false,
        pixelRatio,
        width,
        height,
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * 觸發 PNG 檔案下載（相容桌面與 iOS/Android 行動瀏覽器）
 */
export function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

'use client';

import React, { useState } from 'react';

interface PlayerPortraitProps {
  playerName?: string;
  isRightSide?: boolean;
}

export function PlayerPortrait({ playerName, isRightSide = false }: PlayerPortraitProps) {
  const [hasError, setHasError] = useState(false);

  if (!playerName) return null;

  // 1. 若找不到球員照片，顯示預設相框 (player.png)
  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center flex-shrink-0 animate-fadeIn">
        <div className="w-44 h-64 sm:w-52 sm:h-72 rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-[#161B22]/50 p-2 flex items-center justify-center">
          <img
            src="/players/player.png"
            alt="預設剪影"
            className="w-full h-full object-contain"
          />
        </div>
        <span className="mt-2 text-xs font-mono text-gray-500 tracking-wider">
          {playerName}
        </span>
      </div>
    );
  }

  // 2. 有照片時：無框剪影模式（仿吉祥物立體展示）
  return (
    <div className="relative flex flex-col items-center justify-end flex-shrink-0 group">
      {/* 底部投射光暈（增強立體感，不搶眼） */}
      <div className="absolute bottom-4 w-36 h-12 bg-amber-500/10 blur-xl rounded-full pointer-events-none" />

      {/* 球員去背半身像 */}
      <div className="relative w-48 h-64 sm:w-56 sm:h-80 flex items-end justify-center overflow-visible">
        <img
          src={`/players/${encodeURIComponent(playerName.trim())}.png`}
          alt={playerName}
          className={`h-full w-auto max-w-none object-contain select-none transition-all duration-300 hover:scale-105 filter drop-shadow-[0_12px_24px_rgba(0,0,0,0.7)] ${
            isRightSide ? '-scale-x-100' : ''
          }`}
          onError={() => setHasError(true)}
        />
      </div>

      {/* 底部球員標籤 */}
      <span className="mt-1 text-xs font-medium text-gray-400 bg-white/5 px-2.5 py-0.5 rounded-full border border-white/10 backdrop-blur-sm">
        {playerName}
      </span>
    </div>
  );
}
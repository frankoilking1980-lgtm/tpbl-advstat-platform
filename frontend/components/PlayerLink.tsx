'use client';

import React from 'react';

interface Props {
  name: string;
  stage?: string;
  className?: string;
  children?: React.ReactNode;
}

export function PlayerLink({
  name,
  stage = '2026-2027 例行賽',
  className = '',
  children,
}: Props) {
  if (!name || name === '未知' || name === '-') {
    return <span className={className}>{children || name}</span>;
  }

  const cleanName = name.trim();
  const targetUrl = `/player-cards?player=${encodeURIComponent(cleanName)}&stage=${encodeURIComponent(stage)}`;

  const handleClick = (e: React.MouseEvent) => {
    // 阻止所有父層事件干擾
    e.preventDefault();
    e.stopPropagation();

    console.log('>>> [PlayerLink] 被點擊了！目標球員:', cleanName, '目標網址:', targetUrl);
    
    // 強制用瀏覽器最底層的跳轉
    window.location.assign(targetUrl);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{ position: 'relative', zIndex: 9999, cursor: 'pointer' }}
      className={`text-amber-400 hover:text-cyan-400 underline underline-offset-4 font-bold transition-all text-left inline-block bg-transparent border-none p-0 ${className}`}
      title={`點擊查看 ${cleanName} 球員戰力卡`}
    >
      {children || cleanName}
    </button>
  );
}
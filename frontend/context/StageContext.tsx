'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface StageItem {
  id: string;
  name: string;
  is_default: boolean;
  year?: string;
}

// 乾淨的標準預設清單（與官方順序一致）
export const DEFAULT_STAGES: StageItem[] = [
  { id: '2026-2027 例行賽', name: '2026-2027 例行賽', is_default: true, year: '2026-2027' },
  { id: '2026-2027 熱身賽', name: '2026-2027 熱身賽', is_default: false, year: '2026-2027' },
  { id: '2025-2026 冠軍賽', name: '2025-2026 冠軍賽', is_default: false, year: '2025-2026' },
  { id: '2025-2026 季後賽', name: '2025-2026 季後賽', is_default: false, year: '2025-2026' },
  { id: '2025-2026 季後挑戰賽', name: '2025-2026 季後挑戰賽', is_default: false, year: '2025-2026' },
  { id: '2025-2026 例行賽', name: '2025-2026 例行賽', is_default: false, year: '2025-2026' },
  { id: '2024-2025 冠軍賽', name: '2024-2025 冠軍賽', is_default: false, year: '2024-2025' },
  { id: '2024-2025 例行賽', name: '2024-2025 例行賽', is_default: false, year: '2024-2025' },
];

interface StageContextType {
  stage: string;
  setStage: (stage: string) => void;
  stagesList: StageItem[];
}

const StageContext = createContext<StageContextType>({
  stage: '2026-2027 例行賽',
  setStage: () => {},
  stagesList: DEFAULT_STAGES,
});

export function StageProvider({ children }: { children: React.ReactNode }) {
  const [stage, setStageState] = useState<string>('2026-2027 例行賽');
  const [stagesList, setStagesList] = useState<StageItem[]>(DEFAULT_STAGES);

  useEffect(() => {
    // 優先讀取 localStorage 快取
    const saved = localStorage.getItem('tpbl_selected_stage');
    if (saved && saved !== '2026-2027 季前熱身賽') {
      setStageState(saved);
    } else {
      setStageState('2026-2027 例行賽');
    }
    
    // 直接以最新後端 API 回傳的清單與排序為準，若 API 連不上才使用 DEFAULT_STAGES
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
    fetch(`${apiBase}/api/stages`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data) && data.length > 0) {
          setStagesList(data);
          
          // 如果當前選中的 stage 不在清單中，自動修正為預設項目
          const exists = data.some((item: StageItem) => item.id === saved);
          if (!exists) {
            const defItem = data.find((item: StageItem) => item.is_default) || data[0];
            setStageState(defItem.id);
            localStorage.setItem('tpbl_selected_stage', defItem.id);
          }
        }
      })
      .catch(() => {});
  }, []);

  const setStage = (newStage: string) => {
    setStageState(newStage);
    localStorage.setItem('tpbl_selected_stage', newStage);
  };

  return (
    <StageContext.Provider value={{ stage, setStage, stagesList }}>
      {children}
    </StageContext.Provider>
  );
}

export function useStage() {
  return useContext(StageContext);
}
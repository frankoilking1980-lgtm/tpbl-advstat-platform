import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import { StageProvider } from '@/context/StageContext';
import { SpeedInsights } from '@vercel/speed-insights/next';

export const metadata: Metadata = {
  title: 'TPBL 進階數據平台・AdvStats Pro',
  description: '臺灣職業籃球大聯盟 (TPBL) 7隊戰力評級、進階四要素、On/Off 陣容與主力效率象限分析系統',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW" className="dark">
      <body className="bg-[#0E1117] text-gray-100 antialiased selection:bg-[#FF9100]/30 selection:text-amber-200">
        <StageProvider>
          <div className="min-h-screen flex flex-col bg-[#0E1117]">
            <Navbar />
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {children}
            </main>
            <footer className="border-t border-[#21262D] py-6 text-center text-xs text-gray-500 bg-[#0E1117]">
              <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p>© 2025-2027 TPBL Advanced Basketball Analytics Platform. All rights reserved.</p>
                <div className="flex items-center space-x-2 text-gray-400">
                  <span className="text-[#00E676] font-semibold">FastAPI + SQLite</span>
                  <span>•</span>
                  <span className="text-[#FF9100] font-semibold">Next.js + Tailwind</span>
                  <span>•</span>
                  <span>SWR 抗流量快取</span>
                </div>
              </div>
            </footer>
          </div>
        </StageProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}

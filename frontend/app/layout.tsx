import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import { StageProvider } from '@/context/StageContext';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  metadataBase: new URL('https://tpbl-advstat-platform.vercel.app'),
  title: {
    default: 'TPBL 進階數據平台・AdvStats Pro',
    template: '%s｜AdvStats Pro',
  },
  description: '臺灣職業籃球大聯盟 (TPBL) 7隊戰力評級、Dean Oliver進階四要素、On/Off 陣容 Net Rating、球員PR排名與主力效率象限分析系統。',
  keywords: [
    'TPBL', 'TPBL 數據', 'TPBL 進階數據', '台灣職籃', 'Dean Oliver 四大要素',
    'On/Off 淨勝分', 'PBP 陣容數據', '新北國王', '球員戰力卡', '籃球進階數據'
  ],
  authors: [{ name: 'AdvStats Pro Team' }],
  creator: 'AdvStats Pro',
  publisher: 'AdvStats Pro',
  openGraph: {
    title: 'TPBL 進階數據平台・AdvStats Pro',
    description: '提供 TPBL 即時進階攻守數據、PBP 陣容 On/Off 淨勝分、Dean Oliver 四要素、球員 PR 排名與 Q4 末節抗壓分析。',
    url: 'https://tpbl-advstat-platform.vercel.app',
    siteName: 'TPBL AdvStats Pro',
    locale: 'zh_TW',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TPBL 進階數據平台・AdvStats Pro',
    description: '提供 TPBL 即時進階攻守數據、PBP 陣容 On/Off、四要素與球員 PR 排名。',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'Av2GvObWa85K-jKwCLdf-4QQ-79j3hA_w0SbXSew6oI',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'TPBL AdvStats Pro',
    alternateName: 'TPBL 進階數據平台',
    url: 'https://tpbl-advstat-platform.vercel.app',
    applicationCategory: 'SportsApplication',
    operatingSystem: 'All',
    description: '提供 TPBL 台灣職業籃球大聯盟即時進階攻守數據、陣容 Net Rating、球員 PR 排名與情境抗壓分析。',
    about: {
      '@type': 'SportsOrganization',
      name: 'TPBL 台灣職業籃球大聯盟',
    },
  };

  return (
    <html lang="zh-TW" className="dark">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="bg-[#0E1117] text-gray-100 antialiased selection:bg-[#FF9100]/30 selection:text-amber-200">
        <StageProvider>
          <div className="min-h-screen flex flex-col bg-[#0E1117]">
            <Navbar />
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {children}
            </main>

          </div>
        </StageProvider>
        <Analytics />
      </body>
    </html>
  );
}
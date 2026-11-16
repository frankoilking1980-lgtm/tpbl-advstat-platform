import { MetadataRoute } from 'next';

const BASE_URL = 'https://www.tpbl-advstats.com';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/weekly-preview`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE_URL}/games`, lastModified: now, changeFrequency: 'daily', priority: 0.85 },
    { url: `${BASE_URL}/player-cards`, lastModified: now, changeFrequency: 'weekly', priority: 0.85 },
    { url: `${BASE_URL}/pbp`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/scatter`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/matchup`, lastModified: now, changeFrequency: 'weekly', priority: 0.75 },
    { url: `${BASE_URL}/glossary`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ];

  // 動態抓取所有賽事 ID，讓 Google 索引每一場單場深度報告 (/games/[id])
  let gameRoutes: MetadataRoute.Sitemap = [];
  try {
    const res = await fetch(`${API_BASE}/api/games`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const games = await res.json();
      if (Array.isArray(games)) {
        gameRoutes = games
          .filter((g) => g?.id != null)
          .map((g) => ({
            url: `${BASE_URL}/games/${g.id}`,
            lastModified: g.date ? new Date(g.date) : now,
            changeFrequency: 'monthly' as const,
            priority: 0.7,
          }));
      }
    }
  } catch {
    // 若建置期間後端暫不可達，安全略過動態路由不影響 build
  }

  return [...staticRoutes, ...gameRoutes];
}
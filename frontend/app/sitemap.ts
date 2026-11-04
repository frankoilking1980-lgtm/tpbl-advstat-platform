import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://www.tpbl-advstats.com';

  return [
    { url: baseUrl, lastModified: new Date(), priority: 1.0 },
    { url: `${baseUrl}/scatter`, lastModified: new Date(), priority: 0.8 },
    { url: `${baseUrl}/pbp`, lastModified: new Date(), priority: 0.8 },
    { url: `${baseUrl}/games`, lastModified: new Date(), priority: 0.8 },
    { url: `${baseUrl}/player-cards`, lastModified: new Date(), priority: 0.8 },
    { url: `${baseUrl}/glossary`, lastModified: new Date(), priority: 0.6 },
  ];
}
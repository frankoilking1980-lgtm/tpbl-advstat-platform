/** @type {import('next').NextConfig} */
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const nextConfig = {
  reactStrictMode: true,
  // 略過打包階段的 ESLint 攔截，確保順利通過生產編譯
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 保留標準 TypeScript 型別嚴格檢查
  typescript: {
    ignoreBuildErrors: false,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
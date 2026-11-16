import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const backendBase = (
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://127.0.0.1:8000'
  ).replace(/\/+$/, '');

  const targetUrl = `${backendBase}/api/admin/pipeline/generate-reviews`;

  try {
    const bodyText = await req.text();
    const adminSecret = req.headers.get('x-admin-secret') || '';

    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(adminSecret ? { 'X-Admin-Secret': adminSecret } : {}),
      },
      body: bodyText,
      cache: 'no-store',
      signal: AbortSignal.timeout(290_000),
    });

    const rawText = await upstream.text();
    let parsed: unknown = null;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = null;
      }
    }

    if (parsed !== null) {
      return NextResponse.json(parsed, { status: upstream.status });
    }

    return NextResponse.json(
      { detail: rawText || `Upstream HTTP ${upstream.status}` },
      { status: upstream.status }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { detail: `Proxy 轉發至後端失敗 (${targetUrl})：${msg}` },
      { status: 502 }
    );
  }
}

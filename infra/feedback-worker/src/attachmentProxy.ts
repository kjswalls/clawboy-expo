import type { Env } from './types';

export async function serveAttachment(
  env: Env,
  ctx: ExecutionContext,
  nonce: string,
  index: string,
): Promise<Response> {
  const cache = caches.default;

  // Normalise the cache key to strip any query params (e.g. stale tokens).
  const cacheKey = new Request(
    `https://attachment-cache.internal/v1/attachments/${nonce}/${index}.jpg`,
    { method: 'GET' },
  );

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const branch = env.GITHUB_DEFAULT_BRANCH ?? 'main';
  const filePath = `feedback-attachments/${nonce}/${index}.jpg`;
  const contentsUrl = `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`;

  const metaRes = await fetch(contentsUrl, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'clawboy-feedback-worker',
    },
  });

  if (metaRes.status === 404) {
    return new Response('Not found', { status: 404 });
  }
  if (!metaRes.ok) {
    return new Response('Upstream error', { status: 502 });
  }

  const meta = (await metaRes.json()) as { download_url?: string };
  const downloadUrl = meta.download_url;
  if (!downloadUrl) {
    return new Response('No download URL', { status: 502 });
  }

  const imgRes = await fetch(downloadUrl);
  if (!imgRes.ok) {
    return new Response('Upstream error', { status: 502 });
  }

  const responseHeaders = new Headers({
    'Content-Type': 'image/jpeg',
    // 5 min browser TTL; 30 day edge TTL.
    'Cache-Control': 'public, max-age=300, s-maxage=2592000',
    'X-Content-Type-Options': 'nosniff',
  });

  // Forward Content-Length if present so browsers can show progress.
  const cl = imgRes.headers.get('Content-Length');
  if (cl) responseHeaders.set('Content-Length', cl);

  const response = new Response(imgRes.body, { status: 200, headers: responseHeaders });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));

  return response;
}

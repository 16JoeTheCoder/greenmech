// Transparent proxy for Firebase Auth's helper pages, so authDomain can be the app's own host.
// Only /__/auth/* is proxied. Responses (including 302s) are returned unchanged.
interface Env {
  FIREBASE_PROJECT_ID: string;
}
const SAFE = new Set(['accept', 'accept-language', 'content-type', 'user-agent', 'x-client-version', 'origin', 'referer']);

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'GET' && request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!/^[a-z0-9-]{4,40}$/.test(env.FIREBASE_PROJECT_ID ?? '') || env.FIREBASE_PROJECT_ID === 'your-firebase-project-id')
    return new Response('FIREBASE_PROJECT_ID is not set', { status: 500 });
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/__/auth/') || /%2e|%2f|\.\./i.test(request.url.slice(url.origin.length))) return new Response('Not found', { status: 404 });
  if (Number(request.headers.get('content-length') ?? 0) > 65536) return new Response('Too large', { status: 413 });
  const target = `https://${env.FIREBASE_PROJECT_ID}.firebaseapp.com${url.pathname}${url.search}`;
  const headers = new Headers();
  for (const [k, v] of request.headers) if (SAFE.has(k.toLowerCase()) || k.toLowerCase().startsWith('x-firebase-')) headers.set(k, v);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    return await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
      signal: ctrl.signal,
    });
  } catch (e) {
    const timedOut = (e as Error).name === 'AbortError';
    return new Response(timedOut ? 'Sign-in helper did not answer in time. Try again.' : 'Could not reach the sign-in helper. Try again.', {
      status: timedOut ? 504 : 502,
    });
  } finally {
    clearTimeout(timer);
  }
};

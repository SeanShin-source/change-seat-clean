import { createServer } from 'node:http';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const COOKIE = '__Host-naver_state';
const TTL = 600;

function httpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Expected an HTTPS URL without credentials, query, or fragment');
  }
  return url;
}

export function createAuthServer(config, { request = fetch, mintToken }) {
  const site = httpsUrl(config.siteOrigin).origin;
  const callback = httpsUrl(config.callbackUrl);
  if (callback.pathname !== '/auth/naver/callback' || !config.clientId || !config.clientSecret ||
      !config.stateSecret || config.stateSecret.length < 32) throw new Error('Missing or invalid OAuth configuration');

  const sign = (value) => createHmac('sha256', config.stateSecret).update(value).digest('base64url');
  const cookie = (state, maxAge) => `${COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

  function validState(state, cookieHeader) {
    if (!state || !/^\d{13}\.[\w-]{24}\.[\w-]{43}$/.test(state)) return false;
    const stored = cookieHeader?.split(/;\s*/).find((item) => item.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    if (stored !== state) return false;
    const [timestamp, random, signature] = state.split('.');
    const age = Date.now() - Number(timestamp);
    return age >= 0 && age <= TTL * 1000 && timingSafeEqual(Buffer.from(signature), Buffer.from(sign(`${timestamp}.${random}`)));
  }

  function finish(response, payload) {
    const nonce = randomBytes(18).toString('base64');
    const message = JSON.stringify({ channel: 'change-seat-naver', ...payload }).replaceAll('<', '\\u003c');
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`,
      'Set-Cookie': cookie('', 0),
    });
    response.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>네이버 로그인</title><p>자리바꾸기 화면으로 돌아가세요.</p><script nonce="${nonce}">if (window.opener) { window.opener.postMessage(${message}, ${JSON.stringify(site)}); window.close(); }</script></html>`);
  }

  async function naverJson(url, options) {
    const response = await request(url, { ...options, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Naver request failed');
    return response.json();
  }

  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    let url;
    try { url = new URL(req.url, callback.origin); }
    catch { res.writeHead(400).end(); return; }
    if (req.method === 'GET' && url.pathname === '/healthz') { res.end('ok'); return; }
    if (req.method === 'GET' && url.pathname === '/auth/naver/start') {
      const value = `${Date.now()}.${randomBytes(18).toString('base64url')}`;
      const state = `${value}.${sign(value)}`;
      const target = new URL('https://nid.naver.com/oauth2.0/authorize');
      target.search = new URLSearchParams({ response_type: 'code', client_id: config.clientId,
        redirect_uri: callback.href, state });
      res.writeHead(302, { Location: target.href, 'Set-Cookie': cookie(state, TTL) }).end();
      return;
    }
    if (req.method !== 'GET' || url.pathname !== callback.pathname) { res.writeHead(404).end(); return; }

    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (!validState(state, req.headers.cookie) || !code || url.searchParams.has('error')) {
      finish(res, { error: true });
      return;
    }
    try {
      const tokens = await naverJson('https://nid.naver.com/oauth2.0/token', {
        method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', code, state,
          client_id: config.clientId, client_secret: config.clientSecret }),
      });
      if (typeof tokens.access_token !== 'string' || !tokens.access_token) throw new Error('Missing access token');
      const profile = await naverJson('https://openapi.naver.com/v1/nid/me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const id = profile.response?.id;
      if (profile.resultcode !== '00' || typeof id !== 'string' || !id) throw new Error('Missing Naver account ID');
      const uid = `naver:${createHash('sha256').update(`${config.clientId}:${id}`).digest('hex')}`;
      finish(res, { token: await mintToken(uid) });
    } catch {
      finish(res, { error: true });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = {
    siteOrigin: process.env.SITE_ORIGIN,
    callbackUrl: process.env.NAVER_CALLBACK_URL,
    clientId: process.env.NAVER_CLIENT_ID,
    clientSecret: process.env.NAVER_CLIENT_SECRET,
    stateSecret: process.env.OAUTH_STATE_SECRET,
  };
  let server;
  if (Object.values(config).every(Boolean) && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const { initializeApp, applicationDefault } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');
    const auth = getAuth(initializeApp({ credential: applicationDefault() }));
    server = createAuthServer(config, { mintToken: (uid) => auth.createCustomToken(uid) });
  } else {
    // Render can provision a stable callback hostname before the Naver app issues credentials.
    server = createServer((req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      if (req.method === 'GET' && req.url === '/healthz') res.end('ok');
      else res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Naver authentication is not configured.');
    });
  }
  server.listen(Number(process.env.PORT || 3000), '0.0.0.0');
}

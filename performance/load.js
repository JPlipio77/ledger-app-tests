/**
 * k6 load test — Auth endpoints
 *
 * Environment variables:
 *   STAGING_URL  Base URL of the backend, e.g. http://server:5000
 *                Defaults to http://localhost:5000
 *
 * Run locally:
 *   k6 run performance/load.js
 *
 * Run against staging:
 *   k6 run -e STAGING_URL=http://your-server:5000 performance/load.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = (__ENV.STAGING_URL || 'http://localhost:5000').replace(/\/$/, '');
const API  = `${BASE}/api`;

// Custom metrics
const loginErrorRate    = new Rate('login_errors');
const registerErrorRate = new Rate('register_errors');
const loginDuration     = new Trend('login_duration_ms', true);

export const options = {
  scenarios: {
    auth_smoke: {
      executor:         'constant-vus',
      vus:              5,
      duration:         '30s',
      gracefulStop:     '5s',
    },
    auth_ramp: {
      executor:         'ramping-vus',
      startVUs:         0,
      stages: [
        { duration: '15s', target: 10 },
        { duration: '30s', target: 10 },
        { duration: '15s', target: 0  },
      ],
      gracefulRampDown: '5s',
      startTime:        '35s',
    },
  },
  thresholds: {
    http_req_failed:    ['rate<0.02'],          // < 2% real errors (4xx on error-case requests excluded via responseCallback)
    http_req_duration:  ['p(95)<5000'],         // p95 under 5 s (staging VPS baseline)
    login_errors:       ['rate<0.02'],          // < 2% login failures
    register_errors:    ['rate<0.02'],          // < 2% register failures
    login_duration_ms:  ['p(95)<6000'],         // login-specific p95 — relaxed for CI cold-start and small VPS
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uniqueUser() {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    email:           `k6_${id}@loadtest.example.com`,
    username:        `k6${id}`.slice(0, 20),   // max 20 chars
    password:        'K6LoadTest1!',
    confirmPassword: 'K6LoadTest1!',
  };
}

function post(path, body) {
  return http.post(`${API}${path}`, JSON.stringify(body), { headers: JSON_HEADERS });
}

function get(path, jar) {
  return http.get(`${API}${path}`, { headers: JSON_HEADERS, jar });
}

// ---------------------------------------------------------------------------
// Main VU script
// ---------------------------------------------------------------------------

export default function () {
  const user = uniqueUser();
  const jar  = http.cookieJar();

  // ── Register ────────────────────────────────────────────────────────────
  group('register', () => {
    const res = post('/auth/register', user);
    const ok  = check(res, {
      'register 201': (r) => r.status === 201,
      'register returns user': (r) => {
        try { return JSON.parse(r.body).data.email !== undefined; }
        catch { return false; }
      },
      'register no password leak': (r) => {
        try { return JSON.parse(r.body).data.password === undefined; }
        catch { return false; }
      },
    });
    registerErrorRate.add(!ok);
  });

  sleep(0.3);

  // ── Login by email ───────────────────────────────────────────────────────
  group('login_by_email', () => {
    const start = Date.now();
    const res   = http.post(
      `${API}/auth/login`,
      JSON.stringify({ identifier: user.email, password: user.password }),
      { headers: JSON_HEADERS, jar },
    );
    loginDuration.add(Date.now() - start);

    const ok = check(res, {
      'login 200': (r) => r.status === 200,
      'login returns email': (r) => {
        try { return JSON.parse(r.body).data.email === user.email.toLowerCase(); }
        catch { return false; }
      },
    });
    loginErrorRate.add(!ok);
  });

  sleep(0.2);

  // ── Access protected route ───────────────────────────────────────────────
  group('get_me', () => {
    const res = http.get(`${API}/auth/me`, { headers: JSON_HEADERS, jar });
    check(res, {
      '/me 200 when authenticated': (r) => r.status === 200,
      '/me returns username': (r) => {
        try { return JSON.parse(r.body).data.username !== undefined; }
        catch { return false; }
      },
    });
  });

  sleep(0.2);

  // ── Login by username ────────────────────────────────────────────────────
  group('login_by_username', () => {
    // Logout first so we can log back in by username
    http.post(`${API}/auth/logout`, null, { jar });

    const res = http.post(
      `${API}/auth/login`,
      JSON.stringify({ identifier: user.username, password: user.password }),
      { headers: JSON_HEADERS, jar },
    );
    check(res, {
      'username login 200': (r) => r.status === 200,
    });
  });

  sleep(0.2);

  // ── Logout ───────────────────────────────────────────────────────────────
  group('logout', () => {
    const res = http.post(`${API}/auth/logout`, null, { jar });
    check(res, { 'logout 200': (r) => r.status === 200 });
  });

  sleep(0.2);

  // ── Verify session ended ─────────────────────────────────────────────────
  group('me_after_logout', () => {
    const res = http.get(`${API}/auth/me`, {
      headers: JSON_HEADERS,
      jar,
      responseCallback: http.expectedStatuses(401), // 401 is expected here; don't count it as http_req_failed
    });
    check(res, { '/me 401 after logout': (r) => r.status === 401 });
  });

  sleep(0.5);
}

// ---------------------------------------------------------------------------
// Error cases — sanity checks run once per VU at setup
// ---------------------------------------------------------------------------

export function setup() {
  // Wrong password → 401 (expected; excluded from http_req_failed)
  const wrongPw = http.post(
    `${API}/auth/login`,
    JSON.stringify({ identifier: 'nobody@example.com', password: 'wrong' }),
    { headers: JSON_HEADERS, responseCallback: http.expectedStatuses(401) },
  );
  check(wrongPw, { 'wrong-password returns 401': (r) => r.status === 401 });

  // Register missing username → 400 (expected; excluded from http_req_failed)
  const missingUser = http.post(
    `${API}/auth/register`,
    JSON.stringify({ email: 'missing-username@example.com', password: 'TestPass123!', confirmPassword: 'TestPass123!' }),
    { headers: JSON_HEADERS, responseCallback: http.expectedStatuses(400) },
  );
  check(missingUser, { 'missing-username returns 400': (r) => r.status === 400 });
}

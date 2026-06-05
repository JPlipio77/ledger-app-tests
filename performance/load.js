import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

export default function () {
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health check status 200': (r) => r.status === 200,
    'health check fast':       (r) => r.timings.duration < 500,
  });
  sleep(1);
}

# ledger-app-tests

Companion test repository for [PersonalFinanceLedgerApp](https://github.com/JPlipio77/PersonalFinanceLedgerApp). Triggered automatically via `repository_dispatch` whenever a build is pushed to `main`.

## Pipeline

The workflow (`.github/workflows/test-pipeline.yml`) runs 4 stages in a single job against a fresh Docker stack spun up from GHCR images:

| Stage | Tool | Location | What it tests |
|---|---|---|---|
| 1 — Contract | Newman (Postman) | `contract/` | API contract for every endpoint |
| 2 — E2E | Playwright | `e2e/tests/` | Browser smoke test against the frontend |
| 3 — Performance | k6 | `performance/load.js` | 10 VUs × 30s load on `/health` |
| 4 — Security | OWASP ZAP | auto | Passive baseline DAST scan |

All stages use `continue-on-error: true` so a failure in one stage doesn't block later stages. The job fails at the end if any stage failed (`Propagate failures` step).

An HTML pipeline report is uploaded as artifact `pipeline-report-<run_number>` on every run.

## Trigger

Automatically dispatched from `PersonalFinanceLedgerApp/.github/workflows/deploy.yml` after a successful image push:

```yaml
await github.rest.repos.createDispatchEvent({
  owner: context.repo.owner,
  repo:  'ledger-app-tests',
  event_type: 'app-deployed',
  client_payload: { sha, image_tag, image_base, triggered_by, source_run_url }
});
```

Manual trigger:
```bash
gh workflow run test-pipeline.yml --repo JPlipio77/ledger-app-tests \
  --field image_tag=<sha>
```

## Required secrets

Set on this repo via `gh secret set`:

| Secret | Value |
|---|---|
| `JWT_SECRET` | Same value used in staging `.env` |

`GITHUB_TOKEN` is injected automatically — no manual setup needed for GHCR pull.

## Directory structure

```
ledger-app-tests/
├── .github/workflows/
│   └── test-pipeline.yml      ← 4-stage pipeline
├── .zap/
│   └── rules.tsv              ← ZAP alert suppressions
├── contract/                  ← Newman collections (add here)
│   └── *.collection.json
├── e2e/
│   ├── package.json
│   ├── playwright.config.ts
│   └── tests/
│       └── smoke.spec.ts      ← Login page smoke test
├── infra/
│   └── docker-compose.yml     ← Pulls GHCR images; starts mongo + backend + frontend
├── performance/
│   └── load.js                ← k6 script: 10 VUs, 30s, GET /health
└── generate-report.js         ← Aggregates stage results into HTML
```

## Running locally

```bash
# 1. Export secrets
export JWT_SECRET="<your-jwt-secret>"
export IMAGE_TAG="latest"
export IMAGE_OWNER="jplipio77"

# 2. Start the stack
docker compose -f infra/docker-compose.yml up -d

# 3. Wait for backend (port 5000)
until curl -sf http://localhost:5000/health; do sleep 2; done

# 4. Run Newman (Stage 1)
npm install -g newman newman-reporter-htmlextra
newman run contract/<collection>.collection.json --env-var baseUrl=http://localhost:5000

# 5. Run Playwright (Stage 2)
npm ci --prefix e2e
npx --prefix e2e playwright install chromium
BASE_URL=http://localhost:3000 npx --prefix e2e playwright test

# 6. Run k6 (Stage 3)
k6 run --env BASE_URL=http://localhost:5000 performance/load.js

# 7. Tear down
docker compose -f infra/docker-compose.yml down
```

## Adding contract tests

Drop a Newman collection into `contract/` and reference it in the pipeline's `Contract Tests (Newman)` step:

```bash
newman run contract/my-new-api.collection.json \
  --env-var baseUrl=http://localhost:5000 \
  --reporters cli,htmlextra \
  --reporter-htmlextra-export reports/contract/my-new-api-report.html
```

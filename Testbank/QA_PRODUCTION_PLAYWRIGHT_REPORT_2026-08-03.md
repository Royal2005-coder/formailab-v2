# AI LAB Production Playwright QA Report

## Execution Summary

| Field             | Result                                                                    |
| ----------------- | ------------------------------------------------------------------------- |
| Environment       | `https://formailab.royalai.dev`                                           |
| Execution time    | 2026-08-03 11:14 UTC                                                      |
| Browser           | Playwright Chromium 1.58.2                                                |
| Runtime image     | `mcr.microsoft.com/playwright:v1.58.2-noble`                              |
| Application image | `sha256:0c5b17895eb1d28622150a00dd0cb08cf19b6d0e5d23e653a9ec918b2e898dc9` |
| Result            | **PASS**                                                                  |
| Tests             | **6 passed / 0 failed / 0 skipped**                                       |
| Duration          | 19.3 seconds                                                              |

## Covered Production Journeys

| Test                           | Evidence                                                           | Result |
| ------------------------------ | ------------------------------------------------------------------ | ------ |
| Health and dependency checks   | `/health`, `/api/v2/health`, JSON attachment                       | PASS   |
| Authentication guard           | Unauthenticated AI LAB route redirects to Login                    | PASS   |
| Excel template download        | HTTP 200, XLSX `PK` signature, file larger than 100 KiB            | PASS   |
| Full CSV validation and commit | 112 groups, 508 questions, zero diagnostics, draft editor redirect | PASS   |
| Desktop and mobile rendering   | Full-page screenshots, videos and traces                           | PASS   |
| Consent decline routing        | `CONSENT=N` displays terminal thank-you and hides BANK             | PASS   |

## Import Test Isolation

The mutation test creates a uniquely named QA user, organization and workspace. It validates and commits the full CSV, captures evidence, then deletes the organization and user in a `finally` cleanup block.

Post-run database verification:

```text
0 Playwright production QA users
0 Playwright production QA organizations
```

## Evidence Index

- HTML report: `playwright-report/production/index.html`
- JUnit report: `test-results/production/junit.xml`
- Machine-readable JSON: `test-results/production/results.json`
- Per-test traces: `test-results/production/*/trace.zip`
- Per-test videos: `test-results/production/*/video.webm`
- Automatic screenshots: `test-results/production/*/test-finished-1.png`
- Validation screenshot attachment: embedded in HTML/JSON report as `full-csv-validation.png`
- Commit screenshot attachment: embedded in HTML/JSON report as `committed-formbricks-draft.png`
- Route screenshot attachment: embedded as `consent-decline-terminal-route.png`

## Reproduction

Read-only smoke execution:

```bash
PLAYWRIGHT_PRODUCTION_WORKSPACE_ID=cms8us0sz000201p600hllctp \
PLAYWRIGHT_PRODUCTION_SURVEY_ID=cmscxr1yo000801mokukwl33f \
scripts/run-ai-lab-production-playwright.sh
```

Controlled import/commit execution with automatic cleanup:

```bash
PLAYWRIGHT_PRODUCTION_WORKSPACE_ID=cms8us0sz000201p600hllctp \
PLAYWRIGHT_PRODUCTION_SURVEY_ID=cmscxr1yo000801mokukwl33f \
PLAYWRIGHT_PRODUCTION_MUTATION=1 \
scripts/run-ai-lab-production-playwright.sh
```

## Supporting Non-Browser Coverage

- Survey compiler: 196 tests passed.
- Survey runtime: 677 tests passed.
- Workbook formula and route oracle: 99 tests passed.
- AI LAB web action tests: 43 tests passed.
- Compiler and survey package typechecks passed.

## Notes

- The production mutation suite is opt-in and serial by design.
- The production config rejects every host except `https://formailab.royalai.dev`.
- Traces and videos may contain QA-only IDs but no persistent QA account remains after cleanup.

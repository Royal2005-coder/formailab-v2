#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${PLAYWRIGHT_PRODUCTION_BASE_URL:-https://formailab.royalai.dev}"
WORKSPACE_ID="${PLAYWRIGHT_PRODUCTION_WORKSPACE_ID:?Set PLAYWRIGHT_PRODUCTION_WORKSPACE_ID}"
SURVEY_ID="${PLAYWRIGHT_PRODUCTION_SURVEY_ID:?Set PLAYWRIGHT_PRODUCTION_SURVEY_ID}"
MUTATION="${PLAYWRIGHT_PRODUCTION_MUTATION:-0}"
FULL_ROUTES="${PLAYWRIGHT_PRODUCTION_FULL_ROUTES:-0}"
SYSTEM_CASES="${PLAYWRIGHT_PRODUCTION_SYSTEM_CASES:-0}"
APP_CONTAINER="${PLAYWRIGHT_PRODUCTION_APP_CONTAINER:-formbricks-ai-lab-staging}"
PLAYWRIGHT_IMAGE="${PLAYWRIGHT_PRODUCTION_IMAGE:-mcr.microsoft.com/playwright:v1.58.2-noble}"
WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

pnpm --filter @formbricks/survey-compiler build

docker_args=(
  --rm
  --ipc=host
  --user "$(id -u):$(id -g)"
  -e HOME=/tmp
  -e "PLAYWRIGHT_PRODUCTION_BASE_URL=${BASE_URL}"
  -e "PLAYWRIGHT_PRODUCTION_WORKSPACE_ID=${WORKSPACE_ID}"
  -e "PLAYWRIGHT_PRODUCTION_SURVEY_ID=${SURVEY_ID}"
  -e "PLAYWRIGHT_PRODUCTION_MUTATION=${MUTATION}"
  -e "PLAYWRIGHT_PRODUCTION_FULL_ROUTES=${FULL_ROUTES}"
  -e "PLAYWRIGHT_PRODUCTION_SYSTEM_CASES=${SYSTEM_CASES}"
  -v "${WORKSPACE_ROOT}:/work"
  -w /work
)

if [[ "${MUTATION}" == "1" ]]; then
  database_url="$({
    docker inspect "${APP_CONTAINER}" --format '{{json .Config.Env}}' |
      node -e 'let input=""; process.stdin.on("data", (chunk) => input += chunk).on("end", () => { const entry = JSON.parse(input).find((value) => value.startsWith("DATABASE_URL=")); if (!entry) process.exit(1); process.stdout.write(entry.slice(13)); });'
  })"
  docker_args+=(--network formbricks-production -e "DATABASE_URL=${database_url}")
fi

docker run "${docker_args[@]}" "${PLAYWRIGHT_IMAGE}" \
  node_modules/.bin/playwright test --config=playwright.production.config.ts "$@"

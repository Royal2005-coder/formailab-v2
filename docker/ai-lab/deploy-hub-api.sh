#!/bin/bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

CONTAINER_NAME="${HUB_API_CONTAINER_NAME:-formbricks-hub}"
HUB_IMAGE="${HUB_IMAGE:-ghcr.io/formbricks/hub:latest}"

docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true
docker run -d \
  --name "$CONTAINER_NAME" \
  --network formbricks-production \
  --user app \
  --env-file "$ENV_FILE" \
  -e TAXONOMY_SERVICE_URL="${TAXONOMY_SERVICE_URL:-http://formbricks-taxonomy:8000}" \
  -e TAXONOMY_SERVICE_TOKEN="${TAXONOMY_SERVICE_TOKEN:-$HUB_API_KEY}" \
  -e HUB_INTERNAL_API_TOKEN="${HUB_INTERNAL_API_TOKEN:-$HUB_API_KEY}" \
  -e TAXONOMY_MIN_EMBEDDED_RECORDS="${TAXONOMY_MIN_EMBEDDED_RECORDS:-250}" \
  -e SENTIMENT_PROVIDER="${SENTIMENT_PROVIDER:-google}" \
  -e SENTIMENT_MODEL="${SENTIMENT_MODEL:-gemini-2.5-flash}" \
  -e SENTIMENT_PROVIDER_API_KEY="${SENTIMENT_PROVIDER_API_KEY:-${GEMINI_API_KEY:-}}" \
  -e EMOTIONS_PROVIDER="${EMOTIONS_PROVIDER:-google}" \
  -e EMOTIONS_MODEL="${EMOTIONS_MODEL:-gemini-2.5-flash}" \
  -e EMOTIONS_PROVIDER_API_KEY="${EMOTIONS_PROVIDER_API_KEY:-${GEMINI_API_KEY:-}}" \
  --restart unless-stopped \
  --entrypoint sh \
  --health-cmd 'wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1' \
  --health-interval 30s --health-timeout 5s --health-start-period 10s --health-retries 3 \
  "$HUB_IMAGE" \
  -c 'API_KEY="$HUB_API_KEY" DATABASE_URL="$HUB_DATABASE_URL" exec /app/hub-api'

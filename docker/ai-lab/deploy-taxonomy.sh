#!/bin/bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

CONTAINER_NAME="${TAXONOMY_CONTAINER_NAME:-formbricks-taxonomy}"
TAXONOMY_IMAGE="${TAXONOMY_IMAGE:-ghcr.io/formbricks/taxonomy:latest}"

docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true
docker run -d \
  --name "$CONTAINER_NAME" \
  --network formbricks-production \
  -e APP_ENV=production \
  -e TAXONOMY_SERVICE_TOKEN="${TAXONOMY_SERVICE_TOKEN:-$HUB_API_KEY}" \
  -e HUB_INTERNAL_API_URL="${HUB_INTERNAL_API_URL:-http://formbricks-hub:8080}" \
  -e HUB_INTERNAL_API_TOKEN="${HUB_INTERNAL_API_TOKEN:-$HUB_API_KEY}" \
  -e TAXONOMY_LLM_PROVIDER="${TAXONOMY_LLM_PROVIDER:-openai-compatible}" \
  -e TAXONOMY_LLM_MODEL="${TAXONOMY_LLM_MODEL:-gemini-2.5-flash}" \
  -e TAXONOMY_LLM_BASE_URL="${TAXONOMY_LLM_BASE_URL:-https://generativelanguage.googleapis.com/v1beta/openai}" \
  -e TAXONOMY_LLM_API_KEY="${TAXONOMY_LLM_API_KEY:-$GEMINI_API_KEY}" \
  --restart unless-stopped \
  --no-healthcheck \
  "$TAXONOMY_IMAGE"

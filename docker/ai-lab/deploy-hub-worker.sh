#!/bin/bash
set -e

# Formbricks Hub background worker (River job consumer).
#
# The Hub API (formbricks-hub) only ENQUEUES jobs — most importantly the
# `feedback_embedding` jobs that populate the `embeddings` table. Without a
# worker consuming the `embeddings` River queue those jobs sit in `river_job`
# with state='available' forever, `embedding_count` stays 0 for every taxonomy
# field, and Topics & Subtopics is stuck behind the "Preparing your feedback"
# gate no matter how many feedback records exist.
#
# Keep this container on the SAME image tag as formbricks-hub — they share one
# image and drift breaks migrations or job processing (see docker-compose.dev.yml).

ENV_FILE="${ENV_FILE:-.env}"
if [ -f "$ENV_FILE" ]; then
  echo "=== Loading environment variables from $ENV_FILE ==="
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

HUB_IMAGE="${HUB_IMAGE:-ghcr.io/formbricks/hub:latest}"
HUB_NETWORK="${HUB_NETWORK:-formbricks-production}"
CONTAINER_NAME="${HUB_WORKER_CONTAINER_NAME:-formbricks-hub-worker}"

echo "=== Stopping and removing old worker container ==="
docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true

echo "=== Launching $CONTAINER_NAME (image: $HUB_IMAGE) ==="
docker run -d \
  --name "$CONTAINER_NAME" \
  --network "$HUB_NETWORK" \
  --restart always \
  --no-healthcheck \
  --entrypoint sh \
  -e HUB_API_KEY="${HUB_API_KEY:-YOUR_HUB_API_KEY}" \
  -e HUB_DATABASE_URL="${HUB_DATABASE_URL:-postgresql://postgres:YOUR_POSTGRES_PASSWORD@formbricks-postgres:5432/formbricks?sslmode=disable}" \
  -e REDIS_URL="${REDIS_URL:-redis://formbricks-valkey:6379}" \
  -e AI_PROVIDER="${AI_PROVIDER:-google}" \
  -e AI_MODEL="${AI_MODEL:-gemini-2.5-flash}" \
  -e AI_OPENAI_COMPATIBLE_BASE_URL="${AI_OPENAI_COMPATIBLE_BASE_URL:-}" \
  -e AI_OPENAI_COMPATIBLE_PROVIDER_NAME="${AI_OPENAI_COMPATIBLE_PROVIDER_NAME:-}" \
  -e AI_OPENAI_COMPATIBLE_SUPPORTS_STRUCTURED_OUTPUTS="${AI_OPENAI_COMPATIBLE_SUPPORTS_STRUCTURED_OUTPUTS:-}" \
  -e AI_OPENAI_COMPATIBLE_API_KEY="${AI_OPENAI_COMPATIBLE_API_KEY:-}" \
  -e AI_GOOGLE_API_KEY="${AI_GOOGLE_API_KEY:-${GEMINI_API_KEY:-}}" \
  -e GEMINI_API_KEY="${GEMINI_API_KEY:-}" \
  -e EMBEDDING_PROVIDER="${EMBEDDING_PROVIDER:-google}" \
  -e EMBEDDING_MODEL="${EMBEDDING_MODEL:-gemini-embedding-001}" \
  -e TAXONOMY_EMBEDDING_MODEL="${TAXONOMY_EMBEDDING_MODEL:-${EMBEDDING_MODEL:-gemini-embedding-001}}" \
  -e EMBEDDING_PROVIDER_API_KEY="${EMBEDDING_PROVIDER_API_KEY:-${GEMINI_API_KEY:-}}" \
  -e SENTIMENT_PROVIDER="${SENTIMENT_PROVIDER:-google}" \
  -e SENTIMENT_MODEL="${SENTIMENT_MODEL:-gemini-2.5-flash}" \
  -e SENTIMENT_PROVIDER_API_KEY="${SENTIMENT_PROVIDER_API_KEY:-${GEMINI_API_KEY:-}}" \
  -e EMOTIONS_PROVIDER="${EMOTIONS_PROVIDER:-google}" \
  -e EMOTIONS_MODEL="${EMOTIONS_MODEL:-gemini-2.5-flash}" \
  -e EMOTIONS_PROVIDER_API_KEY="${EMOTIONS_PROVIDER_API_KEY:-${GEMINI_API_KEY:-}}" \
  -e TELEMETRY_DISABLED="1" \
  "$HUB_IMAGE" \
  -c 'API_KEY="$HUB_API_KEY" DATABASE_URL="$HUB_DATABASE_URL" exec /app/hub-worker'

echo "=== Worker started. Recent logs: ==="
sleep 3
docker logs "$CONTAINER_NAME" --tail 20

cat <<'EOS'

=== Verify embedding backlog is draining ===
  docker exec formbricks-postgres psql -U postgres -d formbricks \
    -c "select kind, state, count(*) from river_job group by 1,2;" \
    -c "select count(*) from embeddings;"
EOS

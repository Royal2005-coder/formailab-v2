#!/bin/bash
set -e

# Load environment variables from .env if present
ENV_FILE="${ENV_FILE:-.env}"
if [ -f "$ENV_FILE" ]; then
  echo "=== Loading environment variables from $ENV_FILE ==="
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

echo "=== Stopping and removing old container ==="
docker stop formbricks-ai-lab-staging || true
docker rm formbricks-ai-lab-staging || true

echo "=== Launching updated container ==="
docker run -d \
  --name formbricks-ai-lab-staging \
  --network formbricks-production \
  -p 127.0.0.1:3103:3000 \
  -v formbricks-ai-lab-staging-uploads:/home/nextjs/apps/web/uploads \
  -v formbricks-ai-lab-staging-saml:/home/nextjs/apps/web/saml-connection \
  -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-YOUR_POSTGRES_PASSWORD}" \
  -e POSTGRES_DB="${POSTGRES_DB:-formbricks}" \
  -e WEBAPP_URL="${WEBAPP_URL:-https://formailab.royalai.dev}" \
  -e NEXTAUTH_URL="${NEXTAUTH_URL:-https://formailab.royalai.dev}" \
  -e BETTER_AUTH_URL="${BETTER_AUTH_URL:-https://formailab.royalai.dev}" \
  -e DATABASE_URL="${DATABASE_URL:-postgresql://postgres:YOUR_POSTGRES_PASSWORD@formbricks-postgres:5432/formbricks_ai_lab_staging?schema=public}" \
  -e HUB_DATABASE_URL="${HUB_DATABASE_URL:-postgresql://postgres:YOUR_POSTGRES_PASSWORD@formbricks-postgres:5432/formbricks?sslmode=disable}" \
  -e REDIS_URL="${REDIS_URL:-redis://formbricks-valkey:6379}" \
  -e NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-YOUR_NEXTAUTH_SECRET}" \
  -e ENCRYPTION_KEY="${ENCRYPTION_KEY:-YOUR_ENCRYPTION_KEY}" \
  -e CRON_SECRET="${CRON_SECRET:-YOUR_CRON_SECRET}" \
  -e HUB_API_KEY="${HUB_API_KEY:-YOUR_HUB_API_KEY}" \
  -e HUB_API_URL="${HUB_API_URL:-http://formbricks-hub:8080}" \
  -e CUBEJS_API_URL="${CUBEJS_API_URL:-http://formbricks-cube:4000}" \
  -e CUBEJS_API_SECRET="${CUBEJS_API_SECRET:-YOUR_CUBEJS_API_SECRET}" \
  -e CUBEJS_JWT_ISSUER="formbricks-web" \
  -e CUBEJS_JWT_AUDIENCE="formbricks-cube" \
  -e EMAIL_VERIFICATION_DISABLED="0" \
  -e PASSWORD_RESET_DISABLED="0" \
  -e AUTH_SKIP_INVITE_FOR_SSO="1" \
  -e AUDIT_LOG_ENABLED="1" \
  -e AUDIT_LOG_GET_USER_IP="1" \
  -e TELEMETRY_DISABLED="1" \
  -e SMTP_HOST="${SMTP_HOST:-smtp.gmail.com}" \
  -e SMTP_PORT="${SMTP_PORT:-587}" \
  -e SMTP_USER="${SMTP_USER:-YOUR_SMTP_USER}" \
  -e SMTP_PASSWORD="${SMTP_PASSWORD:-YOUR_SMTP_PASSWORD}" \
  -e MAIL_FROM="${MAIL_FROM:-uelailab@gmail.com}" \
  -e MAIL_FROM_NAME="${MAIL_FROM_NAME:-AILAB Survey}" \
  -e SMTP_AUTHENTICATED="1" \
  -e SMTP_SECURE_ENABLED="0" \
  -e GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-YOUR_GOOGLE_CLIENT_ID}" \
  -e GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-YOUR_GOOGLE_CLIENT_SECRET}" \
  -e AI_PROVIDER="${AI_PROVIDER:-google}" \
  -e AI_MODEL="${AI_MODEL:-gemini-2.5-flash}" \
  -e GEMINI_API_KEY="${GEMINI_API_KEY:-YOUR_GEMINI_API_KEY}" \
  -e AI_GOOGLE_API_KEY="${AI_GOOGLE_API_KEY:-YOUR_GEMINI_API_KEY}" \
  -e EMBEDDING_PROVIDER="${EMBEDDING_PROVIDER:-google}" \
  -e EMBEDDING_MODEL="${EMBEDDING_MODEL:-text-embedding-004}" \
  -e EMBEDDING_PROVIDER_API_KEY="${EMBEDDING_PROVIDER_API_KEY:-YOUR_GEMINI_API_KEY}" \
  -e ENTERPRISE_LICENSE_KEY="${ENTERPRISE_LICENSE_KEY:-ailab-selfhosted-unlocked-key}" \
  -e S3_ACCESS_KEY="survey" \
  -e S3_SECRET_KEY="survey-local-minio-only" \
  -e S3_REGION="us-east-1" \
  -e S3_ENDPOINT_URL="http://surveyops-minio:9000" \
  -e S3_FORCE_PATH_STYLE="1" \
  -e S3_BUCKET_NAME="formbricks-uploads" \
  -e S3_PUBLIC_URL="https://formailab.royalai.dev/upload" \
  --restart always \
  formbricks-ai-lab:staging-latest

echo "=== Deployment finished successfully! ==="

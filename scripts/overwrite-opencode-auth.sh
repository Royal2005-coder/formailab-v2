#!/bin/sh

set -eu

auth_file="${OPENCODE_AUTH_FILE:-$HOME/.local/share/opencode/auth.json}"
auth_dir=$(dirname "$auth_file")
input_file=${1:-/dev/stdin}

if [ "$input_file" != "/dev/stdin" ] && [ ! -f "$input_file" ]; then
  printf 'Input file not found: %s\n' "$input_file" >&2
  exit 1
fi

mkdir -p "$auth_dir"
temp_file=$(mktemp "$auth_dir/.auth.json.XXXXXX")
trap 'rm -f "$temp_file"' EXIT HUP INT TERM

if ! jq -e '
  type == "object" and
  (.openai | type == "object") and
  (.openai.type == "oauth") and
  (.openai.refresh | type == "string" and length > 0) and
  (.openai.access | type == "string" and length > 0) and
  (.openai.expires | type == "number") and
  (.openai.accountId | type == "string" and length > 0)
' "$input_file" > "$temp_file"; then
  printf 'Invalid OpenCode OpenAI OAuth JSON. auth.json was not changed.\n' >&2
  exit 1
fi

chmod 600 "$temp_file"
mv "$temp_file" "$auth_file"
trap - EXIT HUP INT TERM

printf 'Updated %s\nRestart OpenCode to use the new credentials.\n' "$auth_file"

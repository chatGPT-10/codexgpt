#!/usr/bin/env bash
set -euo pipefail
output_path="${1:?OUTPUT_PATH_REQUIRED}"
printf '%s' 'git-bash-ok' > "$output_path"

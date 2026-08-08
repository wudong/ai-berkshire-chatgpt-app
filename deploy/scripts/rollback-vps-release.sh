#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

root_dir=/opt/ai-berkshire-mcp
current_link=$root_dir/current
previous_link=$root_dir/previous

[[ -L "$current_link" ]] || { echo "No current release" >&2; exit 1; }
[[ -L "$previous_link" ]] || { echo "No previous release available" >&2; exit 1; }

current_release=$(readlink -f "$current_link")
previous_release=$(readlink -f "$previous_link")
[[ -d "$previous_release" ]] || { echo "Previous release directory is missing" >&2; exit 1; }

ln -sfn "$previous_release" "$root_dir/current.rollback"
mv -Tf "$root_dir/current.rollback" "$current_link"
ln -sfn "$current_release" "$previous_link"
systemctl restart ai-berkshire-mcp.service
curl --fail --silent --show-error --retry 10 --retry-delay 2 http://127.0.0.1:3020/healthz >/dev/null

echo "Rolled back to $(basename "$previous_release")"

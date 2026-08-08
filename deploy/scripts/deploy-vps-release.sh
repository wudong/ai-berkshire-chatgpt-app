#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi
if [[ $# -ne 2 ]]; then
  echo "Usage: $0 /opt/ai-berkshire-mcp/releases/<sha> <commit-sha>" >&2
  exit 2
fi

release_dir=$(readlink -f "$1")
commit_sha=$2
root_dir=/opt/ai-berkshire-mcp
current_link=$root_dir/current
previous_link=$root_dir/previous
bun_bin=${BUN_BIN:-/usr/local/bin/bun}

if [[ "$release_dir" != "$root_dir"/releases/* || ! -d "$release_dir" ]]; then
  echo "Release must exist under $root_dir/releases" >&2
  exit 1
fi
[[ -x "$bun_bin" ]] || { echo "Bun is missing at $bun_bin" >&2; exit 1; }
[[ -f "$release_dir/package.json" ]] || { echo "Release is missing package.json" >&2; exit 1; }
[[ -f "$release_dir/bun.lock" ]] || { echo "Release is missing bun.lock" >&2; exit 1; }
[[ -f "$release_dir/web/dist/widget.js" ]] || { echo "Release is missing built widget" >&2; exit 1; }

current_release=""
if [[ -L "$current_link" ]]; then
  current_release=$(readlink -f "$current_link")
fi

cd "$release_dir"
"$bun_bin" install --frozen-lockfile --production
chown -R ai-berkshire-mcp:ai-berkshire-mcp "$release_dir"
chmod -R u+rwX,go-rwx "$release_dir"

sudo -u ai-berkshire-mcp bash -c '
  set -a
  source /etc/ai-berkshire-mcp/app.env
  set +a
  cd "$1"
  exec /usr/local/bin/bun run auth:migrate
' _ "$release_dir"

cat > "$release_dir/.release-metadata" <<EOF_METADATA
commit_sha=$commit_sha
deployed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
runtime=bun-$($bun_bin --version)
EOF_METADATA
chown ai-berkshire-mcp:ai-berkshire-mcp "$release_dir/.release-metadata"
chmod 0640 "$release_dir/.release-metadata"

if [[ -n "$current_release" && "$current_release" != "$release_dir" ]]; then
  ln -sfn "$current_release" "$previous_link"
fi
ln -sfn "$release_dir" "$root_dir/current.new"
mv -Tf "$root_dir/current.new" "$current_link"

systemctl restart ai-berkshire-mcp.service
if ! curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 2 http://127.0.0.1:3020/healthz >/dev/null; then
  echo "New release failed health check; restoring previous release" >&2
  if [[ -n "$current_release" && -d "$current_release" ]]; then
    ln -sfn "$current_release" "$root_dir/current.rollback"
    mv -Tf "$root_dir/current.rollback" "$current_link"
    systemctl restart ai-berkshire-mcp.service
    curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 2 http://127.0.0.1:3020/healthz >/dev/null
  else
    systemctl stop ai-berkshire-mcp.service || true
  fi
  exit 1
fi

touch "$release_dir/.deployed-ok"
chown ai-berkshire-mcp:ai-berkshire-mcp "$release_dir/.deployed-ok"

current_real=$(readlink -f "$current_link")
previous_real=""
if [[ -L "$previous_link" ]]; then
  previous_real=$(readlink -f "$previous_link")
fi
mapfile -t release_dirs < <(find "$root_dir/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | awk '{print $2}')
kept=0
for candidate in "${release_dirs[@]}"; do
  candidate_real=$(readlink -f "$candidate")
  if [[ "$candidate_real" == "$current_real" || "$candidate_real" == "$previous_real" ]]; then
    continue
  fi
  kept=$((kept + 1))
  if (( kept > 5 )); then
    rm -rf -- "$candidate_real"
  fi
done

echo "Activated AI Berkshire MCP release $commit_sha"

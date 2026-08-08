#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi
if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /opt/ai-berkshire-mcp/releases/<sha>" >&2
  exit 2
fi

release_dir=$(readlink -f "$1")
root_dir=/opt/ai-berkshire-mcp
config_dir=/etc/ai-berkshire-mcp
state_dir=/var/lib/ai-berkshire-mcp

if [[ "$release_dir" != "$root_dir"/releases/* || ! -d "$release_dir" ]]; then
  echo "Release must exist under $root_dir/releases" >&2
  exit 1
fi

required_b64=(
  BERKSHIRE_GOOGLE_CLIENT_ID_B64
  BERKSHIRE_GOOGLE_CLIENT_SECRET_B64
  BERKSHIRE_BETTER_AUTH_SECRET_B64
  BERKSHIRE_ALLOWED_GOOGLE_EMAIL_B64
  BERKSHIRE_DATABASE_PASSWORD_B64
  BERKSHIRE_MCP_HOSTNAME_B64
)
for name in "${required_b64[@]}"; do
  [[ -n "${!name:-}" ]] || { echo "Missing required environment value: $name" >&2; exit 1; }
done

if ! id -u ai-berkshire-mcp >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$state_dir" --shell /usr/sbin/nologin ai-berkshire-mcp
fi
install -d -o root -g root -m 0755 "$root_dir" "$root_dir/releases"
install -d -o root -g ai-berkshire-mcp -m 0750 "$config_dir"
install -d -o ai-berkshire-mcp -g ai-berkshire-mcp -m 0750 "$state_dir"

secret_file=$(mktemp)
trap 'rm -f "$secret_file"' EXIT
printf '%s' "$BERKSHIRE_DATABASE_PASSWORD_B64" | base64 -d > "$secret_file"
db_password=$(cat "$secret_file")
[[ -n "$db_password" ]] || { echo "Database password decoded to an empty value" >&2; exit 1; }

sudo -u postgres psql --set=ON_ERROR_STOP=1 --set=db_password="$db_password" <<'SQL'
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_berkshire_mcp') THEN
    CREATE ROLE ai_berkshire_mcp LOGIN;
  END IF;
END
$do$;
ALTER ROLE ai_berkshire_mcp PASSWORD :'db_password';
SELECT 'CREATE DATABASE ai_berkshire_mcp OWNER ai_berkshire_mcp'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'ai_berkshire_mcp')\gexec
ALTER DATABASE ai_berkshire_mcp OWNER TO ai_berkshire_mcp;
SQL

export BERKSHIRE_CONFIG_DIR="$config_dir"
python3 <<'PY'
import base64
import os
from pathlib import Path
from urllib.parse import quote

config_dir = Path(os.environ["BERKSHIRE_CONFIG_DIR"])

def decode(name: str, required: bool = True) -> str:
    raw = os.environ.get(name, "")
    if not raw and not required:
        return ""
    if not raw:
        raise SystemExit(f"missing {name}")
    return base64.b64decode(raw).decode("utf-8")

def systemd_quote(value: str) -> str:
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n') + '"'

password = decode("BERKSHIRE_DATABASE_PASSWORD_B64")
hostname = decode("BERKSHIRE_MCP_HOSTNAME_B64").strip().lower()
if not hostname or '/' in hostname or ':' in hostname:
    raise SystemExit("BERKSHIRE_MCP_HOSTNAME must be a bare DNS hostname")
base_url = f"https://{hostname}"
values = {
    "PORT": "3020",
    "BETTER_AUTH_URL": base_url,
    "MCP_RESOURCE_URL": f"{base_url}/mcp",
    "DATABASE_URL": f"postgresql://ai_berkshire_mcp:{quote(password, safe='')}@127.0.0.1:5432/ai_berkshire_mcp",
    "BETTER_AUTH_SECRET": decode("BERKSHIRE_BETTER_AUTH_SECRET_B64"),
    "GOOGLE_CLIENT_ID": decode("BERKSHIRE_GOOGLE_CLIENT_ID_B64"),
    "GOOGLE_CLIENT_SECRET": decode("BERKSHIRE_GOOGLE_CLIENT_SECRET_B64"),
    "ALLOWED_GOOGLE_EMAIL": decode("BERKSHIRE_ALLOWED_GOOGLE_EMAIL_B64").strip().lower(),
    "ALLOWED_GOOGLE_SUB": decode("BERKSHIRE_ALLOWED_GOOGLE_SUB_B64", required=False).strip(),
}
(config_dir / "app.env").write_text(
    "".join(f"{key}={systemd_quote(value)}\n" for key, value in values.items()),
    encoding="utf-8",
)
PY
chown root:ai-berkshire-mcp "$config_dir/app.env"
chmod 0640 "$config_dir/app.env"

install -o root -g root -m 0644 "$release_dir/deploy/systemd/ai-berkshire-mcp.service" /etc/systemd/system/ai-berkshire-mcp.service
systemctl daemon-reload
systemctl enable ai-berkshire-mcp.service

echo "Configured AI Berkshire MCP runtime files."

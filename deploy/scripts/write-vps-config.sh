#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi
if [[ $# -ne 2 ]]; then
  echo "Usage: $0 /opt/ai-berkshire-mcp/releases/<sha> /tmp/runtime-patch" >&2
  exit 2
fi

release_dir=$(readlink -f "$1")
runtime_patch=$(readlink -f "$2")
root_dir=/opt/ai-berkshire-mcp
config_dir=/etc/ai-berkshire-mcp
state_dir=/var/lib/ai-berkshire-mcp
db_password_file=$config_dir/.db_password
better_auth_secret_file=$config_dir/.better_auth_secret

if [[ "$release_dir" != "$root_dir"/releases/* || ! -d "$release_dir" ]]; then
  echo "Release must exist under $root_dir/releases" >&2
  exit 1
fi
if [[ "$runtime_patch" != /tmp/ai-berkshire-runtime-* || ! -f "$runtime_patch" ]]; then
  echo "Runtime patch must be an existing /tmp/ai-berkshire-runtime-* file" >&2
  exit 1
fi
trap 'rm -f "$runtime_patch"' EXIT

if ! id -u ai-berkshire-mcp >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$state_dir" --shell /usr/sbin/nologin ai-berkshire-mcp
fi
install -d -o root -g root -m 0755 "$root_dir" "$root_dir/releases"
install -d -o root -g ai-berkshire-mcp -m 0750 "$config_dir"
install -d -o ai-berkshire-mcp -g ai-berkshire-mcp -m 0750 "$state_dir"

ensure_secret_file() {
  local path=$1
  local bytes=$2
  if [[ ! -s "$path" ]]; then
    umask 077
    openssl rand -base64 "$bytes" > "$path"
  fi
  chown root:root "$path"
  chmod 0600 "$path"
}

# These service-local secrets are generated once on the VPS and persist across
# releases. CI never reads or transports them.
ensure_secret_file "$db_password_file" 36
ensure_secret_file "$better_auth_secret_file" 48

db_password=$(tr -d '\r\n' < "$db_password_file")
[[ -n "$db_password" ]] || { echo "Database password is empty" >&2; exit 1; }

DB_PASSWORD="$db_password" python3 <<'PY' | sudo -u postgres psql --set=ON_ERROR_STOP=1
import os

password = os.environ["DB_PASSWORD"].replace("'", "''")
print("""DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_berkshire_mcp') THEN
    CREATE ROLE ai_berkshire_mcp LOGIN;
  END IF;
END
$do$;""")
print(f"ALTER ROLE ai_berkshire_mcp PASSWORD '{password}';")
print("""SELECT 'CREATE DATABASE ai_berkshire_mcp OWNER ai_berkshire_mcp'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'ai_berkshire_mcp')\\gexec
ALTER DATABASE ai_berkshire_mcp OWNER TO ai_berkshire_mcp;""")
PY

export BERKSHIRE_CONFIG_DIR="$config_dir"
export BERKSHIRE_RUNTIME_PATCH="$runtime_patch"
export BERKSHIRE_DB_PASSWORD_FILE="$db_password_file"
export BERKSHIRE_BETTER_AUTH_SECRET_FILE="$better_auth_secret_file"
python3 <<'PY'
import base64
import os
from pathlib import Path
from urllib.parse import quote

config_dir = Path(os.environ["BERKSHIRE_CONFIG_DIR"])
patch_path = Path(os.environ["BERKSHIRE_RUNTIME_PATCH"])
db_password = Path(os.environ["BERKSHIRE_DB_PASSWORD_FILE"]).read_text(encoding="utf-8").strip()
better_auth_secret = Path(os.environ["BERKSHIRE_BETTER_AUTH_SECRET_FILE"]).read_text(encoding="utf-8").strip()

encoded: dict[str, str] = {}
for line in patch_path.read_text(encoding="utf-8").splitlines():
    if not line.strip():
        continue
    key, sep, value = line.partition("=")
    if not sep or not key:
        raise SystemExit("invalid runtime patch line")
    encoded[key] = value


def decode(name: str, required: bool = True) -> str:
    raw = encoded.get(name, "")
    if not raw and not required:
        return ""
    if not raw:
        raise SystemExit(f"missing {name}")
    return base64.b64decode(raw, validate=True).decode("utf-8")


def systemd_quote(value: str) -> str:
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n') + '"'

hostname = decode("MCP_HOSTNAME_B64").strip().lower()
if not hostname or '/' in hostname or ':' in hostname:
    raise SystemExit("MCP_HOSTNAME must be a bare DNS hostname")

allowed_email = decode("ALLOWED_GOOGLE_EMAIL_B64").strip().lower()
if not allowed_email or "@" not in allowed_email:
    raise SystemExit("ALLOWED_GOOGLE_EMAIL must be an email address")

base_url = f"https://{hostname}"
values = {
    "PORT": "3020",
    "BETTER_AUTH_URL": base_url,
    "MCP_RESOURCE_URL": f"{base_url}/mcp",
    "DATABASE_URL": f"postgresql://ai_berkshire_mcp:{quote(db_password, safe='')}@127.0.0.1:5432/ai_berkshire_mcp",
    "BETTER_AUTH_SECRET": better_auth_secret,
    "GOOGLE_CLIENT_ID": decode("GOOGLE_CLIENT_ID_B64"),
    "GOOGLE_CLIENT_SECRET": decode("GOOGLE_CLIENT_SECRET_B64"),
    "ALLOWED_GOOGLE_EMAIL": allowed_email,
    "ALLOWED_GOOGLE_SUB": decode("ALLOWED_GOOGLE_SUB_B64", required=False).strip(),
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

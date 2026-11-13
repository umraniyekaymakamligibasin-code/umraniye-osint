#!/usr/bin/env bash
set -euo pipefail
[[ "$(uname -s)" == Linux && "$EUID" == 0 ]] || { echo 'Linux sunucuda sudo bash deploy/install-browser.sh çalıştırın.'; exit 1; }
src="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
target=/opt/umraniye-osint-browser
env_file=/etc/umraniye-osint-deneme.env
[[ -f "$env_file" && -f /opt/umraniye-osint-deneme/server/browser-research.mjs ]] || { echo 'Önce güncel ayrı deneme sürümü kurulmalı.'; exit 1; }
[[ ! -e "$target" ]] || { echo 'Tarayıcı kurulumu zaten var; üzerine yazılmadı.'; exit 1; }
id osintdeneme >/dev/null
apt-get update
apt-get install -y python3-venv xvfb x11vnc novnc websockify
install -d -o root -g root -m 0755 "$target"
python3 -m venv "$target/venv"
"$target/venv/bin/python" -m pip install --index-url https://pypi.org/simple -r "$src/browser/requirements.txt"
PLAYWRIGHT_BROWSERS_PATH="$target/browsers" "$target/venv/bin/python" -m playwright install --with-deps chromium
install -o root -g root -m 0644 "$src/browser/collector.py" "$target/collector.py"
install -o root -g root -m 0644 "$src/browser/login-session.py" "$target/login-session.py"
install -o root -g root -m 0755 "$src/deploy/login-browser.sh" "$target/login-browser.sh"
install -d -o osintdeneme -g osintdeneme -m 0700 /var/lib/umraniye-osint-deneme/browser-profiles
# Permit Chromium's OWN sandbox to create user namespaces on Ubuntu/AppArmor.
# No --no-sandbox and no global user-namespace sysctl changes.
if command -v apparmor_parser >/dev/null && [[ -d /etc/apparmor.d ]]; then
 cat > /etc/apparmor.d/osint-deneme-chromium <<'AA'
abi <abi/4.0>,
include <tunables/global>
profile osint-deneme-chromium /opt/umraniye-osint-browser/browsers/**/chrome flags=(unconfined) {
  userns,
}
AA
 apparmor_parser -r /etc/apparmor.d/osint-deneme-chromium
fi
if grep -q '^OSINT_BROWSER_ENABLED=' "$env_file"; then sed -i 's/^OSINT_BROWSER_ENABLED=.*/OSINT_BROWSER_ENABLED=true/' "$env_file"; else printf '\nOSINT_BROWSER_ENABLED=true\n' >> "$env_file"; fi
chmod 0600 "$env_file"
cat > /etc/systemd/system/umraniye-osint-browser.service <<'UNIT'
[Unit]
Description=Umraniye OSINT browser collection round
After=network-online.target umraniye-osint-deneme.service
Wants=network-online.target

[Service]
Type=oneshot
User=osintdeneme
Group=osintdeneme
WorkingDirectory=/opt/umraniye-osint-browser
Environment=PLAYWRIGHT_BROWSERS_PATH=/opt/umraniye-osint-browser/browsers
Environment=OSINT_BROWSER_DATA=/var/lib/umraniye-osint-deneme
ExecStart=/opt/umraniye-osint-browser/venv/bin/python /opt/umraniye-osint-browser/collector.py
TimeoutStartSec=480
TimeoutStopSec=30
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ReadWritePaths=/var/lib/umraniye-osint-deneme
MemoryHigh=700M
MemoryMax=1000M
TasksMax=256
LimitNOFILE=4096
UNIT
cat > /etc/systemd/system/umraniye-osint-browser.timer <<'UNIT'
[Unit]
Description=Umraniye OSINT browser collection every ten minutes
[Timer]
OnBootSec=120
OnUnitActiveSec=5min
AccuracySec=5s
Unit=umraniye-osint-browser.service
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl restart umraniye-osint-deneme
echo 'Tarayıcı kuruldu. Zamanlayıcı henüz açılmadı: önce panelde hesap ekleyin ve login-browser.sh ile giriş yapın.'
echo 'Girişlerden sonra: sudo systemctl enable --now umraniye-osint-browser.timer'
echo 'Elle ilk tur: sudo systemctl start umraniye-osint-browser.service'

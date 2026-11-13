#!/usr/bin/env bash
set -euo pipefail
[[ "$(uname -s)" == Linux && "$EUID" == 0 ]] || { echo 'Linux sunucuda sudo bash deploy/install-deneme.sh kullanın.' >&2; exit 1; }
src="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
node_bin="$(readlink -f "$(command -v node)")"
case "$node_bin" in /usr/*|/opt/*) ;; *) echo 'Sistem genelinde Node 24 gerekli.' >&2; exit 1;; esac
target=/opt/umraniye-osint-deneme
data=/var/lib/umraniye-osint-deneme
env_file=/etc/umraniye-osint-deneme.env
[[ ! -e "$target" && ! -e "$data" ]] || { echo 'Deneme kurulumu zaten var; üzerine yazılmadı.' >&2; exit 1; }
if [[ ! -e "$env_file" ]]; then
 install -o root -g root -m 0600 "$src/deploy/.env.deneme.example" "$env_file"
 echo 'Deneme ayar dosyası oluşturuldu. sudo nano /etc/umraniye-osint-deneme.env ile yalnız deneme şifresini girin; sonra bu komutu tekrar çalıştırın.'
 exit 2
fi
[[ ! -L "$env_file" ]] || { echo 'Sembolik env bağlantısı kullanılamaz.' >&2; exit 1; }
chown root:root "$env_file"; chmod 0600 "$env_file"
"$node_bin" --env-file="$env_file" "$src/server/verify.mjs" --config-only
"$node_bin" --env-file="$env_file" --input-type=module -e '
if(process.env.DATA_DIR!=="/var/lib/umraniye-osint-deneme"||process.env.PORT!=="3001"||process.env.PUBLIC_ORIGIN!=="https://deneme.umraniyeosint.com"||process.env.TELEGRAM_MODE!=="dry-run"||process.env.OSINT_LAB_ENABLED!=="true")throw Error("İlk kurulum yalnız ayrı veri dizini, deneme hostname, port 3001 ve dry-run ile yapılır.");'
if ss -ltnH 'sport = :3001' | read -r _; then echo '3001 portu kullanımda; kurulum durdu.' >&2; exit 1; fi
id osintdeneme >/dev/null 2>&1 || useradd --system --home "$data" --shell /usr/sbin/nologin osintdeneme
install -d -o root -g root -m 0755 "$target"
install -d -o osintdeneme -g osintdeneme -m 0700 "$data"
for folder in server worker drizzle deploy src; do
 install -d -o root -g root -m 0755 "$target/$folder"
 cp -R "$src/$folder/." "$target/$folder/"
done
install -o root -g root -m 0644 "$src/package.json" "$target/package.json"
chown -R root:root "$target"
find "$target" -type d -exec chmod 0755 {} +
find "$target" -type f -exec chmod 0644 {} +
cat > /etc/systemd/system/umraniye-osint-deneme.service <<EOF
[Unit]
Description=Umraniye OSINT isolated integration trial
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
User=osintdeneme
Group=osintdeneme
WorkingDirectory=$target
EnvironmentFile=$env_file
ExecStart=$node_bin --max-old-space-size=256 $target/server/start.mjs
Restart=on-failure
RestartSec=10
TimeoutStopSec=100
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
CapabilityBoundingSet=
ReadWritePaths=$data
MemoryHigh=512M
MemoryMax=768M
TasksMax=384
LimitNOFILE=4096

[Install]
WantedBy=multi-user.target
EOF
chmod 0644 /etc/systemd/system/umraniye-osint-deneme.service
systemctl daemon-reload
systemctl enable umraniye-osint-deneme.service
echo 'Ayrı deneme servisi kuruldu; henüz başlatılmadı. Canlı servis ve veritabanı değiştirilmedi.'
echo 'Yeni deneme hesaplarıyla başlamak için: sudo systemctl start umraniye-osint-deneme'
echo 'Eski veriler gerekiyorsa ilk başlatmadan ÖNCE aktarımın ayrı deneme veritabanına yapılması gerekir.'

#!/usr/bin/env bash
set -euo pipefail
[[ "$(uname -s)" == Linux && "$EUID" == 0 ]] || { echo 'Linux üzerinde sudo bash deploy/install-linux.sh kullanın.' >&2; exit 1; }
command -v systemctl >/dev/null
node_bin="$(command -v node)"
node_bin="$(readlink -f "$node_bin")"
case "$node_bin" in /home/*|/root/*) echo 'Node sistem genelinde kurulu olmalı; ev dizinindeki nvm yolu kullanılamaz.' >&2; exit 1;; esac
source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
target_dir=/opt/umraniye-osint
[[ ! -e "$target_dir/worker/index.js" ]] || { echo 'Mevcut kurulum bulundu. Üzerine yazılmadı; önce yedek ve sürüm geçişi planlayın.' >&2; exit 1; }
if [[ ! -e /etc/umraniye-osint.env ]]; then
 install -o root -g root -m 0600 "$source_dir/.env.example" /etc/umraniye-osint.env
 echo 'Gizli ayar dosyası oluşturuldu. sudoedit /etc/umraniye-osint.env ile alan adı ve yönetici bilgilerini girin; sonra bu komutu tekrar çalıştırın.'
 exit 2
fi
[[ ! -L /etc/umraniye-osint.env ]] || { echo 'Ortam dosyası sembolik bağlantı olamaz.' >&2; exit 1; }
chown root:root /etc/umraniye-osint.env
chmod 0600 /etc/umraniye-osint.env
"$node_bin" --env-file=/etc/umraniye-osint.env "$source_dir/server/verify.mjs" --config-only
id umraniyeosint >/dev/null 2>&1 || useradd --system --home /var/lib/umraniye-osint --shell /usr/sbin/nologin umraniyeosint
install -d -o root -g root -m 0755 "$target_dir"
install -d -o umraniyeosint -g umraniyeosint -m 0700 /var/lib/umraniye-osint
for folder in server worker drizzle deploy licenses; do
 if [[ -d "$source_dir/$folder" ]]; then
  install -d -o root -g root -m 0755 "$target_dir/$folder"
  cp -R "$source_dir/$folder/." "$target_dir/$folder/"
 fi
done
for name in package.json RELEASE.json; do
 [[ ! -f "$source_dir/$name" ]] || install -o root -g root -m 0644 "$source_dir/$name" "$target_dir/$name"
done
chown -R root:root "$target_dir"
find "$target_dir" -type d -exec chmod 0755 {} +
find "$target_dir" -type f -exec chmod 0644 {} +
unit_file="$(mktemp)"
trap 'rm -f -- "$unit_file"' EXIT
sed "s|^ExecStart=.*|ExecStart=$node_bin --max-old-space-size=512 /opt/umraniye-osint/server/start.mjs|" "$source_dir/deploy/umraniye-osint.service" > "$unit_file"
install -o root -g root -m 0644 "$unit_file" /etc/systemd/system/umraniye-osint.service
systemctl daemon-reload
systemctl enable umraniye-osint.service
echo 'Kuruldu ve açılışta çalışma etkinleştirildi. Servis henüz başlatılmadı. Önce aktarım/yedek ve HTTPS tünelini tamamlayın; sonra sudo systemctl start umraniye-osint çalıştırın.'

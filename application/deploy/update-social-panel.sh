#!/usr/bin/env bash
set -euo pipefail
[[ "$(uname -s)" == Linux && "$EUID" == 0 ]] || { echo 'Linux sunucuda sudo bash deploy/update-social-panel.sh çalıştırın.'; exit 1; }
src="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
target=/opt/umraniye-osint-deneme
data=/var/lib/umraniye-osint-deneme
runtime=/opt/umraniye-osint-browser
[[ -d "$target/server" && -d "$data" && -f "$runtime/collector.py" && -f "$src/server/social.html" ]] || { echo 'Önce ayrı deneme ve tarayıcı kurulumu tamamlanmalı.'; exit 1; }
[[ ! -L "$target" && ! -L "$data" && ! -L "$runtime" ]] || { echo 'Sembolik kurulum hedefi reddedildi.'; exit 1; }
cd "$src"
sha256sum --check SHA256SUMS >/dev/null
backup="/var/backups/umraniye-osint-deneme/social-$(date -u +%Y%m%dT%H%M%SZ)"
[[ ! -e "$backup" ]] || { echo 'Yedek hedefi zaten var.'; exit 1; }
install -d -o root -g root -m 0700 "$backup"
timer_active=no
if systemctl is-active --quiet umraniye-osint-browser.timer; then timer_active=yes; fi
systemctl stop umraniye-osint-browser.timer
systemctl stop umraniye-osint-browser.service
systemctl stop umraniye-osint-deneme.service
trap 'systemctl start umraniye-osint-deneme.service || true; if [[ "$timer_active" == yes ]]; then systemctl start umraniye-osint-browser.timer || true; fi' ERR
cp -a "$target" "$backup/code"
cp -a "$data" "$backup/data"
cp -a "$runtime/collector.py" "$backup/collector.py"
[[ ! -f "$runtime/login-session.py" ]] || cp -a "$runtime/login-session.py" "$backup/login-session.py"
cp -a /etc/umraniye-osint-deneme.env "$backup/deneme.env"
restore(){
 echo 'Güncelleme başarısız; önceki deneme kodu geri yükleniyor.' >&2
 systemctl stop umraniye-osint-deneme.service || true
 cp -a "$backup/code/." "$target/"
 cp -a "$backup/collector.py" "$runtime/collector.py"
 [[ ! -f "$backup/login-session.py" ]] || cp -a "$backup/login-session.py" "$runtime/login-session.py"
 systemctl start umraniye-osint-deneme.service || true
 [[ "$timer_active" != yes ]] || systemctl start umraniye-osint-browser.timer || true
}
trap restore ERR
for folder in server worker drizzle deploy src; do cp -R "$src/$folder/." "$target/$folder/"; done
install -o root -g root -m 0644 "$src/package.json" "$target/package.json"
install -o root -g root -m 0644 "$src/browser/collector.py" "$runtime/collector.py"
install -o root -g root -m 0644 "$src/browser/login-session.py" "$runtime/login-session.py"
chown -R root:root "$target"
find "$target" -type d -exec chmod 0755 {} +
find "$target" -type f -exec chmod 0644 {} +
systemctl start umraniye-osint-deneme.service
healthy=no
for i in {1..15}; do if curl --silent --fail http://127.0.0.1:3001/health >/dev/null; then healthy=yes; break; fi; sleep 1; done
[[ "$healthy" == yes ]]
systemctl enable --now umraniye-osint-browser.timer
trap - ERR
echo 'Sosyal medya paneli güncellendi. Ana canlı servis ve ana veritabanı değiştirilmedi.'
echo 'Deneme hesapları, ayarlar, oturum klasörleri ve gizli anahtarlar korundu.'
echo 'Tarayıcı zamanlayıcısı etkin. Panelde takibi kapalı hesaplar taranmaz.'
echo "Geri dönüş yedeği: $backup (root erişimli; gizli oturumlar içerir, paylaşmayın)."
echo 'Panel: https://deneme.umraniyeosint.com/yonetim/entegrasyonlar'
echo 'Ayrı akış: https://deneme.umraniyeosint.com/sosyal-medya'

#!/usr/bin/env bash
set -euo pipefail
[[ "$EUID" == 0 && "$(uname -s)" == Linux ]] || exit 1
src="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
bash "$src/deploy/update-social-panel.sh"
systemctl set-property umraniye-osint-deneme.service TasksMax=384
install -d -o root -g root -m 0755 /etc/systemd/system/umraniye-osint-browser.timer.d
cat > /etc/systemd/system/umraniye-osint-browser.timer.d/90-osint-five-minute.conf <<'UNIT'
[Timer]
OnUnitActiveSec=
OnUnitActiveSec=5min
AccuracySec=5s
UNIT
systemctl daemon-reload
systemctl restart umraniye-osint-browser.timer
echo 'V4 kuruldu: sosyal tarama tur hedefi 5 dakika. Hesap doğrulaması bekleyenler otomatik zorlanmaz.'
echo 'Gerçek platform erişimi ve tarama sonuçlarını panelde doğrulayın.'

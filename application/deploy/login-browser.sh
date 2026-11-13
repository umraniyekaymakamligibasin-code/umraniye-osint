#!/usr/bin/env bash
set -euo pipefail
[[ "$EUID" == 0 ]] || { echo 'sudo bash login-browser.sh HESAP_SIRASI'; exit 1; }
index="${1:-}"
[[ "$index" =~ ^([1-9]|1[0-2])$ ]] || { echo 'Paneldeki hesap sırasını girin: 1–12'; exit 1; }
systemctl stop umraniye-osint-browser.timer
systemctl stop umraniye-osint-browser.service
display=:77
[[ ! -e /tmp/.X77-lock ]] || { echo 'Başka giriş ekranı açık; önce onu kapatın.'; exit 1; }
pids=()
cleanup(){ for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM
runuser -u osintdeneme -- Xvfb "$display" -screen 0 1280x900x24 -nolisten tcp & pids+=("$!")
sleep 2
runuser -u osintdeneme -- x11vnc -display "$display" -localhost -rfbport 5901 -nopw -forever -shared -quiet & pids+=("$!")
runuser -u osintdeneme -- websockify --web=/usr/share/novnc 127.0.0.1:6080 127.0.0.1:5901 & pids+=("$!")
echo 'Windows PowerShell: ssh -N -L 6080:127.0.0.1:6080 basin@100.79.234.33'
echo 'Sonra Windows tarayıcı: http://127.0.0.1:6080/vnc.html?autoconnect=1&resize=scale'
echo 'Platformun kendi ekranında giriş yapın. Bitince tarayıcı penceresini kapatın. Şifre sohbete veya OSINT paneline girilmez.'
runuser -u osintdeneme -- env DISPLAY="$display" PLAYWRIGHT_BROWSERS_PATH=/opt/umraniye-osint-browser/browsers OSINT_BROWSER_DATA=/var/lib/umraniye-osint-deneme /opt/umraniye-osint-browser/venv/bin/python /opt/umraniye-osint-browser/collector.py --login-index "$index"
echo 'Giriş penceresi kapandı. Oturum platform tarafından kabul edildiyse sonraki turda kullanılacak. Zamanlayıcıyı tekrar açın.'

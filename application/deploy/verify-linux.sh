#!/usr/bin/env bash
set -euo pipefail
[[ "$(uname -s)" == Linux && "$EUID" == 0 ]] || { echo 'Linux üzerinde sudo bash deploy/verify-linux.sh kullanın.' >&2; exit 1; }
unit=umraniye-osint.service
systemctl is-enabled --quiet "$unit"
systemctl is-active --quiet "$unit"
node_bin="$(readlink -f "$(command -v node)")"
"$node_bin" --env-file=/etc/umraniye-osint.env /opt/umraniye-osint/server/verify.mjs --restore-test --https
echo 'PASS Servis etkin ve çalışıyor; yerel sağlık, HTTPS ve izole yedekten dönüş kontrol edildi.'
journalctl -u "$unit" -b --no-pager -o cat | "$node_bin" --input-type=module -e '
let text="";for await(const chunk of process.stdin)text+=chunk;
const rounds=text.split("\n").flatMap(line=>{try{const e=JSON.parse(line);return e.event==="collection_completed"&&!e.stopped?[e]:[]}catch{return []}}).slice(-2);
if(rounds.length<2||rounds.some(e=>e.successful<1)||Date.parse(rounds[1].at)-Date.parse(rounds[0].at)<540000){console.error("FAIL Bu açılışta iki gerçek otomatik tarama turu henüz doğrulanamadı. COLLECTOR_ENABLED=true olmalı; en az 10–20 dakika bekleyip tekrar çalıştırın.");process.exit(1)}
console.log("PASS Bu açılışta iki zamanlanmış tarama turu, en az 9 dakika arayla tamamlanmış. Kısmi başarısız grup sayıları: "+rounds.map(e=>e.failed).join(", "));
'
if [[ "${1:-}" == --exercise-recovery ]]; then
 echo 'Bakım testi: uygulama işlemi şimdi zorla kapatılacak; aktif istekler kesilebilir. Veritabanı dosyası silinmez.'
 old_pid="$(systemctl show -p MainPID --value "$unit")"
 old_restarts="$(systemctl show -p NRestarts --value "$unit")"
 systemctl kill --signal=SIGKILL --kill-whom=main "$unit"
 recovered=false
 for attempt in $(seq 1 60); do
  sleep 1
  new_pid="$(systemctl show -p MainPID --value "$unit")"
  new_restarts="$(systemctl show -p NRestarts --value "$unit")"
  if systemctl is-active --quiet "$unit" && [[ "$new_pid" != 0 && "$new_pid" != "$old_pid" && "$new_restarts" -gt "$old_restarts" ]]; then
   "$node_bin" --env-file=/etc/umraniye-osint.env /opt/umraniye-osint/server/verify.mjs
   recovered=true
   break
  fi
 done
 [[ "$recovered" == true ]] || { echo 'FAIL Otomatik yeniden başlatma 60 saniyede doğrulanamadı.' >&2; exit 1; }
 echo 'PASS systemd zorla kapanan uygulamayı farklı PID ile otomatik başlattı.'
fi
echo 'Kalan fiziksel kabul: bilgisayarı yeniden açıp oturum açmadan bu kontrolleri tekrarlayın; iki gerçek 10 dakikalık tarama turunu ve mobil internetten erişimi doğrulayın.'

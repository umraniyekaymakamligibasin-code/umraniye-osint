#!/usr/bin/env bash
set -euo pipefail
[[ "$(uname -s)" == Linux && "$EUID" == 0 ]] || { echo 'Linux üzerinde sudo bash deploy/verify-deneme.sh kullanın.' >&2; exit 1; }
systemctl is-active --quiet umraniye-osint-deneme
systemctl is-enabled --quiet umraniye-osint-deneme
node_bin="$(readlink -f "$(command -v node)")"
"$node_bin" --env-file=/etc/umraniye-osint-deneme.env /opt/umraniye-osint-deneme/server/verify.mjs --restore-test --https
journalctl -u umraniye-osint-deneme -b --no-pager -o cat | "$node_bin" --input-type=module -e '
let text="";for await(const c of process.stdin)text+=c;
const events=text.split("\n").flatMap(s=>{try{return [JSON.parse(s)]}catch{return []}});
const base=events.filter(e=>e.event==="collection_completed"&&!e.stopped&&e.successful>0).slice(-2);
const lab=events.filter(e=>e.event==="lab_collection_completed").slice(-2);
if(base.length<2||lab.length<2||Date.parse(base[1].at)-Date.parse(base[0].at)<540000||Date.parse(lab[1].at)-Date.parse(lab[0].at)<540000){console.error("FAIL Bu açılışta en az 9 dakika arayla iki temel ve iki ek tarama turu henüz doğrulanmadı.");process.exit(1)}
console.log("PASS Tarayıcıdan bağımsız iki temel ve iki entegrasyon turu günlükte mevcut. Gerçek kaynak sağlıkları panelden ayrıca incelenmeli.");'
echo 'PASS Deneme servis/HTTPS/SQLite/izole geri dönüş ve tur zamanlaması kontrol edildi. Ana canlıya değişiklik yapılmadı.'

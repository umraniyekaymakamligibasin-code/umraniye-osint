import { formatAlert } from './format-v2.mjs';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';

const DB = '/var/lib/umraniye-osint/osint.sqlite';
const STATE = '/var/lib/umraniye-osint/telegram-state.json';
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

if (!TOKEN || !CHAT) {
  console.error('Telegram ayarlari eksik');
  process.exit(1);
}

const db = new DatabaseSync(DB, { readOnly: true });
const all = () => db.prepare(
  'SELECT id,event_id,title,created_at FROM alert_log ORDER BY created_at,id'
).all();

// Uyarı satırı yalnız event_id taşır; haber ayrıntısı son anlık görüntülerden okunur.
// Bulunamazsa formatAlert satırdaki başlıkla devam eder.
function eventsById(ids) {
  const wanted = new Set(ids.map(String));
  const found = new Map();
  if (!wanted.size) return found;
  for (const row of db.prepare('SELECT data FROM snapshots ORDER BY updated_at DESC LIMIT 100').all()) {
    let data;
    try { data = JSON.parse(row.data); } catch { continue; }
    for (const item of data?.events || []) {
      const id = String(item?.id ?? '');
      if (wanted.has(id) && !found.has(id)) found.set(id, item);
    }
    if (found.size === wanted.size) break;
  }
  return found;
}

let sent;
let running = null;

if (!existsSync(STATE)) {
  sent = new Set(all().map(r => r.id));
  save();
  console.log('Mevcut uyarilar atlandi:', sent.size);
} else {
  sent = new Set(JSON.parse(readFileSync(STATE, 'utf8')));
}

function save() {
  const tmp = STATE + '.tmp';
  writeFileSync(tmp, JSON.stringify([...sent]), { mode: 0o600 });
  renameSync(tmp, STATE);
}

// 30 sn'lik zamanlayıcı, yavaş bir gönderim turu bitmeden yeniden tetiklenebilir.
// Çakışan turlar aynı uyarıyı iki kez göndermesin diye tek tur çalışır.
function check() {
  if (running) return running;
  running = sendPending().finally(() => { running = null; });
  return running;
}

// Bir kesinti sonrası birikmiş eski uyarılar sırayla gönderilirse yeni uyarılar saatlerce
// bekler. Belirli bir süreden eski uyarılar gönderilmeden atlanır.
const MAX_ALERT_AGE_MS = 3 * 60 * 60 * 1000;

async function sendPending() {
  let pending = all().filter(row => !sent.has(row.id));
  if (!pending.length) return;
  const cutoff = Date.now() - MAX_ALERT_AGE_MS;
  const stale = pending.filter(row => Date.parse(row.created_at) < cutoff);
  if (stale.length) {
    for (const row of stale) sent.add(row.id);
    save();
    console.log('Eski uyarilar gonderilmeden atlandi:', stale.length);
    pending = pending.filter(row => !sent.has(row.id));
    if (!pending.length) return;
  }
  const events = eventsById(pending.map(row => row.event_id));
  for (const row of pending) {
    if (sent.has(row.id)) continue;

    const formatted = formatAlert(row, events.get(String(row.event_id)));
    const message = formatted.message;

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            chat_id: CHAT,
            text: message,
            disable_notification: formatted.silent
          }),
          signal: AbortSignal.timeout(15000)
        }
      );

      const result = await response.json();

      if (!result.ok) {
        console.error('Telegram gonderim hatasi:', result.error_code);
        break;
      }

      sent.add(row.id);
      save();
      console.log('Gonderildi:', row.id);
    } catch (error) {
      console.error('Baglanti hatasi:', error.message);
      break;
    }
  }
}

await check().catch(console.error);
setInterval(() => check().catch(console.error), 30000);

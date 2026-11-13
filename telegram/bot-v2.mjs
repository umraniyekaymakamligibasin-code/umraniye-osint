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
  'SELECT id,title,created_at FROM alert_log ORDER BY created_at,id'
).all();

let sent;

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

async function check() {
  for (const row of all()) {
    if (sent.has(row.id)) continue;

    const formatted = formatAlert(row, event);
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

await check();
setInterval(() => check().catch(console.error), 30000);

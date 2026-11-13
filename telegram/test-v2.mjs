import { DatabaseSync } from 'node:sqlite';
import { formatAlert } from './format-v2.mjs';

const db = new DatabaseSync(
  '/var/lib/umraniye-osint/osint.sqlite',
  { readOnly: true }
);

const alerts = db.prepare(`
  SELECT id, event_id, title, created_at
  FROM alert_log
  ORDER BY created_at DESC
  LIMIT 100
`).all();

const snapshots = db.prepare(`
  SELECT data
  FROM snapshots
  ORDER BY updated_at DESC
  LIMIT 100
`).all();

const events = new Map();

for (const row of snapshots) {
  try {
    const data = JSON.parse(row.data);

    for (const event of data.events || []) {
      if (event.id && !events.has(String(event.id))) {
        events.set(String(event.id), event);
      }
    }
  } catch {}
}

const matched = alerts.find(row =>
  events.has(String(row.event_id))
);

if (!matched) {
  console.log('Eslestirilen haber bulunamadi.');
  process.exit(1);
}

const event = events.get(String(matched.event_id));
const result = formatAlert(matched, event);

console.log('=== TELEGRAM V2 TEST ===');
console.log(result.message);
console.log('SESLI BILDIRIM:', !result.silent);
console.log('KRITIK:', result.critical);
console.log('=== TEST TAMAMLANDI ===');

db.close();

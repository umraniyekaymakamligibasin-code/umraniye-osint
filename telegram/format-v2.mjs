const TZ = 'Europe/Istanbul';

function dateTR(value) {
  if (!value) return 'Belirtilmedi';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Belirtilmedi';

  return d.toLocaleString('tr-TR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
}

function clean(value, max = 250) {
  return String(value ?? '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .trim()
    .slice(0, max);
}

export function formatAlert(row, event) {
  const priority = clean(event?.priority, 30).toLowerCase();

  const critical = Boolean(event?.nationalCritical) ||
    ['critical', 'kritik', 'urgent', 'acil'].includes(priority);

  const high = critical ||
    ['high', 'yüksek', 'yuksek'].includes(priority);

  const level = critical ? '🔴 KRİTİK' :
    high ? '🟠 YÜKSEK' :
    '🔵 NORMAL';

  const title = clean(event?.title || row.title, 300);
  const source = clean(event?.sourceName || 'Belirtilmedi', 100);
  const location = clean(event?.neighborhood || 'Ümraniye', 100);
  const reason = clean(event?.priorityReason || 'Belirtilmedi', 300);

  let url = '';
  try {
    const parsed = new URL(event?.url || '');
    if (['http:', 'https:'].includes(parsed.protocol)) {
      url = parsed.href;
    }
  } catch {}

  const message = [
    '🚨 ÜMRANİYE OSINT | ERKEN UYARI',
    '',
    level,
    '',
    '📰 ' + title,
    '',
    '📍 Konum: ' + location,
    '🗞 Kaynak: ' + source,
    '🕒 Yayın: ' + dateTR(event?.publishedAt),
    '🔎 Tespit: ' + dateTR(event?.collectedAt || row.created_at),
    '📌 Öncelik gerekçesi: ' + reason,
    url ? '🔗 Kaynak: ' + url : '',
    '',
    '⚠️ Kaynak ve olay doğrulaması gereklidir.'
  ].filter(Boolean).join('\n');

  return {
    message: message.slice(0, 4000),
    silent: !high,
    critical
  };
}

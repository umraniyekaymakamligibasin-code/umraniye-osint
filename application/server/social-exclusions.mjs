// SOSYAL_KAYNAK_DISLAMA_V1
// Yonetici takip listesinden cikarilan sosyal hesaplarin paylasimlari,
// anahtar kelime aramasiyla geri gelse bile panele ve kurum yonlendirmesine
// alinmaz. Genel mekanizma: saglayici bazinda handle ve/veya gorunen ad.
const PROVIDERS = ['x', 'instagram', 'facebook'];

export function emptySourceExclusions() {
  return { x: [], instagram: [], facebook: [] };
}

export function parseSourceExclusions(raw) {
  const out = emptySourceExclusions();
  let data;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch { return out; }
  } else {
    data = raw;
  }
  if (!data || typeof data !== 'object') return out;
  for (const provider of PROVIDERS) {
    const list = Array.isArray(data[provider]) ? data[provider] : [];
    for (const entry of list) {
      if (typeof entry === 'string') {
        const handle = entry.toLowerCase().replace(/^@/, '').trim();
        if (handle) out[provider].push({ handle, label: null });
      } else if (entry && typeof entry.handle === 'string') {
        const handle = entry.handle.toLowerCase().replace(/^@/, '').trim();
        const label = typeof entry.label === 'string'
          ? entry.label.toLocaleLowerCase('tr-TR').trim()
          : null;
        if (handle || label) out[provider].push({ handle: handle || null, label: label || null });
      }
    }
  }
  return out;
}

export function sourceProvider(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'x.com' || host === 'www.x.com' || host === 'twitter.com' || host === 'www.twitter.com') return 'x';
    if (host === 'instagram.com' || host === 'www.instagram.com') return 'instagram';
    if (host === 'facebook.com' || host === 'www.facebook.com' || host === 'm.facebook.com') return 'facebook';
  } catch {}
  return null;
}

export function isExcludedSource(exclusions, { provider, url, sourceName } = {}) {
  const p = provider && PROVIDERS.includes(provider) ? provider : sourceProvider(url || '');
  if (!p) return false;
  const rows = exclusions?.[p] || [];
  if (!rows.length) return false;
  let handle = '';
  try {
    handle = (new URL(String(url || '')).pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
  } catch {}
  const name = String(sourceName || '').toLocaleLowerCase('tr-TR');
  return rows.some((r) =>
    (r.handle && handle === r.handle) ||
    (r.label && name.includes(r.label))
  );
}

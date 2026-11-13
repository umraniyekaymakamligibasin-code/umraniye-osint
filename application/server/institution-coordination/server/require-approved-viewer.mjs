/**
 * Fail-closed access gate for the existing, general OSINT portal.
 * Mount BEFORE every general HTML page and every API that can reveal news,
 * social posts, alerts, search results, counts, exports, or source metadata.
 * Institution membership is deliberately not a substitute for central approval.
 */
const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, private',
  'x-content-type-options': 'nosniff',
  'vary': 'cookie'
};

const deny = (status, code) => new Response(JSON.stringify({ error: code }), { status, headers: HEADERS });

export async function requireApprovedViewer(request, adapters) {
  if (typeof adapters?.authenticate !== 'function' ||
      typeof adapters?.isCentralAdmin !== 'function' ||
      typeof adapters?.isApprovedPortalViewer !== 'function') {
    return { ok: false, response: deny(503, 'access_control_unavailable') };
  }
  try {
    const actor = await adapters.authenticate(request);
    if (!actor?.accountId) return { ok: false, response: deny(401, 'authentication_required') };
    if (await adapters.isCentralAdmin(actor)) return { ok: true, actor, role: 'central_admin' };
    if (await adapters.isApprovedPortalViewer(actor)) return { ok: true, actor, role: 'approved_portal_viewer' };
    return { ok: false, response: deny(403, 'approved_portal_access_required') };
  } catch {
    // Never turn auth-system errors into an allow decision.
    return { ok: false, response: deny(503, 'access_control_unavailable') };
  }
}

/** Wrap a handler; unmatched routes should be handled by the host router. */
export function gateGeneralPortalHandler(handler, adapters) {
  if (typeof handler !== 'function') throw new TypeError('handler must be a function');
  return async request => {
    const access = await requireApprovedViewer(request, adapters);
    if (!access.ok) return access.response;
    return handler(request, access.actor, access.role);
  };
}


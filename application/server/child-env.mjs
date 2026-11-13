// Alt süreçlere (Chromium/Playwright, Python yardımcıları) yalnız çalışmak için gereken ortam
// değişkenleri verilir. Yönetici parolası, Telegram/YouTube anahtarları gibi sırlar dış içerik
// işleyen süreçlere geçmez. Gerekli ek değişkenler çağıran tarafından açıkça eklenir.
const ALLOWED=['PATH','HOME','USER','LOGNAME','SHELL','LANG','LANGUAGE','LC_ALL','LC_CTYPE','TZ','TMPDIR','XDG_RUNTIME_DIR','PYTHONIOENCODING','DATA_DIR','SSL_CERT_FILE','SSL_CERT_DIR','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','http_proxy','https_proxy','no_proxy'];
export function childEnv(extra={},source=process.env){
 const env={};for(const key of ALLOWED)if(source[key]!==undefined)env[key]=source[key];
 return {...env,...extra};
}

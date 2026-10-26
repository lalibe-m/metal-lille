const USER_AGENT = "Mozilla/5.0 (compatible; metal-lille-agenda/1.0; +https://github.com/)";

export async function fetchText(url, { retries = 2, timeoutMs = 30000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "fr-FR,fr;q=0.9" },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} sur ${url}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function fetchJson(url, options) {
  return JSON.parse(await fetchText(url, options));
}

export function normalize(text) {
  return String(text || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&#?\w+;/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

export function slug(text) {
  return normalize(text).replace(/\s+/g, "-").slice(0, 60);
}

export function decodeEntities(text) {
  return String(text || "")
    .replace(/&#8211;|&ndash;/g, "–").replace(/&#8217;|&rsquo;/g, "’").replace(/&#038;|&amp;/g, "&")
    .replace(/&#039;|&#39;|&apos;/g, "'").replace(/&quot;/g, "\"").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (match, code) => String.fromCodePoint(Number(code)));
}

export function cleanSpaces(text) {
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

export function todayInParis() {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export const FRENCH_MONTHS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];

export function frenchMonthIndex(name) {
  const key = normalize(name).replace(/\s+/g, "");
  return FRENCH_MONTHS.findIndex(month => key.startsWith(month.slice(0, 4)) || month.startsWith(key));
}

export function isoDate(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatTime(value) {
  const match = String(value || "").match(/(\d{1,2})\s*[h:]\s*(\d{2})?/i);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2] || "00"}`;
}

export function formatPrice(value) {
  const text = cleanSpaces(value);
  if (!text) return null;
  if (/gratuit|free/i.test(text)) return "Gratuit";
  return text.replace(/\s*€/g, " €").replace(/(\d)€/g, "$1 €");
}

export function safeUrl(value, base) {
  if (!value) return null;
  try {
    const url = new URL(decodeEntities(value), base);
    return /^https?:$/.test(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function isAffiliateUrl(url) {
  return /awin1\.com|pclick\.php/i.test(url || "");
}

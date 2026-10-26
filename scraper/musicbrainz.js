import { readFile, writeFile } from "node:fs/promises";
import { normalize } from "./lib.js";
import { isMetalGenre, familyOf } from "./genres.js";

const API = "https://musicbrainz.org/ws/2/artist";
const USER_AGENT = "metal-lille-agenda/1.0 ( https://github.com/lalibe-m/metal-lille )";
const FOUND_TTL_DAYS = 180;
const MISSING_TTL_DAYS = 30;
const NOT_A_BAND = /\b(fest|festival|tribute|soiree|expo|exposition|atelier|workshop|masterclass|quiz|karaoke|jam|brunch|conference|rencontre|projection|cinema|dj set|bal|spectacle|lecture|visite|marche|market|party|club night|open mic|stand ?up|comedy)\b/;

export async function loadCache(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return {};
  }
}

export async function saveCache(path, cache) {
  const sorted = Object.fromEntries(Object.entries(cache).sort(([left], [right]) => left.localeCompare(right)));
  const text = JSON.stringify(sorted, null, 1) + "\n";
  let previous = "";
  try {
    previous = await readFile(path, "utf8");
  } catch {
  }
  if (text !== previous) await writeFile(path, text);
}

export function isLookupCandidate(name) {
  const key = normalize(name);
  return key.length >= 2 && key.length <= 60 && !NOT_A_BAND.test(key);
}

function isFresh(entry, today) {
  if (!entry || !entry.checkedAt) return false;
  const ageDays = (Date.parse(today) - Date.parse(entry.checkedAt)) / 86400000;
  return ageDays < (entry.tags && entry.tags.length ? FOUND_TTL_DAYS : MISSING_TTL_DAYS);
}

async function search(name) {
  const url = `${API}?fmt=json&limit=5&query=${encodeURIComponent(`artist:"${name.replace(/"/g, "")}"`)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    if (response.status === 503 || response.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)));
      continue;
    }
    if (!response.ok) throw new Error(`MusicBrainz HTTP ${response.status}`);
    return (await response.json()).artists || [];
  }
  throw new Error("MusicBrainz indisponible (limite de débit)");
}

function bestMatch(name, artists) {
  const key = normalize(name);
  const exact = artists.filter(artist => normalize(artist.name) === key || (artist.aliases || []).some(alias => normalize(alias.name) === key));
  const weight = artist => (artist.tags || []).reduce((sum, tag) => sum + Math.max(tag.count, 0) + 0.5, 0);
  return exact.sort((left, right) => weight(right) - weight(left))[0] || null;
}

export function classify(entry) {
  const tags = (entry && entry.tags) || [];
  if (tags.length === 0) return null;
  const total = tags.reduce((sum, tag) => sum + tag.count + 0.5, 0);
  const metalTags = tags.filter(tag => isMetalGenre(tag.name));
  const metalWeight = metalTags.reduce((sum, tag) => sum + tag.count + 0.5, 0);
  if (metalWeight * 2 < total) return { metal: false };
  const genre = metalTags[0].name.replace(/\b\p{L}/u, letter => letter.toUpperCase());
  return { metal: true, genre, family: familyOf(genre) };
}

export async function resolveGenres(names, cache, { today, maxLookups = 250, delayMs = 1100 } = {}) {
  const pending = [...new Set(names.filter(isLookupCandidate).map(name => name.trim()))]
    .filter(name => !isFresh(cache[normalize(name)], today));
  let looked = 0;
  let failures = 0;
  for (const name of pending) {
    if (looked >= maxLookups || failures >= 5) break;
    looked++;
    try {
      const match = bestMatch(name, await search(name));
      const tags = match ? (match.tags || []).filter(tag => tag.count >= 0).sort((left, right) => right.count - left.count).slice(0, 8).map(tag => ({ name: tag.name, count: tag.count })) : [];
      cache[normalize(name)] = { name, id: match ? match.id : null, tags, checkedAt: today };
    } catch {
      failures++;
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return { pending: pending.length, looked, failures };
}

export function lookup(cache, name) {
  return classify(cache[normalize(name)]);
}

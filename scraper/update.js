import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalize, slug, todayInParis, isAffiliateUrl } from "./lib.js";
import { venueKey, canonicalVenue, countryOf } from "./venues.js";
import { familyOf } from "./genres.js";
import { loadCache, saveCache, resolveGenres, lookup } from "./musicbrainz.js";
import concertsMetal from "./sources/concertsMetal.js";
import blackLab from "./sources/blackLab.js";
import { aeronef, grandMix } from "./sources/drupalAgenda.js";
import caveAuxPoetes from "./sources/caveAuxPoetes.js";
import metaphone from "./sources/metaphone.js";
import ancienneBelgique from "./sources/ancienneBelgique.js";
import magasin4 from "./sources/magasin4.js";
import botanique from "./sources/botanique.js";
import vkConcerts from "./sources/vkConcerts.js";
import wildeWesten from "./sources/wildeWesten.js";
import kinkyStar from "./sources/kinkyStar.js";
import rockerill from "./sources/rockerill.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "docs", "concerts.json");
const OVERRIDES = join(ROOT, "data", "overrides.json");
const GENRE_CACHE = join(ROOT, "data", "genres.json");
const SOURCES = [
  concertsMetal, blackLab, aeronef, grandMix, caveAuxPoetes, metaphone,
  ancienneBelgique, magasin4, botanique, vkConcerts, wildeWesten, kinkyStar, rockerill
];
const CURATED_SOURCES = new Set(["concerts-metal", "manuel"]);
const STATUS_PRIORITY = ["cancelled", "postponed", "soldout", "onsale", "unknown"];

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function names(event) {
  return [event.artist, ...(event.support || [])].map(normalize).filter(name => name.length >= 2);
}

function sameShow(left, right) {
  if (left.date !== right.date || venueKey(left.venue) !== venueKey(right.venue)) return false;
  const leftNames = names(left);
  const rightNames = names(right);
  const rightTitle = normalize(right.title || right.artist);
  const leftTitle = normalize(left.title || left.artist);
  return leftNames.some(name => rightNames.includes(name) || rightTitle.includes(name))
    || rightNames.some(name => leftTitle.includes(name));
}

function mergeInto(target, event) {
  for (const field of ["time", "price", "genre", "family"]) {
    if (!target[field] && event[field]) target[field] = event[field];
  }
  if ((!target.support || target.support.length === 0) && event.support && event.support.length) target.support = event.support;
  const venueTicket = event.source !== "concerts-metal" && event.ticketUrl && !isAffiliateUrl(event.ticketUrl);
  if (venueTicket && (!target.ticketUrl || target.ticketFrom === "concerts-metal")) {
    target.ticketUrl = event.ticketUrl;
    target.ticketFrom = event.source;
  }
  if (!target.sourceUrl && event.sourceUrl) target.sourceUrl = event.sourceUrl;
  if (STATUS_PRIORITY.indexOf(event.status) < STATUS_PRIORITY.indexOf(target.status)) target.status = event.status;
  if (!target.sources.includes(event.source)) target.sources.push(event.source);
}

function toEntry(event) {
  return {
    ...event,
    support: [...(event.support || [])],
    status: event.status || "unknown",
    ticketFrom: event.ticketUrl ? event.source : null,
    sources: [event.source]
  };
}

function matchesAny(text, patterns) {
  const value = normalize(text);
  return (patterns || []).some(pattern => new RegExp(pattern, "i").test(value));
}

function finalize(entry) {
  const family = entry.family || (entry.genre ? familyOf(entry.genre) : "Metal");
  const result = {
    id: `${entry.date}-${venueKey(entry.venue)}-${slug(entry.artist)}`.slice(0, 120),
    date: entry.date,
    time: entry.time || null,
    artist: entry.artist,
    support: entry.support || [],
    venue: entry.venue,
    city: entry.city,
    country: entry.country || countryOf(entry.city, entry.venue),
    genre: entry.genre || null,
    family,
    price: entry.price || null,
    status: entry.status || "unknown",
    ticketUrl: entry.ticketUrl || null,
    sourceUrl: entry.sourceUrl || null,
    sources: [...entry.sources].sort()
  };
  return result;
}

async function main() {
  const today = todayInParis();
  const previous = await readJson(OUTPUT, { events: [], sources: [] });
  const overrides = await readJson(OVERRIDES, {});

  const results = await Promise.all(SOURCES.map(async source => {
    try {
      const events = (await source.fetch()).map(event => ({ ...event, source: source.id }));
      return { id: source.id, label: source.label, ok: true, count: events.length, events };
    } catch (error) {
      return { id: source.id, label: source.label, ok: false, count: 0, error: String(error.message || error), events: [] };
    }
  }));

  const upcoming = results.flatMap(result => result.events).filter(event => event.date >= today);
  const includeTitles = overrides.includeTitles || {};
  const isBase = event => event.metal === true || matchesAny(event.title || event.artist, includeTitles[event.source]);
  const base = upcoming.filter(isBase);
  const enrichers = upcoming.filter(event => !isBase(event) && event.metal !== false);

  const merged = [];
  for (const event of base) {
    const existing = merged.find(entry => sameShow(entry, event));
    if (existing) mergeInto(existing, event);
    else merged.push(toEntry(event));
  }

  for (const added of overrides.add || []) {
    if (added.date < today) continue;
    const located = canonicalVenue(added.venue, added.city);
    const event = { ...added, ...located, city: added.city || located.city, source: "manuel" };
    const existing = merged.find(entry => sameShow(entry, event));
    if (existing) mergeInto(existing, event);
    else merged.push(toEntry(event));
  }

  const slot = event => `${event.date}|${venueKey(event.venue)}`;
  const unmatched = [];
  for (const event of enrichers) {
    let target = merged.find(entry => sameShow(entry, event));
    if (!target) {
      const sameSlot = merged.filter(entry => slot(entry) === slot(event));
      const rivals = enrichers.filter(other => other.source === event.source && slot(other) === slot(event));
      if (sameSlot.length === 1 && rivals.length === 1) target = sameSlot[0];
    }
    if (target) mergeInto(target, event);
    else unmatched.push(event);
  }

  const genreCache = await loadCache(GENRE_CACHE);
  const venueTaggedOnly = entry => entry.sources.every(source => !CURATED_SOURCES.has(source))
    && !matchesAny(entry.title || entry.artist, includeTitles[entry.sources[0]]);
  const toCheck = merged.filter(venueTaggedOnly);
  const lookupStats = await resolveGenres([...toCheck, ...unmatched].map(event => event.artist), genreCache, {
    today,
    maxLookups: Number(process.env.MUSICBRAINZ_MAX_LOOKUPS || 250)
  });
  await saveCache(GENRE_CACHE, genreCache);
  for (const entry of toCheck) {
    const found = lookup(genreCache, entry.artist);
    if (found && !found.metal) merged.splice(merged.indexOf(entry), 1);
    else if (found && (!entry.genre || /^(heavy|metal|hard (and|&) heavy)$/i.test(entry.genre.trim()))) {
      entry.genre = found.genre;
      entry.family = found.family;
    }
  }
  for (const event of unmatched) {
    const found = lookup(genreCache, event.artist);
    if (!found || !found.metal) continue;
    const promoted = { ...event, genre: event.genre || found.genre, family: event.family || found.family, metal: true };
    const existing = merged.find(entry => sameShow(entry, promoted));
    if (existing) mergeInto(existing, promoted);
    else merged.push(toEntry(promoted));
  }

  const failed = new Set(results.filter(result => !result.ok).map(result => result.id));
  for (const old of previous.events || []) {
    if (old.date < today || !old.sources.some(source => failed.has(source))) continue;
    if (merged.some(entry => sameShow(entry, old))) continue;
    merged.push({ ...old, sources: [...old.sources] });
  }

  const excluded = overrides.exclude || [];
  const events = merged
    .filter(entry => !matchesAny(entry.artist, excluded))
    .map(finalize)
    .map(event => ({ ...event, ...((overrides.patch || {})[event.id] || {}) }))
    .sort((left, right) => `${left.date}${left.time || ""}${left.artist}`.localeCompare(`${right.date}${right.time || ""}${right.artist}`));

  const seen = new Set();
  for (const event of events) {
    let id = event.id;
    for (let suffix = 2; seen.has(id); suffix++) id = `${event.id}-${suffix}`;
    event.id = id;
    seen.add(id);
  }

  const sources = results.map(({ id, label, ok, count, error }) => ({ id, label, ok, count, ...(error ? { error } : {}) }));
  const unchanged = JSON.stringify(events) === JSON.stringify(previous.events)
    && JSON.stringify(sources.map(({ id, ok }) => ({ id, ok }))) === JSON.stringify((previous.sources || []).map(({ id, ok }) => ({ id, ok })));

  for (const result of results) {
    const line = `${result.ok ? "ok " : "KO "} ${result.label.padEnd(22)} ${String(result.count).padStart(4)} événements${result.error ? `  ${result.error}` : ""}`;
    console.log(line);
    if (!result.ok && process.env.GITHUB_ACTIONS) console.log(`::warning title=Source ${result.label}::${result.error}`);
  }
  console.log(`MusicBrainz : ${lookupStats.looked} recherches sur ${lookupStats.pending} groupes inconnus, ${lookupStats.failures} échecs`);
  console.log(`${events.length} concerts metal à venir${unchanged ? " (aucun changement)" : ""}`);

  if (results.every(result => !result.ok)) {
    console.error("Toutes les sources ont échoué : concerts.json n'est pas modifié.");
    process.exitCode = 1;
    return;
  }
  if (unchanged) return;

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify({ updatedAt: new Date().toISOString(), sources, events }, null, 2) + "\n");
}

await main();

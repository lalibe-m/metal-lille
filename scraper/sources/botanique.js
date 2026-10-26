import * as cheerio from "cheerio";
import { fetchText, cleanSpaces, formatTime, formatPrice, safeUrl, frenchMonthIndex, isoDate, todayInParis } from "../lib.js";
import { isMetalGenre, familyOf } from "../genres.js";

const BASE = "https://botanique.be";
const LISTING_URLS = [`${BASE}/fr/calendar`, `${BASE}/fr/just-confirmed`];
const CRAWL_DELAY_MS = 10000;
const MAX_DETAIL_PAGES = 10;
const ROOMS = /orangerie|rotonde|museum|witloof|grand salon|chapiteau|serres|botanique|atelier/i;

export default {
  id: "botanique",
  label: "Botanique",
  async fetch() {
    const today = todayInParis();
    const byUrl = new Map();
    for (const [index, url] of LISTING_URLS.entries()) {
      if (index > 0) await pause();
      for (const event of parseListing(await fetchText(url))) byUrl.set(event.sourceUrl, event);
    }
    const events = [...byUrl.values()].filter(event => event.date >= today).sort((left, right) => left.date.localeCompare(right.date));
    if (events.length === 0) throw new Error(`aucun concert lu sur ${LISTING_URLS.join(", ")}`);

    for (const event of events.filter(event => event.status !== "cancelled").slice(0, MAX_DETAIL_PAGES)) {
      await pause();
      try {
        Object.assign(event, parseDetail(await fetchText(event.sourceUrl, { retries: 0 }), event));
      } catch {
        continue;
      }
    }
    return events;
  }
};

function pause() {
  return new Promise(resolve => setTimeout(resolve, CRAWL_DELAY_MS));
}

function parseListing(html) {
  const $ = cheerio.load(html);
  const events = [];
  $(".node-type-event.event-type-concert").each((index, node) => {
    const item = $(node);
    const start = item.find(".node-type-event__startdate").first();
    const day = Number(cleanSpaces(start.find(".node-date__day").text()));
    const monthIndex = frenchMonthIndex(cleanSpaces(start.find(".node-date__month").text()));
    const year = Number(cleanSpaces(start.find(".node-date__year").text()));
    const sourceUrl = safeUrl(item.attr("about") || item.find("a[rel=bookmark]").attr("href"), BASE);
    if (!day || monthIndex < 0 || !year || !sourceUrl) return;

    const rawTitle = cleanSpaces(item.find(".node-type-event__title h2").first().text());
    const { title, status: titleStatus } = splitStatus(rawTitle);
    const [artist, ...support] = splitArtists(title);
    const rooms = item.find(".location-list li").map((roomIndex, room) => cleanSpaces($(room).text())).get();
    const statusText = cleanSpaces(item.find(".node-type-event__status").text());
    const outside = rooms.find(room => !ROOMS.test(room));

    events.push({
      date: isoDate(year, monthIndex, day),
      time: null,
      artist: artist || title,
      support,
      venue: outside || "Botanique",
      city: "Bruxelles",
      genre: null,
      family: null,
      price: null,
      status: titleStatus || statusOf(statusText),
      ticketUrl: sourceUrl,
      sourceUrl,
      metal: null,
      title: rawTitle
    });
  });
  return events;
}

function splitStatus(rawTitle) {
  const parts = rawTitle.split(/\s*\|\s*/);
  const flag = parts.length > 1 ? parts[parts.length - 1] : "";
  const status = /annul|cancel/i.test(flag) ? "cancelled" : /report|postpon/i.test(flag) ? "postponed" : /complet|sold ?out/i.test(flag) ? "soldout" : null;
  return { title: status ? parts.slice(0, -1).join(" | ") : rawTitle, status };
}

function splitArtists(title) {
  const lineup = title.includes(" : ") ? title.slice(title.indexOf(" : ") + 3) : title;
  return lineup
    .replace(/\s*&\s*(many )?more\s*$/i, "")
    .split(/\s+[-+]\s+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function statusOf(text) {
  if (/complet|sold ?out/i.test(text)) return "soldout";
  if (/annul|cancel/i.test(text)) return "cancelled";
  if (/report|postpon/i.test(text)) return "postponed";
  return /ticket/i.test(text) ? "onsale" : "unknown";
}

function parseDetail(html, event) {
  const $ = cheerio.load(html);
  const genres = genresOf(html);
  const genre = genres.join(" / ");
  const isMetal = genres.some(isMetalGenre);
  const prices = $(".pricing-details__costs").map((index, node) => ({
    label: cleanSpaces($(node).clone().children().remove().end().text()),
    amount: cleanSpaces($(node).find(".pricing-details__amount").text())
  })).get().filter(price => price.amount);
  const price = prices.find(entry => /^ticket/i.test(entry.label)) || prices[0];
  const doors = cleanSpaces($(".node-type-event__doors span").first().text());
  return {
    time: formatTime(doors) || event.time,
    genre: genre || event.genre,
    family: isMetal ? familyOf(genres.filter(isMetalGenre).join(" ")) : null,
    metal: isMetal ? true : null,
    price: price ? formatPrice(`${price.amount} €`) : event.price
  };
}

function genresOf(html) {
  const match = html.match(/"entityTaxonomy":(\{.*?\}\}),"userUid"/);
  if (!match) return [];
  try {
    return Object.values(JSON.parse(match[1]).genre || {}).map(cleanSpaces).filter(Boolean);
  } catch {
    return [];
  }
}

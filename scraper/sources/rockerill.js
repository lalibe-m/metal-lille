import * as cheerio from "cheerio";
import { fetchText, cleanSpaces, formatTime, formatPrice, safeUrl } from "../lib.js";
import { isMetalGenre, isMetalLineup, familyOf } from "../genres.js";

const BASE = "https://www.rockerill.com";
const AGENDA = `${BASE}/agenda/`;
const MAX_DETAILS = 14;

export default {
  id: "rockerill",
  label: "Rockerill",
  async fetch() {
    const html = await fetchText(AGENDA);
    const cards = parseCards(html);
    const events = parseJsonLd(html).map(item => toEvent(item, cards.get(item.url) || {}));
    if (events.length === 0) throw new Error(`aucun événement lu sur ${AGENDA}`);

    for (const event of events.slice(0, MAX_DETAILS)) {
      try {
        applyDetail(event, await fetchText(event.sourceUrl));
      } catch {
        continue;
      }
    }
    return events;
  }
};

function parseJsonLd(html) {
  const $ = cheerio.load(html);
  const items = [];
  $('script[type="application/ld+json"]').each((index, node) => {
    let data;
    try {
      data = JSON.parse($(node).text());
    } catch {
      return;
    }
    for (const element of [data].flat().flatMap(entry => entry.itemListElement || [entry])) {
      const item = element.item || element;
      if (item["@type"] === "Event" && item.startDate && item.url) items.push(item);
    }
  });
  return items;
}

function parseCards(html) {
  const $ = cheerio.load(html);
  const cards = new Map();
  $(".rk-card-event").each((index, node) => {
    const card = $(node);
    const href = safeUrl(card.find(".rk-card-title a").attr("href"), BASE);
    if (!href) return;
    const metas = card.find(".rk-meta-item").map((metaIndex, meta) => cleanSpaces($(meta).text())).get();
    cards.set(href, {
      opening: metas.find(meta => /^ouverture/i.test(meta)),
      presale: metas.find(meta => /^pr[ée]vente/i.test(meta)),
      text: cleanSpaces(card.text())
    });
  });
  return cards;
}

function toEvent(item, card) {
  const title = cleanSpaces(item.name);
  const performers = [item.performer || []].flat().map(performer => cleanSpaces(performer.name)).filter(Boolean);
  const [headliner, ...support] = performers.length ? performers : [title];
  const href = safeUrl(item.url, BASE);
  const offer = [item.offers || []].flat()[0] || {};
  return {
    date: String(item.startDate).slice(0, 10),
    time: formatTime((String(card.opening || "").match(/(\d{1,2}:\d{2})/) || [])[1]),
    artist: headliner,
    support,
    venue: "Rockerill",
    city: "Charleroi",
    genre: null,
    family: null,
    price: priceOf(card.presale, offer.price),
    status: statusOf(item, offer, card.text),
    ticketUrl: safeUrl(String(offer.url || "").trim().split(/\s+/)[0], BASE) || href,
    sourceUrl: href,
    metal: null,
    title
  };
}

function applyDetail(event, html) {
  const $ = cheerio.load(html);
  const bands = $(".rk-artist-card").map((index, node) => ({
    name: cleanSpaces($(node).find(".rk-artist-title").first().text()),
    genre: cleanSpaces($(node).find(".rk-artist-style").first().text()) || null
  })).get().filter(band => band.name);
  const withGenre = bands.filter(band => band.genre);
  if (withGenre.length > 0) {
    const metalBand = withGenre.find(band => isMetalGenre(band.genre));
    const isMetal = isMetalLineup(bands);
    event.genre = isMetal && metalBand ? metalBand.genre : withGenre[0].genre;
    event.family = isMetal ? familyOf(event.genre) : null;
    event.metal = isMetal ? true : null;
  }
  const place = $(".rk-zoom-metas span").filter((index, node) => /^lieu/i.test(cleanSpaces($(node).text()))).first();
  const placeName = cleanSpaces(place.text()).replace(/^lieu\s*:\s*/i, "");
  if (placeName && !/rockerill/i.test(placeName)) event.venue = placeName;
}

function priceOf(presale, offerPrice) {
  const text = cleanSpaces(String(presale || "").replace(/^pr[ée]vente\s*:\s*/i, ""));
  if (/gratuit|free/i.test(text)) return formatPrice("Gratuit");
  const amount = text.match(/(\d+(?:[.,]\d+)?)/);
  if (amount) return formatPrice(`${amount[1]} €`);
  if (offerPrice === undefined || offerPrice === null || offerPrice === "") return null;
  return Number(offerPrice) === 0 ? formatPrice("Gratuit") : formatPrice(`${offerPrice} €`);
}

function statusOf(item, offer, text) {
  const eventStatus = String(item.eventStatus || "");
  if (/Cancelled/i.test(eventStatus) || /annul[ée]/i.test(text)) return "cancelled";
  if (/Postponed|Rescheduled/i.test(eventStatus) || /report[ée]/i.test(text)) return "postponed";
  if (/SoldOut/i.test(String(offer.availability || "")) || /sold ?out|complet/i.test(text)) return "soldout";
  if (/InStock|LimitedAvailability|PreOrder/i.test(String(offer.availability || ""))) return "onsale";
  return "unknown";
}

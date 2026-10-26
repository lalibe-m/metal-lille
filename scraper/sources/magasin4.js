import * as cheerio from "cheerio";
import { fetchText, cleanSpaces, formatTime, formatPrice, safeUrl, todayInParis } from "../lib.js";
import { isMetalGenre, familyOf } from "../genres.js";

const BASE = "https://www.magasin4.be";
const MAX_DETAIL_PAGES = 12;

export default {
  id: "magasin-4",
  label: "Magasin 4",
  async fetch() {
    const today = todayInParis();
    const currentYear = Number(today.slice(0, 4));
    const byUrl = new Map();
    for (const year of [currentYear, currentYear + 1]) {
      const html = await fetchText(`${BASE}/concerts?month=${year}-all`);
      for (const event of parseYear(html)) byUrl.set(event.sourceUrl, event);
    }
    const events = [...byUrl.values()].filter(event => event.date >= today).sort((left, right) => left.date.localeCompare(right.date));
    if (events.length === 0) throw new Error(`aucun événement lu sur ${BASE}/concerts`);

    const detailQueue = [...events.filter(event => event.metal), ...events.filter(event => !event.metal)].slice(0, MAX_DETAIL_PAGES);
    for (const event of detailQueue) {
      try {
        Object.assign(event, parseDetail(await fetchText(event.sourceUrl, { retries: 0 }), event));
      } catch {
        continue;
      }
    }
    return events;
  }
};

function parseYear(html) {
  const $ = cheerio.load(html);
  const events = [];
  $("a.event-item-link").each((index, node) => {
    const item = $(node);
    const sourceUrl = safeUrl(item.attr("href"), BASE);
    const dateMatch = cleanSpaces(item.find(".event-date").first().text()).match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!sourceUrl || !dateMatch) return;

    const genre = cleanSpaces(item.find(".event-genre").first().text());
    const name = cleanSpaces(item.find(".event-name").first().text());
    const artists = item.find(".event-artists .artist-accent-flyer").map((artistIndex, artist) => cleanSpaces($(artist).text())).get().filter(Boolean);
    const [headliner, ...support] = artists;
    const isMetal = isMetalGenre(genre);
    const cancelled = item.find("[class*=cancelled]").length > 0 || /\bcancell?ed\b|annul/i.test(name);
    const soldOut = item.find(".event-sold-out").length > 0;

    events.push({
      date: `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`,
      time: null,
      artist: headliner || name,
      support,
      venue: "Magasin 4",
      city: "Bruxelles",
      genre: genre ? capitalizeWords(genre) : null,
      family: isMetal ? familyOf(genre) : null,
      price: null,
      status: cancelled ? "cancelled" : soldOut ? "soldout" : "onsale",
      ticketUrl: sourceUrl,
      sourceUrl,
      metal: isMetal ? true : null,
      title: name || cleanSpaces(item.find(".event-artists").first().text())
    });
  });
  return events.filter(event => event.artist);
}

function parseDetail(html, event) {
  const $ = cheerio.load(html);
  const heading = cleanSpaces($(".event-date-main").first().text());
  const time = formatTime((heading.match(/:\s*(\d{1,2}:\d{2})/) || [])[1]);
  const prices = {};
  $(".detail-item").each((index, node) => {
    const label = cleanSpaces($(node).find(".detail-label").text()).replace(/:$/, "").toLowerCase();
    prices[label] = cleanSpaces($(node).find(".detail-value").text());
  });
  const ticketLink = $("a.detail-link--ticket").first();
  const ticketLabel = cleanSpaces(ticketLink.text());
  const price = prices.presale || prices["on site"] || (ticketLabel.match(/\d+(?:[.,]\d+)?\s*€/) || [])[0];
  const pageText = cleanSpaces($(".event-header").text());
  const update = {
    time: time || event.time,
    price: price ? formatPrice(price) : /free|gratuit/i.test(`${ticketLabel} ${pageText}`) ? "Gratuit" : event.price,
    ticketUrl: safeUrl(ticketLink.attr("href"), BASE) || event.ticketUrl
  };
  if (/sold ?out|complet/i.test(`${ticketLabel} ${pageText}`) && event.status === "onsale") update.status = "soldout";
  if (/\bcancell?ed\b|annul/i.test(pageText)) update.status = "cancelled";
  return update;
}

function capitalizeWords(text) {
  return text.toLowerCase().replace(/(^|[\s/(-])(\p{L})/gu, (match, separator, letter) => separator + letter.toUpperCase());
}

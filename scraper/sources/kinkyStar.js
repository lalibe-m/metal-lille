import * as cheerio from "cheerio";
import { fetchText, cleanSpaces, formatTime, formatPrice, safeUrl } from "../lib.js";
import { isMetalGenre, familyOf } from "../genres.js";

const BASE = "https://www.kinkystar.com";
const AGENDA = `${BASE}/nl`;
const MAX_PAGES = 10;

export default {
  id: "kinky-star",
  label: "Kinky Star",
  async fetch() {
    const events = [];
    const seen = new Set();
    let url = AGENDA;
    for (let page = 0; url && page < MAX_PAGES; page++) {
      const $ = cheerio.load(await fetchText(url));
      for (const event of parse($)) {
        if (seen.has(event.sourceUrl)) continue;
        seen.add(event.sourceUrl);
        events.push(event);
      }
      url = safeUrl($('nav[aria-label="Pagination"] a[aria-label="Volgende"]').attr("href"), BASE);
    }
    if (events.length === 0) throw new Error(`aucun événement lu sur ${AGENDA}`);
    return events;
  }
};

function parse($) {
  const events = [];
  $('main a[href*="/events/"]').each((index, node) => {
    const link = $(node);
    const href = safeUrl(link.attr("href"), BASE);
    const dateMatch = String(link.attr("href")).match(/\/events\/(\d{4}-\d{2}-\d{2})-/);
    if (!href || !dateMatch) return;
    const card = link.closest("article").length ? link.closest("article") : link;
    const title = cleanSpaces(card.find("h2").first().text()) || cleanSpaces(link.text());
    if (!title) return;

    const meta = cleanSpaces(card.find("p").filter((pIndex, paragraph) => /\d{4}/.test($(paragraph).text())).first().text());
    const tags = card.find("span").map((spanIndex, span) => $(span)).get();
    const genres = tags.filter(span => /bg-ks-surface/.test(span.attr("class") || "")).map(span => cleanSpaces(span.text())).filter(genre => genre && !/^partner$/i.test(genre));
    const location = tags.filter(span => span.find("svg").length > 0).map(span => cleanSpaces(span.text())).find(Boolean);
    const metalGenres = genres.filter(genre => isMetalGenre(genre));
    const isMetal = metalGenres.length > 0;
    const { headliner, support } = splitLineup(title);

    events.push({
      date: dateMatch[1],
      time: formatTime((meta.match(/-\s*(\d{1,2}:\d{2})/) || [])[1]),
      artist: headliner,
      support,
      venue: location || "Kinky Star",
      city: "Gent",
      genre: genres.length ? genres.join(" / ") : null,
      family: isMetal ? familyOf(metalGenres.join(" ")) : null,
      price: priceOf(meta),
      status: statusOf(`${title} ${meta}`),
      ticketUrl: href,
      sourceUrl: href,
      metal: isMetal ? true : null,
      title
    });
  });
  return events;
}

function splitLineup(title) {
  const colonIndex = title.indexOf(": ");
  const lineup = colonIndex > 0 && /\+|\([A-Z]{2,3}(\/[A-Z]{2,3})?\)/.test(title.slice(colonIndex + 2)) ? title.slice(colonIndex + 2) : title;
  const names = lineup.split(/\s+\+\s+/)
    .map(part => cleanSpaces(part.replace(/\[[^\]]*\]/g, " ").replace(/\((?:[A-Z]{2,3}(?:\/[A-Z]{2,3})*)\)/g, " ")))
    .filter(name => /[\p{L}\d]/u.test(name) &&!/^(tba|tbc|tbd)$/i.test(name));
  return { headliner: names[0] || title, support: names.slice(1) };
}

function priceOf(meta) {
  const priceText = (meta.split("·")[1] || "").trim();
  if (!priceText) return null;
  if (/gratis|free/i.test(priceText)) return formatPrice("Gratuit");
  const amounts = priceText.match(/\d+(?:[.,]\d+)?/g);
  return amounts ? formatPrice(`${amounts.join(" / ")} €`) : formatPrice(priceText);
}

function statusOf(text) {
  if (/uitverkocht|sold ?out/i.test(text)) return "soldout";
  if (/geannuleerd|afgelast|cancel/i.test(text)) return "cancelled";
  if (/uitgesteld|postponed/i.test(text)) return "postponed";
  return "onsale";
}

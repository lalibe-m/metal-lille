import * as cheerio from "cheerio";
import { fetchText, cleanSpaces, frenchMonthIndex, isoDate, formatTime, safeUrl } from "../lib.js";
import { isMetalGenre, familyOf } from "../genres.js";

function createSource({ id, label, base, venue, city, itemSelector }) {
  return {
    id,
    label,
    async fetch() {
      const events = [];
      for (let page = 0; page < 12; page++) {
        const html = await fetchText(`${base}/agenda${page ? `?page=${page}` : ""}`);
        const found = parse(html, { base, venue, city, itemSelector });
        if (found.length === 0) break;
        events.push(...found);
      }
      if (events.length === 0) throw new Error(`aucun événement lu sur ${base}/agenda`);
      return events;
    }
  };
}

function parse(html, { base, venue, city, itemSelector }) {
  const $ = cheerio.load(html);
  const events = [];
  $(itemSelector).each((index, node) => {
    const item = $(node);
    const dateNode = item.find(".evt-date").first();
    const day = Number(dateNode.attr("data-day"));
    const monthIndex = frenchMonthIndex(dateNode.attr("data-month"));
    const year = Number(dateNode.attr("data-year"));
    if (!day || monthIndex < 0 || !year) return;

    const link = item.is("a") ? item : item.find("a[href]").first();
    const href = safeUrl(link.attr("href"), base);
    const title = cleanSpaces(item.find("h2, h3, .agenda--title").first().text());
    const subtitle = cleanSpaces(item.find("h2 + p, h3 + p, .agenda--subtitle").first().text());
    const terms = item.find("[data-term-name]").map((termIndex, term) => $(term).attr("data-term-name")).get();
    const genreTerms = terms.filter(term => isMetalGenre(term));
    const text = cleanSpaces(item.text());
    const support = subtitle.replace(/^\+\s*/, "").split(/\s*[+,&]\s*/).map(part => part.trim()).filter(part => part && !/premi[eè]re partie/i.test(part));
    const isMetal = genreTerms.length > 0;

    events.push({
      date: isoDate(year, monthIndex, day),
      time: formatTime(cleanSpaces(item.find(".evt-date-hour").first().text())),
      artist: title || cleanSpaces(link.attr("aria-label")).split(",")[0],
      support,
      venue,
      city,
      genre: isMetal ? capitalize(genreTerms.join(" / ")) : null,
      family: isMetal ? familyOf(genreTerms.join(" ")) : null,
      price: null,
      status: /\bcomplet\b|sold ?out/i.test(text) ? "soldout" : /annul/i.test(text) ? "cancelled" : /report/i.test(text) ? "postponed" : "onsale",
      ticketUrl: href,
      sourceUrl: href,
      metal: isMetal ? true : null,
      title
    });
  });
  return events;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const aeronef = createSource({
  id: "aeronef",
  label: "L'Aéronef",
  base: "https://aeronef.fr",
  venue: "L'Aéronef",
  city: "Lille",
  itemSelector: ".agenda--item-container"
});

export const grandMix = createSource({
  id: "grand-mix",
  label: "Le Grand Mix",
  base: "https://www.legrandmix.com",
  venue: "Le Grand Mix",
  city: "Tourcoing",
  itemSelector: '.views-row[data-node-type="evenement"]'
});

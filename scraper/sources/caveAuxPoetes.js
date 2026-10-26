import * as cheerio from "cheerio";
import { fetchText, cleanSpaces, frenchMonthIndex, isoDate, safeUrl } from "../lib.js";
import { canonicalVenue } from "../venues.js";
import { isMetalGenre, familyOf } from "../genres.js";

const URL = "https://caveauxpoetes.com/agenda/";

export default {
  id: "cave-aux-poetes",
  label: "La Cave aux Poètes",
  async fetch() {
    const events = parse(await fetchText(URL));
    if (events.length === 0) throw new Error("aucun événement lu sur l'agenda");
    return events;
  }
};

export function parse(html) {
  const $ = cheerio.load(html);
  const events = [];
  $("a.unevt").each((index, node) => {
    const item = $(node);
    const dateMatch = cleanSpaces(item.find("#ladateevtprog, .ladateevtprog").first().text()).match(/(\d{1,2})\s+([a-zéû]+)\s+(\d{4})/i);
    if (!dateMatch) return;
    const monthIndex = frenchMonthIndex(dateMatch[2]);
    if (monthIndex < 0) return;

    const genre = cleanSpaces(item.find("#legenreevt, .legenreevt").first().text());
    const place = cleanSpaces(item.find(".lelieuevtprog").first().text());
    const located = place ? canonicalVenue(place, "Roubaix") : { venue: "La Cave aux Poètes", city: "Roubaix" };
    const title = cleanSpaces(item.find(".titartprog, .titevtprog").first().text());
    const [headliner, ...support] = title.split(/\s+[+&]\s+/).map(part => part.trim()).filter(Boolean);
    const href = safeUrl(item.attr("href"), URL);
    const isMetal = isMetalGenre(genre);

    events.push({
      date: isoDate(Number(dateMatch[3]), monthIndex, Number(dateMatch[1])),
      time: null,
      artist: headliner || title,
      support,
      venue: located.venue,
      city: located.city || "Roubaix",
      genre: genre || null,
      family: isMetal ? familyOf(genre) : null,
      price: null,
      status: /complet/i.test(item.text()) ? "soldout" : "onsale",
      ticketUrl: href,
      sourceUrl: href,
      metal: isMetal ? true : null,
      title
    });
  });
  return events;
}

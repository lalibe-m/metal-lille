import * as cheerio from "cheerio";
import { fetchText, cleanSpaces, normalize, safeUrl, isAffiliateUrl } from "../lib.js";
import { canonicalVenue, isInArea } from "../venues.js";
import { isMetalLineup, familyOf } from "../genres.js";

const URL = "https://lille.concerts-metal.com/";

const STATUS = {
  EventCancelled: "cancelled",
  EventPostponed: "postponed",
  EventRescheduled: "postponed"
};

export default {
  id: "concerts-metal",
  label: "concerts-metal.com",
  async fetch() {
    const html = await fetchText(URL);
    return parse(html);
  }
};

export function parse(html) {
  const events = [];
  const marker = '<div itemscope itemtype="https://schema.org/MusicEvent">';
  html.split(marker).slice(1).forEach(chunk => {
    const $ = cheerio.load(`<div id="event">${chunk.replace(/<\/?(table|thead|tbody|tr|td)\b[^>]*>/gi, " ")}</div>`, null, false);
    const item = $("#event");
    const meta = name => item.find(`meta[itemprop="${name}"]`).first().attr("content");
    const location = item.find('[itemprop="location"]').first();
    const rawVenue = location.find('meta[itemprop="name"]').attr("content");
    const locality = location.find('meta[itemprop="addressLocality"]').attr("content");
    const date = meta("startDate");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

    const { venue, city } = canonicalVenue(cleanSpaces(rawVenue).replace(/\\'/g, "'"), locality);
    if (!isInArea(city, venue)) return;

    const bands = [];
    item.find("b").each((bandIndex, bold) => {
      const name = cleanSpaces($(bold).text());
      const genre = cleanSpaces($(bold).next("i").text());
      if (name) bands.push({ name, genre });
    });
    const eventName = cleanSpaces(item.children('meta[itemprop="name"]').attr("content") || meta("name"));
    const status = STATUS[(meta("eventStatus") || "").split("/").pop()] || "unknown";
    const links = item.find("a").map((linkIndex, link) => $(link).attr("href")).get();
    const pageUrl = safeUrl(links.find(href => /concerts-metal\.com\/concert_/.test(href || "")));
    const ticketUrl = safeUrl(links.find(href => /ticket|billet/i.test(href || "") && !isAffiliateUrl(href)));

    const headliner = pickHeadliner(eventName, bands);
    const metal = bands.length ? isMetalLineup(bands) : null;
    const title = stripTour(eventName);
    const namedInTitle = headliner && normalize(eventName).includes(normalize(headliner.name));
    const useTitle = !namedInTitle && title && !/tour|fest|release|show|#|\d{4}/i.test(title);
    const tribute = /tribute/i.test(`${eventName} ${bands.map(band => `${band.name} ${band.genre}`).join(" ")}`);
    const genre = headliner && headliner.genre ? headliner.genre : null;
    events.push({
      date,
      time: null,
      artist: useTitle ? title : headliner ? headliner.name : title,
      support: bands.filter(band => useTitle || band !== headliner).map(band => band.name).filter(name => !useTitle || !/tribute/i.test(name)),
      venue,
      city,
      genre: tribute && genre && !/tribute/i.test(genre) ? `Tribute · ${genre}` : genre,
      family: tribute ? "Tributes" : genre ? familyOf(genre) : null,
      price: null,
      status,
      ticketUrl,
      sourceUrl: pageUrl || URL,
      metal
    });
  });
  return events;
}

function stripTour(name) {
  return name.replace(/\s+-\s+.*$/, "").replace(/\s+@\s+.*$/, "").trim();
}

function pickHeadliner(eventName, bands) {
  if (bands.length === 0) return null;
  const title = normalize(eventName);
  let best = null;
  let bestIndex = Infinity;
  for (const band of bands) {
    const key = normalize(band.name);
    if (!key) continue;
    const position = title.indexOf(key);
    if (position >= 0 && position < bestIndex) {
      best = band;
      bestIndex = position;
    }
  }
  return best || bands[0];
}

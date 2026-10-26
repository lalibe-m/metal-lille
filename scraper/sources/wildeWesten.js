import * as cheerio from "cheerio";
import { fetchText, cleanSpaces, formatPrice, safeUrl } from "../lib.js";
import { familyOf } from "../genres.js";

const BASE = "https://www.wildewesten.be";
const AGENDA = `${BASE}/nl/agenda`;
const METAL_AGENDA = `${AGENDA}?genres%5B%5D=hard-heavy`;
const METAL_GENRE = "Hard & Heavy";
const MAX_AGENDA_PAGES = 8;
const MAX_METAL_PAGES = 3;
const MAX_DETAILS = 8;

export default {
  id: "wilde-westen",
  label: "Wilde Westen (De Kreun)",
  async fetch() {
    const events = await readAgenda(AGENDA, MAX_AGENDA_PAGES);
    if (events.length === 0) throw new Error(`aucun événement lu sur ${AGENDA}`);

    const metalEvents = await readAgenda(METAL_AGENDA, MAX_METAL_PAGES);
    const byUrl = new Map(events.map(event => [event.sourceUrl, event]));
    for (const metalEvent of metalEvents) {
      const event = byUrl.get(metalEvent.sourceUrl) || metalEvent;
      if (!byUrl.has(event.sourceUrl)) {
        byUrl.set(event.sourceUrl, event);
        events.push(event);
      }
      event.genre = METAL_GENRE;
      event.family = familyOf(METAL_GENRE);
      event.metal = true;
    }

    for (const event of events.filter(candidate => candidate.metal).slice(0, MAX_DETAILS)) {
      try {
        Object.assign(event, parseDetail(await fetchText(event.sourceUrl), event));
      } catch {
        continue;
      }
    }
    return events;
  }
};

async function readAgenda(firstUrl, maxPages) {
  const events = [];
  let url = firstUrl;
  for (let page = 0; url && page < maxPages; page++) {
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    events.push(...parseAgenda($));
    url = safeUrl($("[data-pagination-next]").attr("href"), BASE);
  }
  return events;
}

function parseAgenda($) {
  const events = [];
  $("section.events").each((sectionIndex, section) => {
    const yearMatch = cleanSpaces($(section).find(".events__title").first().text()).match(/\b(20\d{2})\b/);
    if (!yearMatch) return;
    $(section).find("a.events__item").each((itemIndex, node) => {
      const item = $(node);
      const dayMatch = cleanSpaces(item.find(".events__item__date").text()).match(/(\d{1,2})\.(\d{1,2})/);
      if (!dayMatch) return;
      const title = cleanSpaces(item.find(".events__item__title").text());
      if (!title) return;
      const [headliner, ...support] = title.split(/\s+\+\s+/).map(part => titleCase(part.trim())).filter(Boolean);
      const href = safeUrl(item.attr("href"), BASE);
      events.push({
        date: `${yearMatch[1]}-${dayMatch[2].padStart(2, "0")}-${dayMatch[1].padStart(2, "0")}`,
        time: null,
        artist: headliner || titleCase(title),
        support,
        venue: "Wilde Westen",
        city: "Kortrijk",
        genre: null,
        family: null,
        price: null,
        status: statusOf(cleanSpaces(item.find(".events__item__status").text())),
        ticketUrl: href,
        sourceUrl: href,
        metal: null,
        title
      });
    });
  });
  return events;
}

function parseDetail(html, event) {
  const $ = cheerio.load(html);
  const details = {};
  const location = cleanSpaces($(".event-sticky__location").first().text());
  if (location) details.venue = /kreun/i.test(location) ? "De Kreun" : location;
  const start = html.match(/"startDate"\s*:\s*"(\d{4}-\d{2}-\d{2})[^"]*?(\d{2}:\d{2})/);
  const end = html.match(/"endDate"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
  const severalDays = start && end && end[1] !== start[1];
  details.time = start && !severalDays ? start[2] : event.time;
  const amount = cleanSpaces($(".event-sticky__price").first().text()).match(/(\d+(?:[.,]\d+)?)/);
  if (amount) details.price = formatPrice(`${amount[1]} €`);
  const ticket = safeUrl($("a.event-sticky__button").first().attr("href"), BASE);
  if (ticket) details.ticketUrl = ticket;
  if (/EventCancelled/.test(html)) details.status = "cancelled";
  else if (/EventPostponed|EventRescheduled/.test(html)) details.status = "postponed";
  return details;
}

function statusOf(text) {
  if (/uitverkocht|sold ?out|complet/i.test(text)) return "soldout";
  if (/geannuleerd|afgelast|annul/i.test(text)) return "cancelled";
  if (/uitgesteld|verplaatst|report/i.test(text)) return "postponed";
  if (/koop|ticket|gratis|acheter/i.test(text)) return "onsale";
  return "unknown";
}

function titleCase(text) {
  if (text !== text.toUpperCase()) return text;
  return text.toLowerCase().replace(/(^|[\s\-–(/.&])(\p{L})/gu, (match, separator, letter) => separator + letter.toUpperCase());
}

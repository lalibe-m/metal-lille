import * as cheerio from "cheerio";
import { fetchText, cleanSpaces, formatPrice, safeUrl, frenchMonthIndex, isoDate, todayInParis } from "../lib.js";
import { isMetalGenre, familyOf } from "../genres.js";

const BASE = "https://www.abconcerts.be";
const CALENDAR_URL = `${BASE}/fr/ical`;
const METAL_TAG = "Heavy";
const TAGGED_AGENDA_URL = `${BASE}/fr/agenda?genres%5B0%5D=${METAL_TAG}`;
const MAX_AGENDA_PAGES = 8;
const VENUE = "Ancienne Belgique";
const BRUSSELS_COMMUNES = {
  1000: "Bruxelles", 1030: "Schaerbeek", 1040: "Etterbeek", 1050: "Ixelles", 1060: "Saint-Gilles",
  1070: "Anderlecht", 1080: "Molenbeek", 1081: "Koekelberg", 1180: "Uccle", 1190: "Forest"
};

export default {
  id: "ancienne-belgique",
  label: "Ancienne Belgique",
  async fetch() {
    const today = todayInParis();
    const calendarEvents = parseCalendar(await fetchText(CALENDAR_URL)).filter(event => event.date >= today);
    if (calendarEvents.length === 0) throw new Error(`aucun événement lu sur ${CALENDAR_URL}`);

    const taggedCards = await fetchTaggedCards();
    if (taggedCards.size > calendarEvents.length / 2) throw new Error(`le filtre de genre ${METAL_TAG} semble ignoré par l'agenda`);
    if (!isMetalGenre(METAL_TAG)) throw new Error(`le genre ${METAL_TAG} n'est plus reconnu comme metal`);

    const events = calendarEvents.map(event => {
      const card = taggedCards.get(eventKey(event.sourceUrl));
      if (!card) return event;
      taggedCards.delete(eventKey(event.sourceUrl));
      const merged = {
        ...event,
        support: card.support.length ? card.support : event.support,
        price: event.price || card.price,
        status: event.status === "unknown" ? card.status : event.status
      };
      return card.isShow ? markMetal(merged) : merged;
    });
    for (const card of taggedCards.values()) {
      if (card.date >= today) events.push(card.isShow ? markMetal(card.event) : card.event);
    }
    return events;
  }
};

function markMetal(event) {
  return { ...event, genre: METAL_TAG, family: familyOf(METAL_TAG), metal: true };
}

function eventKey(url) {
  const match = String(url || "").match(/\/agenda\/[^/]+\/([A-Za-z0-9]+)/);
  return match ? match[1] : url;
}

function parseCalendar(text) {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  return unfolded.split("BEGIN:VEVENT").slice(1).map(block => {
    const fields = {};
    for (const line of block.split(/\r?\n/)) {
      const match = line.match(/^([A-Z-]+)(?:;[^:]*)?:(.*)$/);
      if (match && !(match[1] in fields)) fields[match[1]] = unescapeText(match[2]);
    }
    return fields;
  }).filter(fields => fields.DTSTART && fields.SUMMARY).map(toCalendarEvent).filter(Boolean);
}

function unescapeText(value) {
  return value.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
}

function toCalendarEvent(fields) {
  const start = parseCalendarDate(fields.DTSTART);
  if (!start) return null;
  const urls = String(fields.DESCRIPTION || "").match(/https?:\/\/\S+/g) || [];
  const sourceUrl = safeUrl(urls.find(url => url.includes("abconcerts.be")) || urls[0]);
  const location = parseLocation(fields.LOCATION);
  const rawTitle = cleanSpaces(fields.SUMMARY);
  const { title, status } = splitStatus(rawTitle);
  const [artist, ...support] = splitArtists(title);
  return {
    date: start.date,
    time: start.time,
    artist: artist || title,
    support,
    venue: location.venue,
    city: location.city,
    genre: null,
    family: null,
    price: null,
    status,
    ticketUrl: sourceUrl,
    sourceUrl,
    metal: null,
    title: rawTitle
  };
}

function parseCalendarDate(value) {
  const match = String(value || "").match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{2}(Z)?)?$/);
  if (!match) return null;
  if (!match[4]) return { date: `${match[1]}-${match[2]}-${match[3]}`, time: null };
  if (!match[6]) return { date: `${match[1]}-${match[2]}-${match[3]}`, time: `${match[4]}:${match[5]}` };
  const instant = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])));
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(instant).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function parseLocation(value) {
  const text = cleanSpaces(value);
  const match = text.match(/^(.*?)\s*\((.*)\)\s*$/);
  const name = match ? match[1] : text;
  const address = match ? match[2] : "";
  if (!name || /^AB\b/i.test(name) || /anspachlaan 110|boulevard anspach 110|steenstraat 11\b|rue des pierres 11\b/i.test(address)) {
    return { venue: VENUE, city: "Bruxelles" };
  }
  if (/^vk\b|vaartkapoen/i.test(name)) return { venue: "VK Concerts", city: "Molenbeek" };
  return { venue: name, city: communeOf(address) };
}

function communeOf(address) {
  const match = address.match(/\b(\d{4})\s+([^,]+)$/);
  if (!match) return "Bruxelles";
  const postalCode = Number(match[1]);
  if (BRUSSELS_COMMUNES[postalCode]) return BRUSSELS_COMMUNES[postalCode];
  if (postalCode >= 1000 && postalCode < 1300) return "Bruxelles";
  return match[2].trim();
}

function splitStatus(rawTitle) {
  let title = rawTitle;
  let status = "unknown";
  if (/^(cancell?ed|annul[ée]e?|geannuleerd)\b\s*[:!-]?\s*/i.test(title)) status = "cancelled";
  else if (/^(sold ?out|complet|uitverkocht)\b\s*[:!-]?\s*/i.test(title)) status = "soldout";
  else if (/^(postponed|report[ée]e?|uitgesteld)\b\s*[:!-]?\s*/i.test(title)) status = "postponed";
  title = title
    .replace(/^(cancell?ed|annul[ée]e?|geannuleerd|sold ?out|complet|uitverkocht|postponed|report[ée]e?|uitgesteld|new date|nouvelle date|nieuwe datum)\b\s*[:!-]?\s*/i, "")
    .replace(/\s*@\s*[^@+]+$/, "")
    .replace(/^(double|triple) bill\s*:\s*/i, "")
    .replace(/^AB x [^:]+:\s*/i, "");
  return { title: title.trim(), status };
}

function splitArtists(title) {
  return title.split(/\s+\+\s+/).map(part => part.trim()).filter(Boolean);
}

async function fetchTaggedCards() {
  const cards = new Map();
  let url = TAGGED_AGENDA_URL;
  for (let page = 0; url && page < MAX_AGENDA_PAGES; page++) {
    const $ = cheerio.load(await fetchText(url));
    $("a.content-card").each((index, node) => {
      const card = parseCard($, $(node));
      if (card) cards.set(eventKey(card.event.sourceUrl), card);
    });
    const next = $("a[data-pagination-next]").attr("href");
    url = next ? safeUrl(next, BASE) : null;
  }
  return cards;
}

function parseCard($, item) {
  const sourceUrl = safeUrl(item.attr("href"), BASE);
  const label = cleanSpaces(item.find(".content-card__media__label").text());
  const dateMatch = label.match(/(\d{1,2})\s+([a-zéèûô.]+)\s+'(\d{2})/i);
  if (!sourceUrl || !dateMatch) return null;
  const monthIndex = frenchMonthIndex(dateMatch[2]);
  if (monthIndex < 0) return null;

  const titleNode = item.find(".content-card__title").first();
  const supportText = cleanSpaces(titleNode.find("em").text()).replace(/^\+\s*/, "");
  const title = cleanSpaces(titleNode.clone().children().remove().end().text()) || cleanSpaces(item.attr("title"));
  const [artist, ...titleSupport] = splitArtists(title);
  const support = [...titleSupport, ...supportText.split(/\s*,\s*/)].map(part => part.trim()).filter(Boolean);
  const ticketLabel = cleanSpaces(item.find(".content-card__info__ticketlink").text());
  const category = cleanSpaces(item.find(".content-card__info_event-category").text());
  const event = {
    date: isoDate(2000 + Number(dateMatch[3]), monthIndex, Number(dateMatch[1])),
    time: null,
    artist: artist || title,
    support,
    venue: VENUE,
    city: "Bruxelles",
    genre: null,
    family: null,
    price: /gratuit/i.test(ticketLabel) ? formatPrice("Gratuit") : null,
    status: statusOf(ticketLabel),
    ticketUrl: sourceUrl,
    sourceUrl,
    metal: null,
    title
  };
  return {
    event,
    support: event.support,
    price: event.price,
    status: event.status,
    date: event.date,
    isShow: !category || /concert|festival|live|showcase/i.test(category)
  };
}

function statusOf(label) {
  if (/complet|sold ?out|uitverkocht/i.test(label)) return "soldout";
  if (/annul|cancel|geannuleerd/i.test(label)) return "cancelled";
  if (/report|postpon|uitgesteld/i.test(label)) return "postponed";
  return label ? "onsale" : "unknown";
}

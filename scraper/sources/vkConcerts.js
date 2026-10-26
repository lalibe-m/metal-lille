import * as cheerio from "cheerio";
import { fetchText, cleanSpaces, formatTime, formatPrice, safeUrl, todayInParis } from "../lib.js";
import { isMetalGenre, familyOf } from "../genres.js";

const BASE = "https://www.vaartkapoen.be";
const LISTING_URL = `${BASE}/en/VKconcerts`;
const CRAWL_DELAY_MS = 5000;
const MAX_DETAIL_PAGES = 12;
const STATUS_FLAG = /^\[?\s*(cancell?ed|geannuleerd|annul[ée]e?|postponed|uitgesteld|report[ée]e?|sold ?out|uitverkocht|complet)\s*\]?\s*[:!-]?\s*/i;

export default {
  id: "vk-concerts",
  label: "VK Concerts",
  async fetch() {
    const today = todayInParis();
    const events = parseListing(await fetchText(LISTING_URL)).filter(event => event.date >= today);
    if (events.length === 0) throw new Error(`aucun concert lu sur ${LISTING_URL}`);

    const detailQueue = [...events.filter(event => event.metal), ...events.filter(event => !event.metal)]
      .filter(event => event.status !== "cancelled")
      .slice(0, MAX_DETAIL_PAGES);
    for (const event of detailQueue) {
      await new Promise(resolve => setTimeout(resolve, CRAWL_DELAY_MS));
      try {
        Object.assign(event, parseDetail(await fetchText(event.sourceUrl, { retries: 0 }), event));
      } catch {
        continue;
      }
    }
    return events;
  }
};

function parseListing(html) {
  const $ = cheerio.load(html);
  const events = [];
  $("a.activity-teaser-link").each((index, node) => {
    const item = $(node);
    const sourceUrl = safeUrl(item.attr("href"), BASE);
    const dateMatch = cleanSpaces(item.find("time").first().text()).match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!sourceUrl || !dateMatch) return;

    const rawTitle = cleanSpaces(item.find("h2.title").first().text());
    const flag = (rawTitle.match(STATUS_FLAG) || [])[1] || "";
    const title = rawTitle.replace(STATUS_FLAG, "");
    const [artist, ...support] = title.split(/\s*\|\s*/)[0].split(/\s+-\s+/)[0].split(/\s+\+\s+/).map(part => part.trim()).filter(Boolean);
    const themes = item.find(".field--name-field-activity-theme .field__item").map((themeIndex, theme) => cleanSpaces($(theme).text())).get().filter(Boolean);
    const genre = themes.join(" / ");
    const isMetal = themes.some(isMetalGenre);
    const address = cleanSpaces(item.find(".address").first().text());
    const elsewhere = address && !/vaartkapoen|schoolstraat|rue de l'?[ée]cole/i.test(address);

    events.push({
      date: `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`,
      time: null,
      artist: artist || title,
      support,
      venue: elsewhere ? address.split(/\s*@\s*/)[0] : "VK Concerts",
      city: "Molenbeek",
      genre: genre || null,
      family: isMetal ? familyOf(themes.filter(isMetalGenre).join(" ")) : null,
      price: null,
      status: statusOf(flag) || "onsale",
      ticketUrl: sourceUrl,
      sourceUrl,
      metal: isMetal ? true : null,
      title: rawTitle
    });
  });
  return events;
}

function statusOf(text) {
  if (/\b(cancell?ed|annul[ée]e?|geannuleerd)\b/i.test(text)) return "cancelled";
  if (/\b(postponed|report[ée]e?|uitgesteld)\b/i.test(text)) return "postponed";
  if (/\b(sold ?out|uitverkocht|complet)\b/i.test(text)) return "soldout";
  return null;
}

function parseDetail(html, event) {
  const $ = cheerio.load(html);
  const hours = cleanSpaces($(".field--name-field-activity-date-extra").first().text()).match(/(\d{1,2})[.:h](\d{2})/);
  const price = cleanSpaces($(".field--name-field-activity-price .field__item").first().text());
  const ticketLink = $(".field--name-field-activity-subscr-link a").first();
  const sideText = cleanSpaces($(".activity--detail--right").first().text());
  const update = {
    time: hours ? formatTime(`${hours[1]}:${hours[2]}`) : event.time,
    price: price ? formatPrice(price.replace(/€\s*(\d[\d.,]*)/g, "$1 €")) : event.price,
    ticketUrl: safeUrl(ticketLink.attr("href"), BASE) || event.ticketUrl
  };
  const sideStatus = statusOf(sideText);
  if (sideStatus && event.status === "onsale") update.status = sideStatus;
  return update;
}

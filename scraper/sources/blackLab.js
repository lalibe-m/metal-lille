import { fetchJson, cleanSpaces, formatTime, formatPrice, safeUrl, todayInParis } from "../lib.js";

const API = "https://theblacklab.fr/wp-json/tribe/events/v1/events";

export default {
  id: "black-lab",
  label: "The Black Lab",
  async fetch() {
    const events = [];
    let page = 1;
    let totalPages = 1;
    do {
      const data = await fetchJson(`${API}?start_date=${todayInParis()}&per_page=50&page=${page}`);
      totalPages = data.total_pages || 1;
      for (const item of data.events || []) events.push(toEvent(item));
      page++;
    } while (page <= totalPages && page <= 10);
    return events;
  }
};

function toEvent(item) {
  const title = cleanSpaces(item.title);
  const [headliner, ...support] = title.split(/\s+\+\s+/).map(part => part.trim()).filter(Boolean);
  const soldOut = /complet|sold ?out/i.test(`${item.cost} ${item.excerpt}`);
  return {
    date: String(item.start_date).slice(0, 10),
    time: item.all_day ? null : formatTime(String(item.start_date).slice(11, 16)),
    artist: titleCase(headliner || title),
    support: support.map(titleCase),
    venue: "The Black Lab",
    city: "Wasquehal",
    genre: null,
    family: null,
    price: formatPrice(item.cost),
    status: soldOut ? "soldout" : "onsale",
    ticketUrl: safeUrl(item.website) || safeUrl(item.url),
    sourceUrl: safeUrl(item.url),
    metal: null,
    title
  };
}

function titleCase(text) {
  if (text !== text.toUpperCase()) return text;
  return text.toLowerCase().replace(/(^|[\s\-–(/.])(\p{L})/gu, (match, separator, letter) => separator + letter.toUpperCase());
}

import * as cheerio from "cheerio";
import { fetchText, cleanSpaces, frenchMonthIndex, isoDate, formatTime, safeUrl, todayInParis } from "../lib.js";
import { isMetalGenre, familyOf } from "../genres.js";

const URL = "https://9-9bis.com/agenda/?a_tax_category=%2Fcategorie%2Fconcerts-spectacles%2F";

export default {
  id: "metaphone",
  label: "Le Métaphone",
  async fetch() {
    const events = parse(await fetchText(URL), todayInParis());
    if (events.length === 0) throw new Error("aucun événement lu sur l'agenda");
    return events;
  }
};

export function parse(html, today) {
  const $ = cheerio.load(html);
  let year = Number(today.slice(0, 4));
  let monthIndex = Number(today.slice(5, 7)) - 1;
  const events = [];
  $(".pc-post-lists-agenda__month__title, a.pc-tease-agenda").each((index, node) => {
    const element = $(node);
    if (element.is(".pc-post-lists-agenda__month__title")) {
      const next = frenchMonthIndex(element.text());
      if (next < 0) return;
      if (next < monthIndex) year++;
      monthIndex = next;
      return;
    }
    const day = Number((cleanSpaces(element.find(".pc-tease-agenda__date").text()).match(/(\d{1,2})/) || [])[1]);
    if (!day) return;
    const title = cleanSpaces(element.find(".pc-tease-agenda__content__title").text());
    const subtitle = cleanSpaces(element.find(".pc-tease-agenda__content__subtitle").text());
    const type = cleanSpaces(element.find(".pc-tease-agenda__type").text());
    const genreText = `${subtitle} ${type}`;
    const isMetal = /concert/i.test(type) && isMetalGenre(genreText);
    const href = safeUrl(element.attr("href"));
    const [headliner, ...support] = title.split(/\s+[+&]\s+/).map(part => part.trim()).filter(Boolean);

    events.push({
      date: isoDate(year, monthIndex, day),
      time: formatTime(element.find(".pc-tease-agenda__time").text()),
      artist: headliner || title,
      support,
      venue: "Le Métaphone",
      city: "Oignies",
      genre: isMetal ? subtitle || type : null,
      family: isMetal ? familyOf(genreText) : null,
      price: /gratuit/i.test(element.text()) ? "Gratuit" : null,
      status: /complet/i.test(element.text()) ? "soldout" : "onsale",
      ticketUrl: href,
      sourceUrl: href,
      metal: isMetal ? true : null,
      title
    });
  });
  return events;
}

import { normalize } from "./lib.js";

const VENUES = [
  { name: "The Black Lab", city: "Wasquehal", match: /black ?lab/ },
  { name: "L'Aéronef", city: "Lille", match: /aeronef/ },
  { name: "Le Grand Mix", city: "Tourcoing", match: /grand ?mix/ },
  { name: "Le Splendid", city: "Lille", match: /splendid/ },
  { name: "La Cave aux Poètes", city: "Roubaix", match: /cave aux poetes/ },
  { name: "Le Métaphone", city: "Oignies", match: /metaphone|9 9 ?bis/ },
  { name: "La Condition Publique", city: "Roubaix", match: /condition publique/ },
  { name: "Zénith de Lille", city: "Lille", match: /zenith/ },
  { name: "Théâtre Sébastopol", city: "Lille", match: /sebastopol/ },
  { name: "La Bulle Café", city: "Lille", match: /bulle cafe/ },
  { name: "La Brat Cave", city: "Lille", match: /brat cave/ },
  { name: "La Malterie", city: "Lille", match: /malterie/ },
  { name: "Le Biplan", city: "Lille", match: /biplan/ },
  { name: "La Péniche", city: "Lille", match: /^la peniche$/ },
  { name: "Maison Folie Wazemmes", city: "Lille", match: /folie wazemmes/ },
  { name: "Maison Folie Beaulieu", city: "Lomme", match: /folie beaulieu/ },
  { name: "La Laiterie", city: "Lambersart", match: /laiterie/ }
];

const AREA_CITIES = new Set([
  "lille", "lomme", "hellemmes", "roubaix", "tourcoing", "wasquehal", "villeneuve d ascq", "lambersart",
  "la madeleine", "marcq en baroeul", "mons en baroeul", "croix", "hem", "wattrelos", "armentieres", "loos",
  "haubourdin", "ronchin", "faches thumesnil", "seclin", "comines", "halluin", "wambrechies",
  "saint andre lez lille", "marquette lez lille", "lys lez lannoy", "leers", "roncq", "neuville en ferrain",
  "bondues", "mouvaux", "wattignies", "templemars", "quesnoy sur deule", "lesquin", "fretin", "sequedin",
  "englos", "perenchies", "verlinghem", "linselles", "bousbecque", "wervicq sud", "sailly lez lannoy",
  "toufflers", "lannoy", "baisieux", "anstaing", "forest sur marque", "sainghin en melantois",
  "oignies"
]);

const BELGIAN_CITIES = new Set([
  "bruxelles", "brussel", "brussels", "forest", "vorst", "ixelles", "elsene", "saint gilles", "sint gillis",
  "molenbeek", "schaerbeek", "schaarbeek", "anderlecht", "etterbeek", "uccle", "koekelberg",
  "kortrijk", "courtrai", "gent", "gand", "ieper", "ypres", "tournai", "doornik", "mons", "bergen",
  "charleroi", "mouscron", "moeskroen", "menen", "menin", "waregem", "roeselare", "roulers", "harelbeke",
  "wevelgem", "aalst", "alost", "oudenaarde", "audenarde", "ath", "la louviere", "brugge", "bruges", "oostende", "ostende"
]);

export function countryOf(city, venue) {
  const known = VENUES.find(entry => entry.name === venue);
  if (known && known.country) return known.country;
  return BELGIAN_CITIES.has(normalize(city)) ? "BE" : "FR";
}

export function canonicalVenue(rawName, rawCity) {
  const key = normalize(rawName);
  const known = VENUES.find(venue => venue.match.test(key));
  if (known) return { venue: known.name, city: known.city };
  return { venue: String(rawName || "").trim(), city: cityFromLocality(rawCity) };
}

export function cityFromLocality(locality) {
  const text = String(locality || "").trim();
  const inner = /\(([^()]*)\)/.exec(text);
  return (inner ? inner[1] : text).trim();
}

export function isInArea(city, venue) {
  if (VENUES.some(known => known.name === venue)) return true;
  return AREA_CITIES.has(normalize(city));
}

export function venueKey(venue) {
  return normalize(venue).replace(/^(le|la|les|l|the) /, "").replace(/\s+/g, "-");
}

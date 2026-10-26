const METAL = /metal|core\b|thrash|doom|stoner|sludge|grind|hard ?rock|heavy|djent|crust|hardcore|blackgaze|death|black|glam|sleaze|machine rock|noise rock/i;
const NOT_METAL = /black ?music|death ?disco/i;
const METAL_TRIBUTE = /tribute.*\b(rammstein|korn|linkin|slipknot|metallica|ac ?\/? ?dc|iron maiden|tool|system of a down|avenged|ghost|marilyn manson|evanescence|motorhead|black sabbath|ozzy|guns|kiss|deep purple|led zeppelin|pantera|megadeth|slayer|limp bizkit|rage against|bring me the horizon|trivium|gojira|deftones|sepultura|scorpions|judas priest|def leppard|bon jovi|aerosmith|nightwish)\b/i;

export function isMetalGenre(genre) {
  const text = String(genre || "");
  return (METAL.test(text) && !NOT_METAL.test(text)) || METAL_TRIBUTE.test(text);
}

export function isMetalLineup(bands) {
  const withGenre = bands.filter(band => band.genre);
  if (withGenre.length === 0) return false;
  if (isMetalGenre(withGenre[0].genre)) return true;
  const metalCount = withGenre.filter(band => isMetalGenre(band.genre)).length;
  return metalCount * 2 > withGenre.length;
}

const FAMILIES = [
  ["Tributes", /tribute/i],
  ["Post-metal", /post[- ]?metal|atmospheric sludge|post[- ]?rock/i],
  ["Death / Black", /death|black|grind|blackgaze|avant[- ]?garde/i],
  ["Core / Hardcore", /core\b|hardcore|crust|crossover/i],
  ["Doom / Stoner", /doom|stoner|sludge|heavy psych|psych/i],
  ["Indus / Nu", /indus|nu[- ]?metal|alternative metal|machine rock|electronicore/i],
  ["Power / Prog", /power|symphonic|folk|progressive|prog|epic/i],
  ["Heavy / Thrash", /heavy|thrash|speed|groove|parody|metal/i],
  ["Hard rock", /hard ?rock|glam|sleaze|blues rock|rock/i]
];

export function familyOf(genre) {
  const found = FAMILIES.find(([, pattern]) => pattern.test(String(genre || "")));
  return found ? found[0] : "Metal";
}

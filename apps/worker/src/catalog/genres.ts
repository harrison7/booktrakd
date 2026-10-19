// Maps free-form source subjects (Open Library / Library of Congress style) onto the
// controlled genre list in @booktrakd/db.
import type { GenreSlug } from "@booktrakd/db";

interface Rule {
  genre: GenreSlug;
  match: RegExp;
  /** Subject is ignored for this genre if it also matches this. */
  unless?: RegExp;
}

const FICTION = /fiction|novel/;

const RULES: Rule[] = [
  { genre: "fantasy", match: /\bfantasy\b|\bmagic\b|\bwizards?\b|\bdragons?\b/ },
  {
    genre: "science-fiction",
    match: /science fiction|\bsci-?fi\b|dystopia|space opera|cyberpunk|time travel/,
  },
  { genre: "horror", match: /\bhorror\b|ghost stories|\bvampires?\b|\bzombies?\b/ },
  {
    genre: "mystery",
    match: /\bmyster(?:y|ies)\b|detective|whodunit|crime fiction|private investigators/,
  },
  { genre: "thriller", match: /thriller|suspense|espionage|\bspy\b|\bspies\b/ },
  {
    genre: "romance",
    match: /\bromance\b|love stories|romantic (?:suspense|comedy|fiction)/,
    unless: /romance (?:languages?|philology|literature)/,
  },
  {
    genre: "historical-fiction",
    match: /historical fiction|fiction, historical|historical novels?/,
  },
  { genre: "classics", match: /\bclassics?\b|classic literature/ },
  { genre: "young-adult", match: /young adult|teen fiction|\bya fiction/ },
  {
    genre: "childrens",
    match:
      /juvenile (?:fiction|literature)|children'?s (?:fiction|literature|stories|books|poetry)|picture books|stories in rhyme/,
  },
  {
    genre: "graphic-novels",
    match: /graphic novels?|comic books|\bcomics\b|\bmanga\b|comic strips/,
  },
  { genre: "short-stories", match: /short stories|short fiction/ },
  { genre: "poetry", match: /\bpoetry\b|\bpoems\b|\bverse\b|sonnets/ },
  { genre: "drama", match: /\bdrama\b|\bplays\b|\btragedies\b|playwriting/ },
  { genre: "humor", match: /\bhumou?r\b|\bhumorous\b|satire|comic fiction|\bparod(?:y|ies)\b/ },
  { genre: "biography", match: /\bbiograph(?:y|ies|ical)\b/ },
  { genre: "memoir", match: /\bmemoirs?\b|autobiograph|personal narratives/ },
  {
    genre: "history",
    match: /\bhistory\b|\bhistorical\b/,
    unless: /history and criticism|fiction|novel|juvenile/,
  },
  {
    genre: "true-crime",
    match: /true crime|\bmurders?\b|serial murder|criminal investigation|\bcriminals\b/,
    unless: FICTION,
  },
  {
    genre: "science",
    match:
      /\bscience\b|physics|chemistry|biology|astronomy|mathematics|\bevolution\b|genetics|neuroscience/,
    unless: /fiction|political science|social science|computer science|juvenile/,
  },
  {
    genre: "technology",
    match:
      /computer|programming|software|\btechnology\b|engineering|internet|artificial intelligence/,
    unless: FICTION,
  },
  {
    genre: "philosophy",
    match: /philosophy|\bethics\b|metaphysics|existentialism|stoicism/,
    unless: FICTION,
  },
  {
    genre: "religion",
    match:
      /religion|christian|\bbible\b|theology|\bislam|buddhis|judaism|spiritual|\bchurch\b|hinduism|\bprayer/,
  },
  { genre: "psychology", match: /psycholog|mental health|psychiatr/, unless: FICTION },
  {
    genre: "self-help",
    match: /self-help|self help|personal growth|self-actualization|motivation|happiness|\bhabits\b/,
    unless: FICTION,
  },
  {
    genre: "business",
    match: /business|economics|management|finance|marketing|entrepreneur|investing|leadership/,
    unless: FICTION,
  },
  {
    genre: "politics",
    match:
      /politic|government|social science|sociology|international relations|feminism|race relations|civil rights/,
    unless: FICTION,
  },
  { genre: "travel", match: /\btravels?\b|description and travel|guidebooks/, unless: FICTION },
  {
    genre: "food",
    match: /\bcook(?:ing|ery|books?)\b|recipes|\bfood\b|baking|gastronomy|\bwine\b/,
    unless: FICTION,
  },
  {
    genre: "art",
    match: /\bart\b|painting|photography|architecture|graphic design|\bdrawing\b|sculpture/,
    unless: FICTION,
  },
  {
    genre: "nature",
    match:
      /\bnature\b|natural history|environment|ecology|climate|\banimals\b|\bbirds\b|wildlife|\bplants\b|gardening/,
    unless: /fiction|novel|juvenile/,
  },
  {
    genre: "health",
    match: /\bhealth\b|fitness|nutrition|\bdiet\b|exercise|medicine|medical|wellness|\byoga\b/,
    unless: FICTION,
  },
  {
    genre: "literary-fiction",
    match: /literary fiction|psychological fiction|domestic fiction|bildungsroman|fiction, general/,
  },
];

const FICTION_GENRES = new Set<GenreSlug>([
  "fantasy",
  "science-fiction",
  "horror",
  "mystery",
  "thriller",
  "romance",
  "historical-fiction",
  "young-adult",
  "childrens",
  "graphic-novels",
  "short-stories",
  "literary-fiction",
]);

/** Non-fiction genres that still make sense on a novel ("Classics", Christian fiction…). */
// (Not "drama": on a novel it usually means a stage adaptation exists.)
const FICTION_COMPATIBLE = new Set<GenreSlug>(["classics", "humor", "poetry", "religion"]);

const MAX_GENRES = 3;

/**
 * Returns up to 3 genres, ranked by how many subjects point at each.
 * - Works whose subjects say "fiction" but match no fiction genre fall back to Literary Fiction.
 * - Once a specific fiction genre matches, Literary Fiction and non-fiction genres are dropped:
 *   library subjects describe a novel's topics ("Desert ecology" on Dune), not its genre.
 */
export function mapSubjectsToGenres(subjects: readonly string[]): GenreSlug[] {
  const hits = new Map<GenreSlug, number>();
  let saysFiction = false;
  let saysNonfiction = false;

  for (const raw of subjects) {
    const subject = raw.toLowerCase();
    if (/\bnon-?fiction\b/.test(subject)) {
      saysNonfiction = true; // "Non-Fiction" would otherwise match the fiction check below
    } else if (/^(?:fiction|novels?)$|\bfiction\b/.test(subject) && !/juvenile/.test(subject)) {
      saysFiction = true;
    }
    for (const rule of RULES) {
      if (rule.match.test(subject) && !rule.unless?.test(subject)) {
        hits.set(rule.genre, (hits.get(rule.genre) ?? 0) + 1);
      }
    }
  }

  const specificFiction = [...hits.keys()].some(
    (g) => FICTION_GENRES.has(g) && g !== "literary-fiction",
  );
  if (specificFiction) {
    for (const genre of hits.keys()) {
      if (
        genre === "literary-fiction" ||
        !(FICTION_GENRES.has(genre) || FICTION_COMPATIBLE.has(genre))
      ) {
        hits.delete(genre);
      }
    }
  } else if ((saysFiction && !saysNonfiction) || hits.has("literary-fiction")) {
    // Topic genres (history, nature…) on an unspecified novel are dropped the same way.
    for (const genre of hits.keys()) {
      if (!FICTION_COMPATIBLE.has(genre)) hits.delete(genre);
    }
    hits.set("literary-fiction", 1);
  }

  return (
    [...hits.entries()]
      // Most-supported first; on ties, fiction genres before topical ones.
      .sort(
        (a, b) =>
          b[1] - a[1] || Number(FICTION_GENRES.has(b[0])) - Number(FICTION_GENRES.has(a[0])),
      )
      .slice(0, MAX_GENRES)
      .map(([genre]) => genre)
  );
}

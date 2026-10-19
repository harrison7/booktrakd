// A tiny slice of Open Library dump data exercising the interesting import cases.

const line = (type: string, key: string, json: object) =>
  `${type}\t${key}\t3\t2024-01-01T00:00:00.000000\t${JSON.stringify(json)}`;

const author = (id: string, name: string) =>
  line("/type/author", `/authors/${id}`, { key: `/authors/${id}`, name });

const work = (id: string, json: object) =>
  line("/type/work", `/works/${id}`, { key: `/works/${id}`, ...json });

const edition = (id: string, workId: string | null, json: object) =>
  line("/type/edition", `/books/${id}`, {
    key: `/books/${id}`,
    ...(workId && { works: [{ key: `/works/${workId}` }] }),
    ...json,
  });

const by = (...ids: string[]) =>
  ids.map((id) => ({ author: { key: `/authors/${id}` }, type: { key: "/type/author_role" } }));

export const AUTHORS = [
  author("OL1A", "Frank Herbert"),
  author("OL2A", "Emily Dickinson"),
  author("OL3A", "Mary Shelley"),
  author("OL9A", "Unused Author"), // no kept works → not imported
  line("/type/redirect", "/authors/OL10A", { location: "/authors/OL1A" }),
];

export const WORKS = [
  work("OL1W", {
    title: "Dune",
    authors: by("OL1A"),
    covers: [100],
    subjects: ["Science fiction", "Dune (Imaginary place)", "Fiction"],
    first_publish_date: "1965",
    description: { type: "/type/text", value: "Set on the desert planet Arrakis…" },
  }),
  // Duplicate of OL1W (edition note in the title) → merged.
  work("OL2W", { title: "Dune (Deluxe Edition)", authors: by("OL1A"), covers: [-1, 200] }),
  // Same generic title, same author → reported, not merged.
  work("OL3W", { title: "Poems", authors: by("OL2A"), subjects: ["Poetry"] }),
  work("OL4W", { title: "Poems", authors: by("OL2A") }),
  work("OL5W", {
    title: "Frankenstein; or, The Modern Prometheus",
    authors: by("OL3A"),
    subjects: ["Horror tales", "Monsters -- Fiction"],
    first_publish_date: "1831", // a later revision; the earliest edition (1818) should win
  }),
  // Kept only because it has reader activity (its one edition has no ISBN or cover).
  work("OL6W", { title: "Dune Messiah", authors: by("OL1A") }),
  // No useful editions and no activity → dropped.
  work("OL7W", { title: "Ghost Work", authors: by("OL1A") }),
  // Same title as OL1W but a different author → separate book, gets "dune-2".
  work("OL8W", { title: "Dune", authors: by("OL3A") }),
  // Titled in Russian, but its editions are English → shown as "Crime and Punishment".
  work("OL10W", { title: "Преступление и наказание", authors: by("OL3A") }),
  // An English-titled duplicate of OL10W: merges into it once OL10W gets its English title.
  work("OL11W", { title: "Crime and Punishment", authors: by("OL3A") }),
  work("OL9W", { authors: by("OL1A") }), // no title → skipped
];

export const EDITIONS = [
  edition("OL1M", "OL1W", {
    title: "Dune",
    isbn_13: ["9780441013593"],
    covers: [100],
    publishers: ["Ace"],
    publish_date: "2005",
    languages: [{ key: "/languages/eng" }],
    physical_format: "Paperback",
  }),
  edition("OL2M", "OL2W", {
    title: "Dune",
    isbn_10: ["0441172717"],
    number_of_pages: 535,
    physical_format: "Mass Market Paperback",
    publish_date: "June 1, 1990",
  }),
  edition("OL3M", "OL3W", { title: "Poems", covers: [300] }),
  edition("OL4M", "OL4W", { title: "Poems", covers: [301] }),
  edition("OL5M", "OL5W", {
    title: "Frankenstein (Penguin Classics)",
    isbn_13: ["978-0-14-143947-1"],
    covers: [500],
    languages: [{ key: "/languages/eng" }],
    number_of_pages: 273,
  }),
  edition("OL5N", "OL5W", { title: "Frankenstein", covers: [501], publish_date: "1818" }),
  edition("OL6M", "OL6W", { title: "Dune Messiah", isbn_13: ["123"] }), // invalid ISBN, no cover
  edition("OL8M", "OL8W", { title: "Dune", covers: [800] }),
  ...["OL10M", "OL10N"].map((id) =>
    edition(id, "OL10W", {
      title: "Crime and Punishment",
      isbn_13: ["9780143058144"],
      languages: [{ key: "/languages/eng" }],
    }),
  ),
  edition("OL10R", "OL10W", { title: "Преступление и наказание", isbn_13: ["9785170906307"] }),
  edition("OL11M", "OL11W", { title: "Crime and Punishment", isbn_13: ["9780486415871"] }),
  edition("OL9M", null, { title: "Orphan", isbn_13: ["9780441013593"] }), // no work
];

export const RATINGS = [
  "/works/OL1W\t/books/OL1M\t5\t2020-01-01",
  "/works/OL1W\t\t4\t2020-01-02",
  "/works/OL8W\t\t3\t2020-01-03",
  "/works/OL1W\t\t9\t2020-01-04", // out of range → skipped
];

export const READING_LOG = [
  "/works/OL1W\t/books/OL1M\tAlready Read\t2021-01-01",
  "/works/OL1W\t\tAlready Read\t2021-01-01",
  "/works/OL1W\t\tAlready Read\t2021-01-01",
  "/works/OL2W\t\tWant to Read\t2021-01-01",
  "/works/OL6W\t\tCurrently Reading\t2021-01-01",
];

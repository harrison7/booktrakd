import {
  cleanTitle,
  displayAuthorName,
  matchTitle,
  normalizeFormat,
  parseYear,
  slugify,
  toIsbn10,
  toIsbn13,
} from "@booktrakd/catalog";
import { describe, expect, it } from "vitest";
import { mapSubjectsToGenres } from "../src/catalog/genres";

describe("cleanTitle", () => {
  it.each([
    ["Pride and prejudice /", "Pride and prejudice"],
    ["Dune (Deluxe Edition)", "Dune"],
    ["Frankenstein (Penguin Classics) [Paperback]", "Frankenstein"],
    ["The Road: A Novel", "The Road"],
    ["Harry Potter and the Philosopher's Stone", "Harry Potter and the Philosopher's Stone"],
    // Parenthetical that is part of the title is kept.
    ["Catch-22 (a story)", "Catch-22 (a story)"],
    ["  Spaced   out  ", "Spaced out"],
  ])("%s → %s", (input, expected) => {
    expect(cleanTitle(input)).toBe(expected);
  });
});

describe("matchTitle", () => {
  it("ignores case, accents, punctuation, edition notes and leading articles", () => {
    expect(matchTitle("The Lord of the Rings (Deluxe Edition)")).toBe("lord of the rings");
    expect(matchTitle("Les Misérables")).toBe("les miserables");
    expect(matchTitle("Pride & Prejudice")).toBe(matchTitle("Pride and prejudice /"));
    expect(matchTitle("Ender's Game")).toBe("enders game");
  });

  it("keeps non-Latin scripts intact", () => {
    expect(matchTitle("Война и мир")).toBe("война и мир");
    expect(matchTitle("ノルウェイの森")).toBe("ノルウェイの森");
  });
});

describe("slugify", () => {
  it("makes URL slugs", () => {
    expect(slugify("Harry Potter & the Philosopher's Stone", "book")).toBe(
      "harry-potter-and-the-philosophers-stone",
    );
    expect(slugify("Cien años de soledad", "book")).toBe("cien-anos-de-soledad");
    expect(slugify("Война и мир", "book")).toBe("война-и-мир");
    expect(slugify("!!!", "book")).toBe("book");
  });

  it("caps length without a trailing hyphen", () => {
    const slug = slugify("a ".repeat(100), "book");
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("parseYear", () => {
  it.each([
    ["1965", 1965],
    ["March 1990", 1990],
    ["c1985.", 1985],
    ["2004-05-01", 2004],
    ["n.d.", null],
    ["12345", null],
    ["3020", null],
    [null, null],
  ])("%s → %s", (input, expected) => {
    expect(parseYear(input)).toBe(expected);
  });
});

describe("ISBNs", () => {
  it("validates and converts ISBN-10 to ISBN-13", () => {
    expect(toIsbn13("0-441-17271-7")).toBe("9780441172719");
    expect(toIsbn13("9780441013593")).toBe("9780441013593");
    expect(toIsbn13("080442957X")).toBe("9780804429573");
    expect(toIsbn10("080442957x")).toBe("080442957X");
  });

  it("rejects bad checksums and junk", () => {
    expect(toIsbn13("9780441013594")).toBeNull();
    expect(toIsbn13("0441172718")).toBeNull();
    expect(toIsbn13("123")).toBeNull();
    expect(toIsbn10(undefined)).toBeNull();
  });
});

describe("normalizeFormat", () => {
  it.each([
    ["Mass Market Paperback", "paperback"],
    ["Hardcover", "hardcover"],
    ["Audio CD", "audiobook"],
    ["Kindle Edition", "ebook"],
    ["Microfilm", "other"],
    ["", null],
  ])("%s → %s", (input, expected) => {
    expect(normalizeFormat(input)).toBe(expected);
  });
});

describe("mapSubjectsToGenres", () => {
  it("maps library subjects onto the controlled genre list", () => {
    expect(mapSubjectsToGenres(["Science fiction", "Dune (Imaginary place)", "Fiction"])).toEqual([
      "science-fiction",
    ]);
    expect(mapSubjectsToGenres(["Detective and mystery stories", "Murder -- Fiction"])).toEqual([
      "mystery",
    ]);
  });

  it("avoids common false positives", () => {
    expect(mapSubjectsToGenres(["Romance languages -- Grammar"])).not.toContain("romance");
    expect(mapSubjectsToGenres(["English fiction -- History and criticism"])).not.toContain(
      "history",
    );
    expect(mapSubjectsToGenres(["Political science"])).not.toContain("science");
  });

  it("ignores topic subjects and generic 'fiction' once a fiction genre is known", () => {
    // Dune's real subjects produced "Literary Fiction" and "Nature & Environment".
    expect(
      mapSubjectsToGenres(["Science fiction", "Desert ecology", "Fiction, general", "Ecology"]),
    ).toEqual(["science-fiction"]);
    expect(mapSubjectsToGenres(["Fiction, general", "Natural history"])).toEqual([
      "literary-fiction",
    ]);
    expect(mapSubjectsToGenres(["Christian fiction", "Romance fiction"])).toEqual([
      "romance",
      "religion",
    ]);
    // Real subjects of Sapiens and Pride and Prejudice.
    expect(mapSubjectsToGenres(["World history", "Non-Fiction", "SCIENCE / General"])).toEqual([
      "history",
      "science",
    ]);
    expect(mapSubjectsToGenres(["Love stories", "Drama", "Fiction Classics"])).toEqual([
      "romance",
      "classics",
    ]);
  });

  it("falls back to Literary Fiction for unspecified fiction", () => {
    expect(mapSubjectsToGenres(["Fiction", "Families -- Fiction"])).toEqual(["literary-fiction"]);
  });

  it("returns at most three genres, most-supported first", () => {
    const genres = mapSubjectsToGenres([
      "Fantasy fiction",
      "Magic -- Fiction",
      "Wizards -- Fiction",
      "Humorous stories",
      "Satire",
      "Dragons",
      "Science fiction",
      "Poetry",
    ]);
    expect(genres).toHaveLength(3);
    expect(genres[0]).toBe("fantasy");
  });
});

describe("displayAuthorName", () => {
  it("keeps Latin names", () => {
    expect(displayAuthorName("Fiódor Dostoievski", ["Фёдор Достоевский"])).toBe(
      "Fiódor Dostoievski",
    );
  });

  it("picks the most common reader-friendly Latin alternate", () => {
    // Real Open Library alternates for Tolstoy.
    const alternates = [
      "Толстой, Лев, граф",
      "граф Лев Толстой",
      "Count Lev Nikolayevich Tolstoy",
      "Leo N. Tolstoj",
      "L. N. Tolstoy",
      "TOLSTOY, LEO, GRAF, 1828-1910.",
      "Tolstoy, Leo graf",
      "Leo  Tolstoy",
      "LEO TOLSTOY",
      "Leo TOLSTOY",
    ];
    expect(displayAuthorName("Лев Толстой", alternates)).toBe("Leo Tolstoy");
    // Real alternates (Murakami's "Haruki/Murakami" orders tie exactly; Chekhov has 50 spellings).
    const murakami =
      "春樹 村上;HARUKI MURAKAMI;Haruki MURAKAMI;MURAKAMI HARUKI;Murakami Haruki;MURAKAMI Haruki;Haruki Murakami;Харуки Мураками;村上春树;Kharuki Murakami;MURAKAMI;Murakami Kharuki;Murakami Haruki Kenkyūkai";
    expect(displayAuthorName("村上春樹", murakami.split(";"))).toBe("Haruki Murakami");
    const chekhov =
      "A. Checkhov;A. Chekhov;A. P. Chekhov;A. P. Chekov;A. Pavlovich Chekhov;Aleksandr Pavlovich Chekhov;Anthon Chekhov;Anton Anton Chekhov;Anton Cechov;Anton Cehov;Anton Checkov;Anton Chejov;Anton Chekhoff;Anton Chekhov;Anton Chekov;Anton Chéjov;Anton P. Chekhov;Anton P. Çehov;Anton Pavlovich Chekhov;Anton Pavlovich Chekov;Anton Pavlovich Tchekhov;Anton Pavlovitch Chekhov;Anton Pavlovitch Tchekhov;Anton Tchehov;Anton Tchekhov;Anton Tchekoff;Anton Tchekov;Anton Tschechow;Anton Čechov;Antón Chéjov;Author Chekhov;Auton Chekhov;Антон Чехов";
    expect(displayAuthorName("Антон Павлович Чехов", chekhov.split(";"))).toBe("Anton Chekhov");
  });

  it("handles single-name authors", () => {
    expect(displayAuthorName("Ὅμηρος", ["Homer", "Homère", "HOMER", "Homer", "Omero"])).toBe(
      "Homer",
    );
  });

  it("keeps the original when there's no usable Latin alternate", () => {
    expect(displayAuthorName("日向夏", ["Hyuuga, Natsu"])).toBe("日向夏");
  });
});

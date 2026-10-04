import { describe, expect, it } from "vitest";
import { parseDumpLine } from "../src/catalog/openlibrary";
import { encodeCopyRow } from "../src/import/copy";
import { AUTHORS, EDITIONS, RATINGS, READING_LOG, WORKS } from "./fixtures";

describe("parseDumpLine", () => {
  it("parses works into normalized staging rows", () => {
    expect(parseDumpLine("works", WORKS[0] as string)).toEqual([
      "OL1W",
      "Dune",
      null,
      "dune",
      "dune",
      "Set on the desert planet Arrakis…",
      1965,
      100,
      ["Science fiction", "Dune (Imaginary place)", "Fiction"],
      ["science-fiction"],
      ["OL1A"],
    ]);
  });

  it("cleans titles and skips removed (-1) cover ids", () => {
    const row = parseDumpLine("works", WORKS[1] as string);
    expect(row?.[1]).toBe("Dune");
    expect(row?.[7]).toBe(200);
  });

  it("skips works without a title", () => {
    expect(parseDumpLine("works", WORKS.at(-1) as string)).toBeNull();
  });

  it("parses editions, converting ISBN-10 to ISBN-13", () => {
    expect(parseDumpLine("editions", EDITIONS[1] as string)).toEqual([
      "OL2M",
      "OL2W",
      "Dune",
      "0441172717",
      "9780441172719",
      null,
      "June 1, 1990",
      1990,
      "paperback",
      535,
      null,
      null,
    ]);
  });

  it("drops editions with no work, or with neither a valid ISBN nor a cover", () => {
    expect(
      parseDumpLine("editions", EDITIONS.find((l) => l.includes("OL6M")) as string),
    ).toBeNull();
    expect(
      parseDumpLine("editions", EDITIONS.find((l) => l.includes("OL9M")) as string),
    ).toBeNull();
  });

  it("parses authors and ignores redirects", () => {
    expect(parseDumpLine("authors", AUTHORS[0] as string)).toEqual([
      "OL1A",
      "Frank Herbert",
      null,
      null,
      null,
      null,
      "frank-herbert",
    ]);
    expect(parseDumpLine("authors", AUTHORS.at(-1) as string)).toBeNull();
  });

  it("parses ratings and reading-log shelves", () => {
    expect(parseDumpLine("ratings", RATINGS[0] as string)).toEqual(["OL1W", 5]);
    expect(parseDumpLine("ratings", RATINGS[3] as string)).toBeNull();
    expect(parseDumpLine("reading_log", READING_LOG[3] as string)).toEqual(["OL2W", "want"]);
  });

  it("ignores malformed lines", () => {
    expect(parseDumpLine("works", "/type/work\t/works/OL1W\t1\tdate\t{not json")).toBeNull();
    expect(parseDumpLine("works", "")).toBeNull();
  });
});

describe("encodeCopyRow", () => {
  it("escapes COPY text format and encodes arrays", () => {
    expect(encodeCopyRow(["a\tb\nc\\d", null, 3, ['x"y', "z\\w"]])).toBe(
      'a\\tb\\nc\\\\d\t\\N\t3\t{"x\\\\"y","z\\\\\\\\w"}\n',
    );
  });

  it("strips NUL characters", () => {
    expect(encodeCopyRow(["a\0b"])).toBe("ab\n");
  });
});

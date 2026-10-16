import { describe, expect, it } from "vitest";
import { scoreWorks, topKeys } from "../src/import/sample";
import { RATINGS, READING_LOG } from "./fixtures";

async function* lines(items: string[]) {
  yield* items;
}

describe("sample import selection", () => {
  it("scores works with the same weights as the popularity score", async () => {
    const scores = await scoreWorks(lines(RATINGS), lines(READING_LOG));
    // OL1W: 2 valid ratings × 2 + 3 reads × 1
    expect(scores.get("OL1W")).toBe(7);
    expect(scores.get("OL2W")).toBe(0.5);
    expect(scores.get("OL6W")).toBe(2);
    expect(scores.get("OL8W")).toBe(2);
  });

  it("keeps the top N, breaking ties by key", async () => {
    const scores = await scoreWorks(lines(RATINGS), lines(READING_LOG));
    expect([...topKeys(scores, 2)]).toEqual(["OL1W", "OL6W"]);
  });
});

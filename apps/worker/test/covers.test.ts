import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { type Database, eq } from "@booktrakd/db";
import { covers } from "@booktrakd/db/schema";
import { createTestDb } from "@booktrakd/db/testing";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processCover } from "../src/covers/process";
import { LocalStorage } from "../src/covers/storage";

let db: Database;
let dir: string;

beforeAll(async () => {
  ({ db } = await createTestDb());
  dir = await mkdtemp(path.join(tmpdir(), "booktrakd-covers-"));
}, 60_000);

afterAll(() => rm(dir, { recursive: true, force: true }));

async function insertCover(sourceId: string) {
  const [row] = await db
    .insert(covers)
    .values({ source: "openlibrary", sourceId })
    .returning({ id: covers.id });
  return row?.id as number;
}

const fakeFetch = (response: Response) => (async () => response) as unknown as typeof fetch;

describe("processCover", () => {
  it("stores every size as WebP and records dimensions and dominant color", async () => {
    const jpeg = await sharp({
      create: { width: 400, height: 600, channels: 3, background: { r: 200, g: 40, b: 40 } },
    })
      .jpeg()
      .toBuffer();
    const id = await insertCover("12345");

    const result = await processCover(db, new LocalStorage(dir), id, {
      fetch: fakeFetch(new Response(new Uint8Array(jpeg))),
      userAgent: "test",
    });

    expect(result.status).toBe("ready");
    expect((await readdir(path.join(dir, "covers", String(id)))).sort()).toEqual([
      "lg.webp",
      "md.webp",
      "sm.webp",
      "xl.webp",
      "xs.webp",
    ]);
    // Read into memory first: sharp holds file handles open on Windows.
    const md = await sharp(
      await readFile(path.join(dir, "covers", String(id), "md.webp")),
    ).metadata();
    expect([md.width, md.height]).toEqual([150, 225]);

    const [row] = await db.select().from(covers).where(eq(covers.id, id));
    expect(row).toMatchObject({
      status: "ready",
      storageKey: `covers/${id}`,
      width: 400,
      height: 600,
    });
    expect(row?.dominantColor).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("marks covers missing on 404", async () => {
    const id = await insertCover("999");
    const result = await processCover(db, new LocalStorage(dir), id, {
      fetch: fakeFetch(new Response("", { status: 404 })),
      userAgent: "test",
    });
    expect(result.status).toBe("missing");
    const [row] = await db.select().from(covers).where(eq(covers.id, id));
    expect(row?.status).toBe("missing");
  });

  it("throws on server errors so the job is retried", async () => {
    const id = await insertCover("500");
    await expect(
      processCover(db, new LocalStorage(dir), id, {
        fetch: fakeFetch(new Response("", { status: 503 })),
        userAgent: "test",
      }),
    ).rejects.toThrow("HTTP 503");
  });
});

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../env";

export interface ImageStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
}

/** Cloudflare R2 (S3-compatible). Images are immutable, so they cache forever at the CDN. */
export class R2Storage implements ImageStorage {
  private client: S3Client;

  constructor(private config: NonNullable<typeof env.r2>) {
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }
}

/** Local disk, for development without an R2 account. */
export class LocalStorage implements ImageStorage {
  constructor(private root: string) {}

  async put(key: string, body: Buffer) {
    const file = path.join(this.root, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }
}

export function createStorage(): ImageStorage {
  const r2 = env.r2;
  return r2 ? new R2Storage(r2) : new LocalStorage(path.join(env.dataDir, "images"));
}

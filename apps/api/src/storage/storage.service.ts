import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';

const HOUR = 3_600_000;

/**
 * Private bucket, signed URLs. Two clients: one talks to storage inside the network,
 * the other only signs URLs for the host the browser can reach.
 */
@Injectable()
export class StorageService {
  private readonly internal: S3Client;
  private readonly signer: S3Client;
  private readonly bucket: string;

  constructor(@Inject(ENV) env: Env) {
    const base = {
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
      // SDK v3 otherwise bakes a CRC32 of an *empty* body into presigned PUT URLs, so every real
      // upload fails its checksum. Checksums only when an operation requires them.
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
    };
    this.internal = new S3Client({ ...base, endpoint: env.S3_ENDPOINT });
    this.signer = new S3Client({ ...base, endpoint: env.S3_PUBLIC_URL });
    this.bucket = env.S3_BUCKET;
  }

  /** A short-lived PUT URL that only accepts this exact type and size. */
  presignPut(key: string, mimeType: string, size: number, expiresInS = 600): Promise<string> {
    return getSignedUrl(this.signer, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mimeType, ContentLength: size }), {
      expiresIn: expiresInS,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
  }

  /**
   * A GET URL signed as of the start of the current hour and valid for two: the same URL for
   * everyone within the hour, so browsers and proxies can cache it, and never less than an hour left.
   */
  presignGet(key: string, fileName: string, inline: boolean): Promise<string> {
    const signingDate = new Date(Math.floor(Date.now() / HOUR) * HOUR);
    const disposition = `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName)}`;
    return getSignedUrl(this.signer, new GetObjectCommand({ Bucket: this.bucket, Key: key, ResponseContentDisposition: disposition }), {
      expiresIn: 2 * 3600,
      signingDate,
    });
  }

  /** Size and type of an uploaded object, or null if it isn't there. */
  async head(key: string): Promise<{ size: number; contentType: string | undefined } | null> {
    try {
      const res = await this.internal.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch (err) {
      if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async read(key: string): Promise<Buffer> {
    const res = await this.internal.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async write(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.internal.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  /** Every object under a prefix, with when it was last written. */
  async list(prefix: string): Promise<{ key: string; modifiedAt: Date }[]> {
    const out: { key: string; modifiedAt: Date }[] = [];
    let token: string | undefined;
    do {
      const res = await this.internal.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
      for (const o of res.Contents ?? []) if (o.Key) out.push({ key: o.Key, modifiedAt: o.LastModified ?? new Date(0) });
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  async remove(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.internal.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
  }
}

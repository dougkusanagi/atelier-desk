import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import type { Config } from './config';
export class Storage {
  private s3?: S3Client;
  constructor(readonly settings: Config) {
    if (settings.s3Endpoint)
      this.s3 = new S3Client({
        endpoint: settings.s3Endpoint,
        region: settings.s3Region,
        forcePathStyle: true,
        credentials:
          settings.s3AccessKey && settings.s3SecretKey
            ? { accessKeyId: settings.s3AccessKey, secretAccessKey: settings.s3SecretKey }
            : undefined,
      });
  }
  private filename(key: string) {
    if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes('..'))
      throw new Error('Chave de armazenamento inválida');
    return path.join(this.settings.dataDir, 'objects', key);
  }
  async put(key: string, data: Uint8Array, mime: string) {
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.settings.s3Bucket,
          Key: key,
          Body: data,
          ContentType: mime,
        }),
      );
      return;
    }
    const filename = this.filename(key);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, data, { mode: 0o600 });
  }
  async buffer(key: string): Promise<Buffer> {
    if (this.s3) {
      const result = await this.s3.send(
        new GetObjectCommand({ Bucket: this.settings.s3Bucket, Key: key }),
      );
      if (!result.Body) throw new Error('Objeto ausente');
      return Buffer.from(await result.Body.transformToByteArray());
    }
    return readFile(this.filename(key));
  }
  async stream(
    key: string,
    range?: { start: number; end: number },
  ): Promise<{ stream: Readable; size: number }> {
    if (this.s3) {
      const result = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.settings.s3Bucket,
          Key: key,
          Range: range ? 'bytes=' + range.start + '-' + range.end : undefined,
        }),
      );
      return { stream: result.Body as Readable, size: result.ContentLength ?? 0 };
    }
    const filename = this.filename(key),
      info = await stat(filename);
    return {
      stream: createReadStream(filename, range),
      size: range ? range.end - range.start + 1 : info.size,
    };
  }
}

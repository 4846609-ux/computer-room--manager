import { Injectable, Logger } from '@nestjs/common';

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

/**
 * Adapter boundary for object storage (attachments, exports, personal customer
 * files). A production deployment binds an S3/GCS implementation; the default below
 * records intent so the app has no hard dependency during development.
 */
export interface StorageProvider {
  put(key: string, data: Buffer, contentType?: string): Promise<{ key: string; url?: string }>;
  getUrl(key: string, expiresSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}

@Injectable()
export class NoopStorageProvider implements StorageProvider {
  private readonly logger = new Logger('StorageProvider');

  async put(key: string, data: Buffer): Promise<{ key: string }> {
    this.logger.log(`put ${key} (${data.byteLength} bytes)`);
    return { key };
  }

  async getUrl(key: string): Promise<string> {
    return `local://${key}`;
  }

  async delete(key: string): Promise<void> {
    this.logger.log(`delete ${key}`);
  }
}

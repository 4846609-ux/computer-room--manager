import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import type { AppConfig } from '../config/configuration';

/** Argon2id password hashing/verification with configurable cost parameters. */
@Injectable()
export class PasswordService {
  private readonly options: argon2.Options;

  constructor(config: ConfigService<AppConfig, true>) {
    const a = config.get('argon2', { infer: true });
    this.options = {
      type: argon2.argon2id,
      memoryCost: a.memoryCost,
      timeCost: a.timeCost,
      parallelism: a.parallelism,
    };
  }

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, this.options);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}

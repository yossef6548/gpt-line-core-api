import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('redisUrl'));
  }
  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  activeCallKey(phone: string): string {
    return `active_call:${phone}`;
  }

  async acquireActiveCall(phone: string): Promise<boolean> {
    const key = this.activeCallKey(phone);
    const res = await this.client.set(key, '1', 'EX', 6 * 3600, 'NX');
    return res === 'OK';
  }

  async releaseActiveCall(phone: string): Promise<void> {
    await this.client.del(this.activeCallKey(phone));
  }

  async hasActiveCall(phone: string): Promise<boolean> {
    return (await this.client.exists(this.activeCallKey(phone))) === 1;
  }
}

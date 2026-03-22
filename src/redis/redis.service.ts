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

  async acquireActiveCall(phone: string, owner: string): Promise<boolean> {
    const key = this.activeCallKey(phone);
    const res = await this.client.set(key, owner, 'EX', 6 * 3600, 'NX');
    return res === 'OK';
  }

  async releaseActiveCall(phone: string): Promise<void> {
    await this.client.del(this.activeCallKey(phone));
  }

  async releaseActiveCallIfOwner(phone: string, owner: string): Promise<boolean> {
    const key = this.activeCallKey(phone);
    const script = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        redis.call('DEL', KEYS[1])
        return 1
      end
      return 0
    `;
    const result = await this.client.eval(script, 1, key, owner);
    return result === 1;
  }

  async hasActiveCall(phone: string): Promise<boolean> {
    return (await this.client.exists(this.activeCallKey(phone))) === 1;
  }

  async getActiveCallOwner(phone: string): Promise<string | null> {
    return this.client.get(this.activeCallKey(phone));
  }
}

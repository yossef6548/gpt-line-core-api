import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { AppModule } from '../../src/app.module';

describe('Core API integration', () => {
  let app: INestApplication;
  let pg: StartedPostgreSqlContainer;
  let redis: StartedRedisContainer;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:16').start();
    redis = await new RedisContainer('redis:7').start();
    process.env.DATABASE_URL = pg.getConnectionUri();
    process.env.REDIS_URL = redis.getConnectionUrl();
    process.env.INTERNAL_SERVICE_TOKEN = 'internal';
    process.env.ADMIN_API_TOKEN = 'admin';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 180000);

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    await redis?.stop();
  });

  it('ensures caller account and then reads balance', async () => {
    await request(app.getHttpServer())
      .post('/internal/telephony/caller/ensure')
      .set('authorization', 'Bearer internal')
      .send({ phone_e164: '+972501234567', source: 'telephony', provider_call_id: 'pc1' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/internal/telephony/balance/%2B972501234567')
      .set('authorization', 'Bearer internal')
      .expect(200);

    expect(res.body.phone_e164).toBe('+972501234567');
  });
});

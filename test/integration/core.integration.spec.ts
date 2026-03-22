import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { AppModule } from '../../src/app.module';

describe('Core API integration', () => {
  let app: INestApplication;
  let ds: DataSource;
  let pg: StartedPostgreSqlContainer;
  let redis: StartedRedisContainer;

  const auth = { authorization: 'Bearer internal' };
  const adminAuth = { authorization: 'Bearer admin' };
  const phone = '+972501234567';

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:16').start();
    redis = await new RedisContainer('redis:7').start();
    process.env.DATABASE_URL = pg.getConnectionUri();
    process.env.REDIS_URL = redis.getConnectionUrl();
    process.env.INTERNAL_SERVICE_TOKEN = 'internal';
    process.env.ADMIN_API_TOKEN = 'admin';
    process.env.NODE_ENV = 'test';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    ds = moduleRef.get(DataSource);
  }, 180000);

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    await redis?.stop();
  });

  it('auto-create account on ensure caller', async () => {
    const res = await request(app.getHttpServer())
      .post('/internal/telephony/caller/ensure')
      .set(auth)
      .send({ phone_e164: phone, source: 'telephony', provider_call_id: 'pc1' })
      .expect(201);

    expect(res.body).toEqual({ phone_e164: phone, status: 'active' });
  });

  let callSessionId = '';

  it('successful call preflight acquires lock and duplicate simultaneous preflight denied', async () => {
    await request(app.getHttpServer())
      .post('/internal/payments/credit')
      .set(auth)
      .send({ payment_txn_id: 'txn_1', phone_e164: phone, package_code: 'P10', amount_agorot: 5000, granted_seconds: 600, provider_name: 'cardcom', provider_status: 'approved' })
      .expect(201);

    const first = await request(app.getHttpServer())
      .post('/internal/telephony/calls/preflight')
      .set(auth)
      .send({ phone_e164: phone, provider_call_id: 'p1', asterisk_uniqueid: 'a1', started_at: '2026-03-16T09:42:11.120Z' })
      .expect(201);

    expect(first.body.allowed).toBe(true);
    callSessionId = first.body.call_session_id;

    const second = await request(app.getHttpServer())
      .post('/internal/telephony/calls/preflight')
      .set(auth)
      .send({ phone_e164: phone, provider_call_id: 'p2', asterisk_uniqueid: 'a2', started_at: '2026-03-16T09:42:12.120Z' })
      .expect(201);

    expect(second.body).toEqual({ allowed: false, deny_prompt: 'active_call_exists' });
  });

  it('bridge connected updates state', async () => {
    await request(app.getHttpServer())
      .post('/internal/events/bridge-connected')
      .set(auth)
      .send({ call_session_id: callSessionId, phone_e164: phone, connected_at: '2026-03-16T09:42:13.010Z' })
      .expect(201);

    const row = await ds.query('SELECT state, connected_at FROM call_sessions WHERE call_session_id = $1', [callSessionId]);
    expect(row[0].state).toBe('connected');
    expect(row[0].connected_at).toBeTruthy();
  });

  it('warning event creates one pending warning command', async () => {
    await request(app.getHttpServer())
      .post('/internal/events/bridge-warning-due')
      .set(auth)
      .send({ call_session_id: callSessionId, phone_e164: phone, remaining_seconds: 60 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/internal/events/bridge-warning-due')
      .set(auth)
      .send({ call_session_id: callSessionId, phone_e164: phone, remaining_seconds: 60 })
      .expect(201);

    const rows = await ds.query("SELECT count(*)::int as c FROM bridge_commands WHERE call_session_id = $1 AND command='play_warning'", [callSessionId]);
    expect(rows[0].c).toBe(1);
  });

  it('cutoff event creates one pending force-end command', async () => {
    await request(app.getHttpServer())
      .post('/internal/events/bridge-cutoff-due')
      .set(auth)
      .send({ call_session_id: callSessionId, phone_e164: phone })
      .expect(201);

    await request(app.getHttpServer())
      .post('/internal/events/bridge-cutoff-due')
      .set(auth)
      .send({ call_session_id: callSessionId, phone_e164: phone })
      .expect(201);

    const rows = await ds.query("SELECT count(*)::int as c FROM bridge_commands WHERE call_session_id = $1 AND command='force_end' AND is_acknowledged = false", [callSessionId]);
    expect(rows[0].c).toBe(1);
  });

  it('payment credit increments balance and repeated callback does not double-credit', async () => {
    const res = await request(app.getHttpServer())
      .post('/internal/payments/credit')
      .set(auth)
      .send({ payment_txn_id: 'txn_2', phone_e164: phone, package_code: 'P05', amount_agorot: 3000, granted_seconds: 300, provider_name: 'cardcom', provider_status: 'approved' })
      .expect(201);

    const firstBalance = res.body.remaining_seconds;

    const dup = await request(app.getHttpServer())
      .post('/internal/payments/credit')
      .set(auth)
      .send({ payment_txn_id: 'txn_2', phone_e164: phone, package_code: 'P05', amount_agorot: 3000, granted_seconds: 300, provider_name: 'cardcom', provider_status: 'approved' })
      .expect(201);

    expect(dup.body.remaining_seconds).toBe(firstBalance);
  });

  it('end call decrements balance and releases lock', async () => {
    const before = await request(app.getHttpServer())
      .get(`/internal/telephony/balance/${encodeURIComponent(phone)}`)
      .set(auth)
      .expect(200);

    const end = await request(app.getHttpServer())
      .post('/internal/telephony/calls/end')
      .set(auth)
      .send({ call_session_id: callSessionId, phone_e164: phone, ended_reason: 'star_exit', ended_at: '2026-03-16T09:46:21.011Z' })
      .expect(201);

    expect(end.body.ok).toBe(true);
    expect(end.body.remaining_seconds).toBeLessThan(before.body.remaining_seconds);

    const next = await request(app.getHttpServer())
      .post('/internal/telephony/calls/preflight')
      .set(auth)
      .send({ phone_e164: phone, provider_call_id: 'p3', asterisk_uniqueid: 'a3', started_at: '2026-03-16T10:00:00.000Z' })
      .expect(201);

    expect(next.body.allowed).toBe(true);
  });

  it('admin block prevents future preflight', async () => {
    await request(app.getHttpServer())
      .post(`/admin/accounts/${encodeURIComponent(phone)}/block`)
      .set(adminAuth)
      .set('x-admin-identity', 'admin@test')
      .send({ reason: 'fraud' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/internal/telephony/calls/preflight')
      .set(auth)
      .send({ phone_e164: phone, provider_call_id: 'p4', asterisk_uniqueid: 'a4', started_at: '2026-03-16T10:01:00.000Z' })
      .expect(201);

    expect(res.body).toEqual({ allowed: false, deny_prompt: 'account_blocked' });
  });

  it('admin terminate creates backend-revoke force-end command', async () => {
    const activePhone = '+972509999999';
    await request(app.getHttpServer())
      .post('/internal/payments/credit')
      .set(auth)
      .send({ payment_txn_id: 'txn_9', phone_e164: activePhone, package_code: 'P05', amount_agorot: 3000, granted_seconds: 300, provider_name: 'cardcom', provider_status: 'approved' })
      .expect(201);

    const pre = await request(app.getHttpServer())
      .post('/internal/telephony/calls/preflight')
      .set(auth)
      .send({ phone_e164: activePhone, provider_call_id: 'px', asterisk_uniqueid: 'ax', started_at: '2026-03-16T11:00:00.000Z' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/admin/calls/${pre.body.call_session_id}/terminate`)
      .set(adminAuth)
      .set('x-admin-identity', 'admin@test')
      .send({ reason: 'manual_revoke' })
      .expect(201);

    const row = await ds.query("SELECT count(*)::int as c FROM bridge_commands WHERE call_session_id = $1 AND command = 'force_end' AND reason = 'backend_revoke' AND is_acknowledged = false", [pre.body.call_session_id]);
    expect(row[0].c).toBe(1);
  });
});

# gpt-line-core-api

Core business API for GPT-Line (NestJS + TypeScript + PostgreSQL + Redis + TypeORM), implemented from `docs/spec.md`.

## What is implemented
- Canonical `phone_e164` account model (auto-create on caller ensure/balance/preflight/payment paths).
- Telephony call flow: ensure caller, balance phrase in Hebrew, preflight allow/deny, command poll/ack, end-call billing + debit.
- Bridge events: connected/warning/cutoff/ended lifecycle support.
  - `bridge-ended` persists bridge termination metadata (`bridge_ended_at`, `bridge_ended_reason`) idempotently and never debits balance.
- Payments: idempotent credit apply by `payment_txn_id`; balance is credited only for `provider_status=approved`.
- Admin: summary, account list/detail, block/unblock, credit/debit, call list/detail, terminate active call.
  - Admin account detail includes account summary + recent calls/purchases/ledger (with recent-count helpers).
  - Admin account list includes computed `last_call_at`, `lifetime_purchased_seconds`, and `lifetime_consumed_seconds` fields.
- Balance ledger + admin audit log for all mutating balance/admin operations.
- Redis active-call lock with stale-lock reconciliation against PostgreSQL and safe lock release by lock owner.
  - If Redis lock exists, reconciliation checks both lock owner session and active-call rows in PostgreSQL before treating lock as stale.
- Admin summary reports `recent_purchase_count_24h` from persisted credited purchases and `recent_failed_purchase_count_24h` from persisted non-approved payment outcomes.

## Prerequisites
- Node.js 22
- npm
- PostgreSQL 16
- Redis 7
- Docker (required for integration tests)

## Environment
Copy `.env.example` to `.env` and set values:

```bash
cp .env.example .env
```

Required:
- `DATABASE_URL`
- `REDIS_URL`
- `INTERNAL_SERVICE_TOKEN`
- `ADMIN_API_TOKEN`

## Run locally
```bash
npm install
npm run typeorm migration:run -- -d src/database/typeorm.config.ts
npm run start:dev
```

The service automatically runs TypeORM migrations at app startup as well.

## Test
```bash
npm run test:unit
npm run test:integration
```

Notes:
- Unit tests run without containers.
- Integration tests use Testcontainers (PostgreSQL + Redis) and require a working Docker runtime.

## Admin mutating endpoint requirements
All mutating `/admin/*` endpoints require:
- `Authorization: Bearer <ADMIN_API_TOKEN>`
- `x-admin-identity: <non-empty-identity>` header

Mutation request bodies support `reason` where relevant (`block`, `unblock`, `credit`, `debit`, `terminate`).
Missing `x-admin-identity` returns `400 Bad Request` (no silent fallback).

## Internal docs
Swagger is exposed at:
- `GET /internal/docs`

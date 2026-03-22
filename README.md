# gpt-line-core-api

NestJS + TypeScript service implementing the GPT-Line Core Platform API in `docs/spec.md`.

## Features implemented
- Canonical E.164 account model keyed by `phone_e164` only.
- Auto account creation (`active`, zero balance) on first ensure/balance/preflight/payment access.
- Call preflight authorization with deny-prompt mapping and one-active-call Redis lock.
- Call lifecycle tracking, command polling/ack, bridge warning/force-end generation.
- Exact idempotent call finalization debit path.
- Payment credit application with `payment_txn_id` idempotency.
- Append-only balance ledger transactionally coupled with balance changes.
- Admin APIs for account status, balance adjustments, call listings, termination, and audit log writes.
- OpenAPI at `/internal/docs`.

## Tech stack
- Node.js 22
- NestJS 11
- TypeScript
- PostgreSQL 16
- Redis 7
- TypeORM

## Quickstart
```bash
cp .env.example .env
npm install
docker compose up -d postgres redis
npm run typeorm migration:run -- -d src/database/typeorm.config.ts
npm run start:dev
```

## Endpoints
### Internal Telephony
- `POST /internal/telephony/caller/ensure`
- `GET /internal/telephony/balance/:phone_e164`
- `POST /internal/telephony/calls/preflight`
- `GET /internal/telephony/calls/:call_session_id/command`
- `POST /internal/telephony/calls/command/ack`
- `POST /internal/telephony/calls/end`

### Internal Bridge Events
- `POST /internal/events/bridge-connected`
- `POST /internal/events/bridge-warning-due`
- `POST /internal/events/bridge-cutoff-due`
- `POST /internal/events/bridge-ended`

### Internal Payments
- `POST /internal/payments/credit`
- `GET /internal/catalog/packages`

### Admin
- `GET /admin/summary`
- `GET /admin/accounts`
- `GET /admin/accounts/:phone_e164`
- `POST /admin/accounts/:phone_e164/block`
- `POST /admin/accounts/:phone_e164/unblock`
- `POST /admin/accounts/:phone_e164/credit`
- `POST /admin/accounts/:phone_e164/debit`
- `GET /admin/calls`
- `GET /admin/calls/:call_session_id`
- `POST /admin/calls/:call_session_id/terminate`

## Testing
```bash
npm run test:unit
npm run test:integration
```
Integration tests use testcontainers and require Docker.

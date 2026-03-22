# GPT-Line Core API Runbook

## Startup
1. Copy `.env.example` to `.env` and replace tokens.
2. Start infra: `docker compose up -d postgres redis`.
3. Install deps: `npm install`.
4. Run migrations: `npm run typeorm migration:run -- -d src/database/typeorm.config.ts`.
5. Start app: `npm run start:dev`.

## Health checks
- Swagger: `GET /internal/docs`
- Ensure caller: `POST /internal/telephony/caller/ensure`

## Operational notes
- Active call lock key: `active_call:{phone_e164}`, TTL 6h.
- Payment credit and call end are idempotent by `payment_txn_id` and ended call state.
- Debits/credits always write `balance_ledger` in same DB transaction.

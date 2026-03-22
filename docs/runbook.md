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
- Preflight stale-lock handling consults PostgreSQL explicitly:
  - checks the Redis lock owner session state
  - checks for any active call rows (`preflighted|connected|warning_sent`)
  - only then clears stale lock and retries lock acquisition
- Payment credit and call end are idempotent by `payment_txn_id` and ended call state.
- Payment credits mutate balance only when `provider_status=approved`; non-approved statuses return success without purchase/ledger writes.
- Debits/credits always write `balance_ledger` in same DB transaction.
- Payment outcomes are persisted for both approved and non-approved provider callbacks; admin summary derives successful and failed purchase counts from persisted data.
- `POST /internal/events/bridge-ended` stores `bridge_ended_at` / `bridge_ended_reason` only, idempotently, and does not debit.
- Mutating admin endpoints require `x-admin-identity`; missing header is rejected with `400`.

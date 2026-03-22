# GPT-Line Core Platform API Repository Specification
**Service owner:** Backend / business logic developer  
**Primary runtime:** Node.js 22 + TypeScript + PostgreSQL 16 + Redis 7  
**Primary role:** Own all business truth for caller accounts, balances in seconds, package catalog, call authorization, call finalization, bridge-command coordination, credits, debits, ledger history, and admin operations.

---

## 1. Mission

Build the production Core Platform API for GPT-Line. This service is the single source of truth for the product’s business state.

The finished service must:

- treat the caller’s phone number as the only account identifier
- auto-create accounts on first call
- store and expose remaining balance in seconds
- authorize or deny GPT calls
- prevent more than one active paid GPT call per phone number
- compute live-call cutoff timestamps
- finalize call billing exactly and safely
- accept payment credits from the Payments Service
- expose package data to Payments and admin consumers
- expose balance phrasing to Telephony
- accept bridge lifecycle events from the Realtime Bridge
- convert bridge timing events into pending Telephony commands
- expose command polling endpoints for Telephony
- expose admin APIs for the Admin Dashboard
- write an append-only ledger for all balance changes
- guarantee idempotency where needed

This repository must be sufficient for a developer to implement the full backend without opening any other repository.

---

## 2. Hard decisions already locked

The following are final:

- Runtime: **Node.js 22**
- Language: **TypeScript**
- Framework: **NestJS**
- Database: **PostgreSQL 16**
- Cache/coordination: **Redis 7**
- Account identifier: `phone_e164` only
- No numeric user ID anywhere
- Materialized current balance is stored on the account row in seconds
- Every balance change must also be written to an append-only ledger
- One active GPT call per `phone_e164` at a time
- Final call debit is exact whole-second duration rounded up, capped by the caller’s preflight balance
- Package catalog is authoritative in this service
- Admin dashboard reads and writes through this service
- Internal auth uses bearer token
- Timestamps stored in UTC

---

## 3. Canonical shared enums owned by this service

### 3.1 Call ended reason enum

Allowed values:

- `star_exit`
- `caller_hangup`
- `time_expired`
- `system_error`
- `backend_revoke`
- `openai_error`
- `bridge_error`
- `telephony_disconnect`

### 3.2 Deny prompt enum

Allowed values:

- `no_minutes`
- `system_error`
- `account_blocked`
- `account_under_review`
- `active_call_exists`

### 3.3 Bridge command enum

Allowed values:

- `play_warning`
- `force_end`

### 3.4 Payment result prompt enum

Allowed values:

- `payment_success`
- `payment_failed`
- `payment_cancelled`
- `payment_unavailable`

This service is the canonical source for the above values. No other service may expose conflicting enums.

---

## 4. Canonical phone-number contract

This service accepts only canonical E.164 `phone_e164`.

Validation rules:

- starts with `+`
- all remaining characters are digits
- reject anything else with `400 Bad Request`

---

## 5. Repository deliverables

The repository must include:

- NestJS application source
- database migrations
- schema / ORM mappings
- Redis locking utilities
- request validation
- idempotency protections
- internal telephony APIs
- internal bridge-event APIs
- internal payment-credit APIs
- admin APIs
- unit tests
- integration tests against PostgreSQL and Redis
- OpenAPI / Swagger generation for internal endpoints
- Dockerfile
- docker-compose
- `.env.example`
- README and runbook

Do not leave core endpoints as stubs.

---

## 6. Data model

### 6.1 accounts
```sql
CREATE TABLE accounts (
  phone_e164 TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('active','blocked','fraud_review')),
  remaining_seconds INTEGER NOT NULL DEFAULT 0 CHECK (remaining_seconds >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6.2 packages
```sql
CREATE TABLE packages (
  package_code TEXT PRIMARY KEY,
  keypad_digit SMALLINT NOT NULL UNIQUE,
  name_he TEXT NOT NULL,
  price_agorot INTEGER NOT NULL CHECK (price_agorot > 0),
  granted_seconds INTEGER NOT NULL CHECK (granted_seconds > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  display_order SMALLINT NOT NULL
);
```

Seed exactly:

| package_code | keypad_digit | name_he       | price_agorot | granted_seconds |
|--------------|--------------|---------------|--------------|-----------------|
| P05          | 1            | חמש דקות      | 3000         | 300             |
| P10          | 2            | עשר דקות      | 5000         | 600             |
| P20          | 3            | עשרים דקות    | 9000         | 1200            |
| P40          | 4            | ארבעים דקות   | 16000        | 2400            |

### 6.3 call_sessions
```sql
CREATE TABLE call_sessions (
  call_session_id TEXT PRIMARY KEY,
  phone_e164 TEXT NOT NULL REFERENCES accounts(phone_e164),
  provider_call_id TEXT NOT NULL,
  asterisk_uniqueid TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('preflighted','connected','warning_sent','ended')),
  started_at TIMESTAMPTZ NOT NULL,
  connected_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  absolute_cutoff_at TIMESTAMPTZ NOT NULL,
  warning_at_seconds INTEGER NOT NULL DEFAULT 60,
  ended_reason TEXT CHECK (ended_reason IN (
    'star_exit','caller_hangup','time_expired','system_error',
    'backend_revoke','openai_error','bridge_error','telephony_disconnect'
  )),
  billed_seconds INTEGER CHECK (billed_seconds >= 0),
  preflight_remaining_seconds INTEGER NOT NULL CHECK (preflight_remaining_seconds >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6.4 balance_ledger
```sql
CREATE TABLE balance_ledger (
  ledger_id BIGSERIAL PRIMARY KEY,
  phone_e164 TEXT NOT NULL REFERENCES accounts(phone_e164),
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'purchase_credit','call_debit','admin_credit','admin_debit','refund_debit'
  )),
  delta_seconds INTEGER NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6.5 purchase_credits
```sql
CREATE TABLE purchase_credits (
  payment_txn_id TEXT PRIMARY KEY,
  phone_e164 TEXT NOT NULL REFERENCES accounts(phone_e164),
  package_code TEXT NOT NULL REFERENCES packages(package_code),
  amount_agorot INTEGER NOT NULL,
  granted_seconds INTEGER NOT NULL,
  provider_name TEXT NOT NULL,
  provider_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6.6 bridge_commands
```sql
CREATE TABLE bridge_commands (
  command_id BIGSERIAL PRIMARY KEY,
  call_session_id TEXT NOT NULL REFERENCES call_sessions(call_session_id),
  command TEXT NOT NULL CHECK (command IN ('play_warning','force_end')),
  reason TEXT NOT NULL,
  is_acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ
);
```

Rules:

- `play_warning` may appear at most once per call
- only one unacknowledged `force_end` command may exist per call
- Telephony command polling consumes this table logically, but explicit acknowledgment is required

### 6.7 admin_audit_log
```sql
CREATE TABLE admin_audit_log (
  audit_id BIGSERIAL PRIMARY KEY,
  admin_identity TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_phone_e164 TEXT,
  before_json JSONB,
  after_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 7. Core business rules

### Rule 1: Account creation

If `phone_e164` does not exist, create account:

- `status = active`
- `remaining_seconds = 0`

### Rule 2: Allowed statuses

Only `active` accounts may start AI calls and receive payment credits normally.

`blocked` accounts:
- cannot start AI calls
- payment credits are rejected

`fraud_review` accounts:
- cannot start AI calls
- payment credits are rejected

### Rule 3: One active AI call per phone number

At most one active GPT call per `phone_e164`.

Use Redis lock:
`active_call:{phone_e164}`

### Rule 4: Preflight balance check

A call is allowed only if:

- account status is `active`
- `remaining_seconds >= 1`
- no active call lock exists

### Rule 5: Cutoff calculation

At preflight:

`absolute_cutoff_at = now() + remaining_seconds seconds`

### Rule 6: Warning threshold

Default `warning_at_seconds = 60`

### Rule 7: Final debit

At call end:

`billed_seconds = ceil(ended_at - connected_at)`

If `connected_at` is null, billed seconds are 0.

Cap billed seconds by `preflight_remaining_seconds`.

### Rule 8: Transactionality

Whenever balance changes:

- update `accounts.remaining_seconds`
- insert corresponding `balance_ledger` row

in the same DB transaction.

### Rule 9: Payment credit idempotency

Unique by `payment_txn_id`.

Credits are applied only when `provider_status = approved`.
For non-approved statuses, Core returns success without mutating balance or purchase/ledger rows.

### Rule 10: End-call idempotency

Repeated end-call requests must never double-debit.

### Rule 11: Warning command creation

On the first `bridge-warning-due` event for a call that is not ended:

- create one `bridge_commands` row with `command = play_warning`
- ignore duplicates idempotently

### Rule 12: Force-end command creation

Create `force_end` command when:

- `bridge-cutoff-due` arrives
- admin terminate request is accepted
- internal system policy needs revocation in future versions

### Rule 13: Telephony command acknowledgment

Commands remain pending until Telephony explicitly acknowledges them.

---

## 8. Internal APIs for Telephony

### 8.1 Ensure caller exists

`POST /internal/telephony/caller/ensure`

**Request**
```json
{
  "phone_e164": "+972501234567",
  "source": "telephony",
  "provider_call_id": "PJSIP-abc-00001234"
}
```

**Response**
```json
{
  "phone_e164": "+972501234567",
  "status": "active"
}
```

### 8.2 Balance lookup

`GET /internal/telephony/balance/:phone_e164`

**Response**
```json
{
  "phone_e164": "+972501234567",
  "remaining_seconds": 287,
  "speakable_hebrew_text": "נותרו לך 4 דקות ו-47 שניות"
}
```

### 8.3 Call preflight

`POST /internal/telephony/calls/preflight`

**Request**
```json
{
  "phone_e164": "+972501234567",
  "provider_call_id": "PJSIP-abc-00001234",
  "asterisk_uniqueid": "1742111111.152",
  "started_at": "2026-03-16T09:42:11.120Z"
}
```

**Allowed**
```json
{
  "allowed": true,
  "remaining_seconds": 287,
  "warning_at_seconds": 60,
  "absolute_cutoff_epoch_ms": 1773654468120,
  "call_session_id": "call_01JPK9VV71D3Q0N3G2P5R5B8D1"
}
```

**Denied**
```json
{
  "allowed": false,
  "deny_prompt": "no_minutes"
}
```

Deny prompt mapping:

- `remaining_seconds == 0` -> `no_minutes`
- `status == blocked` -> `account_blocked`
- `status == fraud_review` -> `account_under_review`
- existing active call lock -> `active_call_exists`
- unexpected internal failure -> `system_error`

### 8.4 Poll call command

`GET /internal/telephony/calls/:call_session_id/command`

**No command**
```json
{
  "call_session_id": "call_01JPK9VV71D3Q0N3G2P5R5B8D1",
  "pending_command": null
}
```

**Command pending**
```json
{
  "call_session_id": "call_01JPK9VV71D3Q0N3G2P5R5B8D1",
  "pending_command": {
    "command": "play_warning",
    "reason": "time_threshold",
    "created_at": "2026-03-16T09:45:13.000Z"
  }
}
```

### 8.5 Acknowledge call command

`POST /internal/telephony/calls/command/ack`

**Request**
```json
{
  "call_session_id": "call_01JPK9VV71D3Q0N3G2P5R5B8D1",
  "command": "play_warning",
  "executed_at": "2026-03-16T09:45:13.400Z"
}
```

**Response**
```json
{
  "ok": true
}
```

### 8.6 End call

`POST /internal/telephony/calls/end`

**Request**
```json
{
  "call_session_id": "call_01JPK9VV71D3Q0N3G2P5R5B8D1",
  "phone_e164": "+972501234567",
  "ended_reason": "star_exit",
  "ended_at": "2026-03-16T09:46:21.011Z"
}
```

**Behavior**

1. Find session
2. If already ended, return idempotent success
3. Compute billed seconds
4. In one transaction:
   - mark ended
   - set ended reason
   - set ended time
   - set billed seconds
   - decrement balance
   - insert call-debit ledger row
5. Release active call Redis lock

**Response**
```json
{
  "ok": true,
  "billed_seconds": 248,
  "remaining_seconds": 39
}
```

---

## 9. Internal APIs for Bridge events

### 9.1 Bridge connected

`POST /internal/events/bridge-connected`

**Request**
```json
{
  "call_session_id": "call_01JPK9VV71D3Q0N3G2P5R5B8D1",
  "phone_e164": "+972501234567",
  "connected_at": "2026-03-16T09:42:13.010Z"
}
```

Response:
```json
{
  "ok": true
}
```

### 9.2 Bridge warning due

`POST /internal/events/bridge-warning-due`

**Request**
```json
{
  "call_session_id": "call_01JPK9VV71D3Q0N3G2P5R5B8D1",
  "phone_e164": "+972501234567",
  "remaining_seconds": 60
}
```

Behavior:

- if call not ended and warning command not yet created, create `play_warning`
- set state `warning_sent` idempotently

### 9.3 Bridge cutoff due

`POST /internal/events/bridge-cutoff-due`

**Request**
```json
{
  "call_session_id": "call_01JPK9VV71D3Q0N3G2P5R5B8D1",
  "phone_e164": "+972501234567"
}
```

Behavior:

- if call not yet ended, create pending `force_end` command with reason `time_expired` unless already present

### 9.4 Bridge ended

`POST /internal/events/bridge-ended`

**Request**
```json
{
  "call_session_id": "call_01JPK9VV71D3Q0N3G2P5R5B8D1",
  "phone_e164": "+972501234567",
  "ended_at": "2026-03-16T09:46:21.011Z",
  "reason": "star_exit"
}
```

Behavior:

- store/log bridge termination lifecycle info
- do not debit here
- do not conflict with official Telephony end-call debit flow

---

## 10. Internal APIs for Payments

### 10.1 Apply payment credit

`POST /internal/payments/credit`

**Request**
```json
{
  "payment_txn_id": "txn_20260316_123",
  "phone_e164": "+972501234567",
  "package_code": "P10",
  "amount_agorot": 5000,
  "granted_seconds": 600,
  "provider_name": "cardcom",
  "provider_status": "approved"
}
```

**Response**
```json
{
  "ok": true,
  "phone_e164": "+972501234567",
  "remaining_seconds": 887
}
```

Behavior:

- only `provider_status = approved` can increment balance
- non-approved provider statuses are accepted but do not change balance and do not create `purchase_credits` / `balance_ledger` purchase rows
- repeated callbacks are idempotent by `payment_txn_id`

### 10.2 Package catalog

`GET /internal/catalog/packages`

**Response**
```json
{
  "packages": [
    { "package_code": "P05", "keypad_digit": 1, "name_he": "חמש דקות", "price_agorot": 3000, "granted_seconds": 300, "active": true, "display_order": 1 },
    { "package_code": "P10", "keypad_digit": 2, "name_he": "עשר דקות", "price_agorot": 5000, "granted_seconds": 600, "active": true, "display_order": 2 },
    { "package_code": "P20", "keypad_digit": 3, "name_he": "עשרים דקות", "price_agorot": 9000, "granted_seconds": 1200, "active": true, "display_order": 3 },
    { "package_code": "P40", "keypad_digit": 4, "name_he": "ארבעים דקות", "price_agorot": 16000, "granted_seconds": 2400, "active": true, "display_order": 4 }
  ]
}
```

---

## 11. Admin API requirements

### 11.1 Dashboard summary

`GET /admin/summary`

**Response**
```json
{
  "active_call_count": 3,
  "active_account_count": 1250,
  "blocked_account_count": 7,
  "recent_purchase_count_24h": 16,
  "recent_failed_purchase_count_24h": 0
}
```

In v1, Core persists only successful credited purchases in `purchase_credits`.
`recent_failed_purchase_count_24h` is therefore reported as `0` (placeholder field kept for API compatibility).

### 11.2 List accounts

`GET /admin/accounts?search=...&status=...&page=...`

### 11.3 Get account detail

`GET /admin/accounts/:phone_e164`

### 11.4 Block account

`POST /admin/accounts/:phone_e164/block`

### 11.5 Unblock account

`POST /admin/accounts/:phone_e164/unblock`

### 11.6 Admin credit

`POST /admin/accounts/:phone_e164/credit`

### 11.7 Admin debit

`POST /admin/accounts/:phone_e164/debit`

### 11.8 List calls

`GET /admin/calls?page=...&phone=...&state=...`

Response items for active calls must include:

- `estimated_duration_seconds`
- `estimated_remaining_seconds`

in addition to standard timing fields.

### 11.9 Get single call

`GET /admin/calls/:call_session_id`

### 11.10 Terminate active call

`POST /admin/calls/:call_session_id/terminate`

Behavior:

- record admin audit entry
- if call is still active, create pending `force_end` bridge command with reason `backend_revoke`
- do not directly debit the call here
- Telephony later executes the actual termination and normal call-finalization path

### 11.11 Audit logging

Every mutating admin endpoint must write `admin_audit_log`.

---

## 12. Hebrew balance phrasing rules

Required examples:

- `0` -> `לא נותרו לך דקות לשיחה`
- `60` -> `נותרה לך דקה אחת`
- `120` -> `נותרו לך 2 דקות`
- `287` -> `נותרו לך 4 דקות ו-47 שניות`
- `59` -> `נותרו לך 59 שניות`

Implement deterministic phrasing in Core.

---

## 13. Redis requirements

Use Redis for:

- active call lock: `active_call:{phone_e164}`
- optional short-lived idempotency helpers

Redis is not business truth.

Active-call lock behavior:

- set with `NX`
- TTL 6 hours
- release on successful call finalization
- if lock exists during preflight, deny call
- stale-lock reconciliation must consult PostgreSQL

---

## 14. Security requirements

- strict validation on all request bodies
- mask phone numbers in ordinary logs when feasible
- never log raw bearer tokens
- least-privilege DB credentials
- all mutating admin actions require authenticated upstream identity
- avoid overexposing internals in 500 responses
- internal OpenAPI only

---

## 15. Configuration and environment variables

Provide `.env.example` including at least:

```env
PORT=3000
NODE_ENV=development

DATABASE_URL=postgres://...
REDIS_URL=redis://...

INTERNAL_SERVICE_TOKEN=replace_me
ADMIN_API_TOKEN=replace_me

LOG_LEVEL=info
```

---

## 16. Required tests

### 16.1 Unit tests

- phone validation
- Hebrew balance formatter
- call preflight allow path
- call preflight deny by each deny reason
- billed seconds calculation
- billed seconds cap by preflight balance
- idempotent payment credit
- idempotent call end
- warning command creation
- force-end command creation
- command acknowledgment
- admin credit/debit ledger writes

### 16.2 Integration tests

Against PostgreSQL and Redis:

- auto-create account on ensure caller
- successful call preflight acquires lock
- duplicate simultaneous preflight denied
- bridge connected updates state
- warning event creates one pending warning command
- cutoff event creates one pending force-end command
- payment credit increments balance and ledger
- repeated payment callback does not double-credit
- end call decrements balance and releases lock
- admin block prevents future preflight
- admin terminate creates backend-revoke force-end command

---

## 17. Definition of done

This repository is complete only when:

1. Telephony can ensure callers, check balances, preflight calls, poll commands, acknowledge commands, and end calls successfully
2. Payments can apply credits exactly once
3. Bridge can report lifecycle events and timing events without causing double-debits
4. Admin can list accounts, calls, purchases, dashboard summary, and perform adjustments
5. Balances are always correct in seconds
6. Ledger history explains every balance change
7. One active call per phone number is enforced
8. The repo contains all schema, code, tests, and docs needed to run the service end to end

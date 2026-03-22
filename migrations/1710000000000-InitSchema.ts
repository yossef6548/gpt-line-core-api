import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1710000000000 implements MigrationInterface {
  name = 'InitSchema1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        phone_e164 TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('active','blocked','fraud_review')),
        remaining_seconds INTEGER NOT NULL DEFAULT 0 CHECK (remaining_seconds >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS packages (
        package_code TEXT PRIMARY KEY,
        keypad_digit SMALLINT NOT NULL UNIQUE,
        name_he TEXT NOT NULL,
        price_agorot INTEGER NOT NULL CHECK (price_agorot > 0),
        granted_seconds INTEGER NOT NULL CHECK (granted_seconds > 0),
        active BOOLEAN NOT NULL DEFAULT true,
        display_order SMALLINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS call_sessions (
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
        ended_reason TEXT CHECK (ended_reason IN ('star_exit','caller_hangup','time_expired','system_error','backend_revoke','openai_error','bridge_error','telephony_disconnect')),
        billed_seconds INTEGER CHECK (billed_seconds >= 0),
        preflight_remaining_seconds INTEGER NOT NULL CHECK (preflight_remaining_seconds >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS balance_ledger (
        ledger_id BIGSERIAL PRIMARY KEY,
        phone_e164 TEXT NOT NULL REFERENCES accounts(phone_e164),
        entry_type TEXT NOT NULL CHECK (entry_type IN ('purchase_credit','call_debit','admin_credit','admin_debit','refund_debit')),
        delta_seconds INTEGER NOT NULL,
        reference_type TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS purchase_credits (
        payment_txn_id TEXT PRIMARY KEY,
        phone_e164 TEXT NOT NULL REFERENCES accounts(phone_e164),
        package_code TEXT NOT NULL REFERENCES packages(package_code),
        amount_agorot INTEGER NOT NULL,
        granted_seconds INTEGER NOT NULL,
        provider_name TEXT NOT NULL,
        provider_status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS bridge_commands (
        command_id BIGSERIAL PRIMARY KEY,
        call_session_id TEXT NOT NULL REFERENCES call_sessions(call_session_id),
        command TEXT NOT NULL CHECK (command IN ('play_warning','force_end')),
        reason TEXT NOT NULL,
        is_acknowledged BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        acknowledged_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS admin_audit_log (
        audit_id BIGSERIAL PRIMARY KEY,
        admin_identity TEXT NOT NULL,
        action_type TEXT NOT NULL,
        target_phone_e164 TEXT,
        before_json JSONB,
        after_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ux_warning_once_per_call ON bridge_commands(call_session_id, command) WHERE command = 'play_warning';
      CREATE UNIQUE INDEX IF NOT EXISTS ux_force_end_pending_once ON bridge_commands(call_session_id, command, is_acknowledged) WHERE command = 'force_end' AND is_acknowledged = false;
    `);

    await queryRunner.query(`
      INSERT INTO packages(package_code, keypad_digit, name_he, price_agorot, granted_seconds, active, display_order)
      VALUES
        ('P05',1,'חמש דקות',3000,300,true,1),
        ('P10',2,'עשר דקות',5000,600,true,2),
        ('P20',3,'עשרים דקות',9000,1200,true,3),
        ('P40',4,'ארבעים דקות',16000,2400,true,4)
      ON CONFLICT (package_code) DO UPDATE SET
        keypad_digit = EXCLUDED.keypad_digit,
        name_he = EXCLUDED.name_he,
        price_agorot = EXCLUDED.price_agorot,
        granted_seconds = EXCLUDED.granted_seconds,
        active = EXCLUDED.active,
        display_order = EXCLUDED.display_order;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS admin_audit_log, bridge_commands, purchase_credits, balance_ledger, call_sessions, packages, accounts CASCADE;`);
  }
}

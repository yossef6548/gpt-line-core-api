import { MigrationInterface, QueryRunner } from 'typeorm';

export class BridgeEndedAndPackageSeed1710000000001 implements MigrationInterface {
  name = 'BridgeEndedAndPackageSeed1710000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE call_sessions
      ADD COLUMN IF NOT EXISTS bridge_ended_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS bridge_ended_reason TEXT;

      ALTER TABLE call_sessions
      DROP CONSTRAINT IF EXISTS call_sessions_bridge_ended_reason_check;

      ALTER TABLE call_sessions
      ADD CONSTRAINT call_sessions_bridge_ended_reason_check
      CHECK (bridge_ended_reason IS NULL OR bridge_ended_reason IN (
        'star_exit','caller_hangup','time_expired','system_error',
        'backend_revoke','openai_error','bridge_error','telephony_disconnect'
      ));
    `);

  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE call_sessions
      DROP CONSTRAINT IF EXISTS call_sessions_bridge_ended_reason_check;

      ALTER TABLE call_sessions
      DROP COLUMN IF EXISTS bridge_ended_reason,
      DROP COLUMN IF EXISTS bridge_ended_at;
    `);
  }
}

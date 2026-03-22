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
    await queryRunner.query(`
      ALTER TABLE call_sessions
      DROP CONSTRAINT IF EXISTS call_sessions_bridge_ended_reason_check;

      ALTER TABLE call_sessions
      DROP COLUMN IF EXISTS bridge_ended_reason,
      DROP COLUMN IF EXISTS bridge_ended_at;
    `);
  }
}

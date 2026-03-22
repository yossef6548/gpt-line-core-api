import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentOutcomes1710000000002 implements MigrationInterface {
  name = 'PaymentOutcomes1710000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payment_outcomes (
        payment_txn_id TEXT PRIMARY KEY,
        phone_e164 TEXT NOT NULL REFERENCES accounts(phone_e164),
        package_code TEXT NOT NULL REFERENCES packages(package_code),
        amount_agorot INTEGER NOT NULL,
        granted_seconds INTEGER NOT NULL,
        provider_name TEXT NOT NULL,
        provider_status TEXT NOT NULL CHECK (provider_status IN ('approved','failed','cancelled','unavailable')),
        was_credited BOOLEAN NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_payment_outcomes_created_at ON payment_outcomes(created_at);
      CREATE INDEX IF NOT EXISTS idx_payment_outcomes_provider_status_created_at ON payment_outcomes(provider_status, created_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS payment_outcomes;
    `);
  }
}

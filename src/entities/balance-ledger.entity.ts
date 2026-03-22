import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { LedgerEntryType } from '../common/enums';

@Entity('balance_ledger')
export class BalanceLedgerEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  ledger_id!: string;
  @Column({ type: 'text' })
  phone_e164!: string;
  @Column({ type: 'text' })
  entry_type!: LedgerEntryType;
  @Column({ type: 'integer' })
  delta_seconds!: number;
  @Column({ type: 'text' })
  reference_type!: string;
  @Column({ type: 'text' })
  reference_id!: string;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata_json!: Record<string, unknown>;
  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}

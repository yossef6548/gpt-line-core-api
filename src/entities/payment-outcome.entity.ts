import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import type { PaymentProviderStatus } from '../common/enums';

@Entity('payment_outcomes')
export class PaymentOutcomeEntity {
  @PrimaryColumn({ type: 'text' })
  payment_txn_id!: string;

  @Column({ type: 'text' })
  phone_e164!: string;

  @Column({ type: 'text' })
  package_code!: string;

  @Column({ type: 'integer' })
  amount_agorot!: number;

  @Column({ type: 'integer' })
  granted_seconds!: number;

  @Column({ type: 'text' })
  provider_name!: string;

  @Column({ type: 'text' })
  provider_status!: PaymentProviderStatus;

  @Column({ type: 'boolean' })
  was_credited!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}

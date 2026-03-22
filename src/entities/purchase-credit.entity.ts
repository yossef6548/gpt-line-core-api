import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('purchase_credits')
export class PurchaseCreditEntity {
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
  provider_status!: string;
  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}

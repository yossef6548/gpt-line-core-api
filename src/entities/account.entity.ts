import { Column, Entity, PrimaryColumn, UpdateDateColumn, CreateDateColumn } from 'typeorm';

@Entity('accounts')
export class AccountEntity {
  @PrimaryColumn({ type: 'text' })
  phone_e164!: string;

  @Column({ type: 'text' })
  status!: 'active' | 'blocked' | 'fraud_review';

  @Column({ type: 'integer', default: 0 })
  remaining_seconds!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}

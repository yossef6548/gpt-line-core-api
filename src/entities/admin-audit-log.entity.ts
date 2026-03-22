import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('admin_audit_log')
export class AdminAuditLogEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  audit_id!: string;
  @Column({ type: 'text' })
  admin_identity!: string;
  @Column({ type: 'text' })
  action_type!: string;
  @Column({ type: 'text', nullable: true })
  target_phone_e164!: string | null;
  @Column({ type: 'jsonb', nullable: true })
  before_json!: Record<string, unknown> | null;
  @Column({ type: 'jsonb', nullable: true })
  after_json!: Record<string, unknown> | null;
  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}

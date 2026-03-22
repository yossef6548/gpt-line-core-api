import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import type { CallEndedReason, CallState } from '../common/enums';

@Entity('call_sessions')
export class CallSessionEntity {
  @PrimaryColumn({ type: 'text' })
  call_session_id!: string;

  @Column({ type: 'text' })
  phone_e164!: string;

  @Column({ type: 'text' })
  provider_call_id!: string;

  @Column({ type: 'text' })
  asterisk_uniqueid!: string;

  @Column({ type: 'text' })
  state!: CallState;

  @Column({ type: 'timestamptz' })
  started_at!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  connected_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  ended_at!: Date | null;

  @Column({ type: 'timestamptz' })
  absolute_cutoff_at!: Date;

  @Column({ type: 'integer', default: 60 })
  warning_at_seconds!: number;

  @Column({ type: 'text', nullable: true })
  ended_reason!: CallEndedReason | null;

  @Column({ type: 'integer', nullable: true })
  billed_seconds!: number | null;

  @Column({ type: 'integer' })
  preflight_remaining_seconds!: number;

  @Column({ type: 'timestamptz', nullable: true })
  bridge_ended_at!: Date | null;

  @Column({ type: 'text', nullable: true })
  bridge_ended_reason!: CallEndedReason | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { BridgeCommandType } from '../common/enums';

@Entity('bridge_commands')
export class BridgeCommandEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  command_id!: string;
  @Column({ type: 'text' })
  call_session_id!: string;
  @Column({ type: 'text' })
  command!: BridgeCommandType;
  @Column({ type: 'text' })
  reason!: string;
  @Column({ type: 'boolean', default: false })
  is_acknowledged!: boolean;
  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
  @Column({ type: 'timestamptz', nullable: true })
  acknowledged_at!: Date | null;
}

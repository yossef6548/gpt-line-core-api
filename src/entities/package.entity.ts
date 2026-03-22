import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('packages')
export class PackageEntity {
  @PrimaryColumn({ type: 'text' })
  package_code!: string;

  @Column({ type: 'smallint', unique: true })
  keypad_digit!: number;

  @Column({ type: 'text' })
  name_he!: string;

  @Column({ type: 'integer' })
  price_agorot!: number;

  @Column({ type: 'integer' })
  granted_seconds!: number;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'smallint' })
  display_order!: number;
}

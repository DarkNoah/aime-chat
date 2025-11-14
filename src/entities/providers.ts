import { ProviderType } from '@/types/provider';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('providers')
export class Providers {
  @PrimaryColumn()
  id!: string;

  @Column()
  @Index({ unique: true })
  name!: string;

  @Column()
  type!: string;

  @Column({ nullable: true })
  apiBase?: string;

  @Column({ nullable: true })
  apiKey?: string;

  @Column()
  isActive!: boolean;

  @Column('json', { nullable: true })
  models?: any;

  @Column('json', { nullable: true })
  config?: any;

  @Column({ nullable: true })
  icon?: string;
}

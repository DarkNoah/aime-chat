import { ChannelType } from '@/types/channel';
import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('channels')
export class Channels {
  @PrimaryColumn()
  id!: string;

  @Column()
  name!: string;

  @Column({ enum: ['telegram', 'discord'] })
  type!: 'telegram' | 'discord';

  @Column({ default: true })
  enabled!: boolean;

  @Column({ default: true })
  autoStart!: boolean;

  @Column('json', { nullable: true })
  config?: any;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

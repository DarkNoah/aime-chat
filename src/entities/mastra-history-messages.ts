import { ProviderType } from '@/types/provider';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('mastra_history_messages')
export class MastraHistoryMessages {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  thread_id!: string;

  @Column('json')
  content!: string;

  @Column('text')
  role!: string;

  @Column('text')
  type!: string;

  @Column('text')
  createdAt!: string;

  @Column('text', { nullable: true })
  resourceId?: string;
}

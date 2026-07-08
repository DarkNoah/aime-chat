import { nanoid } from '@/utils/nanoid';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('request_logs')
export class RequestLog {
  constructor(data?: Partial<RequestLog>) {
    this.id = nanoid();
    Object.assign(this, data);
  }

  @PrimaryColumn('text')
  id!: string;

  @Index()
  @Column()
  thread_id!: string;

  @Column()
  method!: string;

  @Column()
  url!: string;

  @Column({ type: 'json', nullable: true })
  request_headers?: Record<string, unknown>;

  @Column('text', { nullable: true })
  request_body?: string;

  @Column({ nullable: true })
  status_code?: number;

  @Column({ type: 'json', nullable: true })
  response_headers?: Record<string, unknown>;

  @Column('text', { nullable: true })
  response_body?: string;

  @Column({ nullable: true })
  duration_ms?: number;

  @Column('text', { nullable: true })
  error?: string;

  @Index()
  @Column()
  start_time!: string;

  @CreateDateColumn()
  createdAt!: string;
}

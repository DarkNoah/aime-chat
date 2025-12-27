import { nanoid } from '@/utils/nanoid';
import { LanguageModelUsage } from 'ai';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('mastra_threads_usage')
export class MastraThreadsUsage {
  constructor(
    threadId: string,
    resourceId: string,
    usage?: LanguageModelUsage,
    modelId?: string,
    costs?: any,
  ) {
    this.id = nanoid();
    this.thread_id = threadId;
    this.resource_id = resourceId;
    this.input_tokens = usage?.inputTokens;
    this.output_tokens = usage?.outputTokens;
    this.total_tokens = usage?.totalTokens;
    this.reasoning_tokens = usage?.reasoningTokens;
    this.cached_input_tokens = usage?.cachedInputTokens;
    this.raw_usage = usage;
    this.raw_costs = costs;
    this.model_id = modelId;
  }

  @PrimaryColumn('text')
  id!: string;

  @Column()
  thread_id!: string;

  @Column()
  resource_id!: string;

  @Column({ nullable: true })
  input_tokens?: number;

  @Column({ nullable: true })
  output_tokens?: number;

  @Column({ nullable: true })
  total_tokens?: number;

  @Column({ nullable: true })
  reasoning_tokens?: number;

  @Column({ nullable: true })
  cached_input_tokens?: number;

  @Column({ nullable: true })
  model_id?: string;

  @Column({ type: 'json', nullable: true })
  raw_usage?: any;

  @Column({ type: 'json', nullable: true })
  raw_costs?: any;

  @CreateDateColumn()
  createdAt!: string;
}

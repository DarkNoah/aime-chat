import { nanoid } from '@/utils/nanoid';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  EvalScorerConfig,
  EvalScorerInput,
  EvalScorerKind,
} from '@/types/evals';

@Entity('eval_scorers')
export class EvalScorer {
  constructor(input?: EvalScorerInput) {
    if (!input) return;

    this.id = input.id || `eval-${nanoid()}`;
    this.name = input.name;
    this.description = input.description;
    this.kind = input.kind;
    this.config = input.config;
  }

  @PrimaryColumn()
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'varchar' })
  kind!: EvalScorerKind;

  @Column({ type: 'simple-json' })
  config!: EvalScorerConfig;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

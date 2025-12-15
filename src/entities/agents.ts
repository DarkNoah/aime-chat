import { AgentType } from '@/types/agent';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('agents')
export class Agents {
  constructor(id: string, type: AgentType) {
    this.id = id;
    this.type = type;
    this.isActive = true;
  }

  @PrimaryColumn()
  id!: string;

  @Column()
  @Index({ unique: true })
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  instructions?: string;

  @Column()
  isActive!: boolean;

  @Column('json', { nullable: true })
  suggestions?: string[];

  @Column('json', { nullable: true })
  tools?: string[];

  @Column('json', { nullable: true })
  subAgents?: string[];

  @Column('json', { nullable: true })
  tags?: string[];

  @Column({ enum: AgentType })
  type!: string;

  @Column({ default: false })
  isHidden!: boolean;

  @Column({ nullable: true })
  defaultModelId?: string;
}

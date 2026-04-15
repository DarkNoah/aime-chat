import { nanoid } from '@/utils/nanoid';
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, RelationOptions } from 'typeorm';
import { Projects } from './projects';

@Entity('crons')
export class Crons {
  constructor(name: string, prompt: string, cron: string, projectId?: string) {
    this.id = nanoid();
    this.name = name;
    this.projectId = projectId;
    this.prompt = prompt;
    this.cron = cron;
  }

  @PrimaryColumn()
  id!: string;

  @Index({ unique: true })
  @Column()
  name!: string;

  @Column({ nullable: true })
  projectId?: string;

  @ManyToOne((project) => Projects, (project) => project.id, {
    nullable: true,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  } as RelationOptions)
  @JoinColumn()
  project?: Projects;

  @Column()
  prompt!: string;

  @Column()
  cron!: string;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'json', nullable: true })
  submitOptions?: any;

  @Column({ type: 'datetime', nullable: true })
  lastRunAt?: Date;

  @Column({ type: 'datetime', nullable: true })
  lastRunEndAt?: Date;

  @Column({ type: 'json', nullable: true })
  lastRunResult?: any;
}

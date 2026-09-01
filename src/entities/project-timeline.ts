import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Projects } from './projects';

@Entity('project_timeline_entries')
@Index(['projectId', 'startedAt'])
@Index(['threadId', 'runId'], { unique: true })
export class ProjectTimelineEntry {
  constructor(id: string) {
    this.id = id;
  }

  @PrimaryColumn()
  id!: string;

  @Column()
  projectId!: string;

  @ManyToOne(() => Projects, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project!: Projects;

  @Column()
  threadId!: string;

  @Column()
  runId!: string;

  @Column()
  summary!: string;

  @Column('text')
  detailedSummary!: string;

  @Column('json')
  deliverables!: string[];

  @Column()
  startedAt!: Date;

  @Column()
  endedAt!: Date;

  @Column('integer')
  durationMs!: number;

  @CreateDateColumn()
  createdAt!: Date;
}

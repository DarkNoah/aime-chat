import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  OneToMany,
  UpdateDateColumn,
} from 'typeorm';

@Entity('projects')
export class Projects {
  constructor(id: string) {
    this.id = id;
  }

  @PrimaryColumn()
  id!: string;

  @Column()
  title!: string;

  @Column({ nullable: true })
  path?: string;

  @Column({ nullable: true })
  tag?: string;

  @Column({ nullable: true })
  cron?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column('json', { nullable: true })
  metadata?: any;

  @Column({ nullable: true })
  defaultAgentId?: string;

  @Column({ nullable: true })
  defaultModelId?: string;

  @Column('json', { nullable: true })
  defaultTools?: any;

  @Column('json', { nullable: true })
  defaultSubAgents?: any;

}

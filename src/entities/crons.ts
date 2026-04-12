import { nanoid } from '@/utils/nanoid';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne, PrimaryColumn, RelationOptions } from 'typeorm';
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

}

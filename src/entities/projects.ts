import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('projects')
export class Projects {
  constructor(id: string) {
    this.id = id;
  }

  @PrimaryColumn()
  id!: string;

  @Column()
  @Index({ unique: true })
  title!: string;

  @Column()
  path?: string;
}

import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('agents')
export class Agents {
  @PrimaryColumn()
  id!: string;

  @Column()
  @Index({ unique: true })
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column()
  isActive!: boolean;

  @Column('json', { nullable: true })
  tools?: string[];
}

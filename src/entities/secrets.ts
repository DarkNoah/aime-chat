import { nanoid } from '@/utils/nanoid';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('secrets')
export class Secrets {
  constructor(key: string, value: string, description?: string) {
    this.id = nanoid();
    this.key = key;
    this.value = value;
    this.description = description;
  }

  @PrimaryColumn()
  id!: string;

  @Index({ unique: true })
  @Column()
  key!: string;

  @Column()
  value!: string;

  @Column({ nullable: true })
  description?: string;
}

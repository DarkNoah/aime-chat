import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('settings')
export class Settings {
  constructor(id: string, value: any) {
    this.id = id;
    this.value = value;
  }
  @PrimaryColumn()
  id!: string;

  @Column('json', { nullable: true })
  value?: any;
}

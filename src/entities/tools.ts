import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { ToolType } from '@/types/tool';
@Entity('tools')
export class Tools {
  constructor(id: string, name: string, type: ToolType) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.isActive = false;
  }

  @PrimaryColumn()
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ enum: ToolType })
  type!: string;

  @Column('json', { nullable: true })
  mcpConfig?: any;

  @Column({ default: false })
  isActive?: boolean;

  @Column('json', { nullable: true })
  value?: any;
}

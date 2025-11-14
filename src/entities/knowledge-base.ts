import {
  KnowledgeBaseItemState,
  KnowledgeBaseSourceType,
  VectorStoreType,
} from '@/types/knowledge-base';
import {
  Entity,
  Column,
  PrimaryColumn,
  RelationOptions,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('knowledgebase')
export class KnowledgeBase {
  @PrimaryColumn()
  id!: string;

  @Column()
  name!: string;

  @Column()
  description?: string;

  @Column('json', { nullable: true })
  tags?: any;

  @Column({ enum: VectorStoreType })
  vectorStoreType?: string;

  @Column('json', { nullable: true })
  vectorStoreConfig?: any;

  @Column()
  embedding: string;

  @Column({ nullable: true })
  vectorLength?: number;

  @Column({ nullable: true })
  reranker?: string;

  @OneToMany((type) => KnowledgeBaseItem, (item) => item.knowledgeBase) // note: we will create author property in the Photo class below
  items?: KnowledgeBaseItem[];

  @Column({ default: true })
  isPrivate!: boolean;

  @Column({ nullable: true })
  static?: boolean;

  @Column('json', { nullable: true })
  returnConfig?: any;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('knowledgebase_item')
export class KnowledgeBaseItem {
  @PrimaryColumn()
  id!: string;

  @Column({ nullable: false })
  knowledgeBaseId!: string;

  @ManyToOne((type) => KnowledgeBase, (kb) => kb.items, {
    nullable: false,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  } as RelationOptions)
  @JoinColumn()
  knowledgeBase!: KnowledgeBase;

  @Column()
  name!: string;

  @Column({ nullable: true })
  source?: string;

  @Column({ enum: KnowledgeBaseSourceType })
  sourceType?: string;

  @Column('json', { nullable: true })
  tags?: any;

  @Column('json', { nullable: true })
  metadata?: any;

  @Column()
  isEnable: boolean = true;

  @Column({ enum: KnowledgeBaseItemState })
  state!: string;

  @Column({ nullable: true })
  chunkCount?: number;

  @Column()
  timestamp!: number;

  @Column({ nullable: true })
  sha256?: string;

  @Column('json', { nullable: true })
  config?: any;

  @Column({ nullable: true })
  content?: string;
}

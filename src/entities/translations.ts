import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { ToolType } from '@/types/tool';
import { createHash } from 'crypto';
@Entity('translations')
export class Translations {
  constructor(
    id: string,
    // source?: string,
    // lang?: string,
    // translation?: string,
  ) {
    this.id = id;
    // this.source = source;
    // this.lang = lang;
    // this.translation = translation;
    // this.hash = createHash('sha256').update(source).digest('hex');
  }

  @PrimaryColumn()
  id!: string;

  @Column()
  hash: string;

  @Column()
  source: string;

  @Column()
  lang: string;

  @Column()
  translation: string;
}

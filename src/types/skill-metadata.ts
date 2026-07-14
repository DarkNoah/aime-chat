export type SkillEntrypoints = Record<string, string>;

export interface SkillMetadata {
  title?: string;
  displayName?: string;
  version?: string;
  category?: string;
  icon?: string;
  tags?: string[];
  entrypoints?: SkillEntrypoints;
}

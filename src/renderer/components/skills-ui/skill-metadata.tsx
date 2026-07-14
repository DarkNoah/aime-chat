import type { SkillMetadata } from '@/types/skill-metadata';
import { IconSparkles } from '@tabler/icons-react';
import { Badge } from '../ui/badge';
import { cn } from '@/renderer/lib/utils';

export type SkillDisplayData = SkillMetadata & {
  name: string;
  description?: string;
};

export function getSkillDisplayName(skill: SkillDisplayData) {
  return skill.displayName || skill.title || skill.name;
}

export function getSkillSearchKeywords(skill: SkillDisplayData) {
  return [
    skill.name,
    skill.title,
    skill.displayName,
    skill.category,
    ...(skill.tags || []),
  ].filter((value): value is string => Boolean(value));
}

export function SkillIcon({
  skill,
  className,
}: {
  skill: SkillDisplayData;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground',
        className,
      )}
      aria-hidden="true"
    >
      <IconSparkles className="size-4" />
      {skill.icon ? (
        <img
          src={skill.icon}
          alt=""
          className="absolute inset-0 size-full object-cover"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      ) : null}
    </div>
  );
}

export function SkillMetadataBadges({
  skill,
  maxTags = 2,
  showVersion = true,
  className,
}: {
  skill: SkillDisplayData;
  maxTags?: number;
  showVersion?: boolean;
  className?: string;
}) {
  const tags = (skill.tags || []).slice(0, maxTags);
  if (!skill.category && !skill.version && tags.length === 0) return null;

  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}>
      {skill.category ? (
        <Badge variant="secondary" className="max-w-full truncate">
          {skill.category}
        </Badge>
      ) : null}
      {showVersion && skill.version ? (
        <Badge variant="outline">v{skill.version}</Badge>
      ) : null}
      {tags.map((tag) => (
        <Badge key={tag} variant="outline" className="max-w-36 truncate">
          {tag}
        </Badge>
      ))}
    </div>
  );
}

export function SkillSummary({
  skill,
  compact = false,
  showDescription = true,
  maxTags = 2,
  className,
}: {
  skill: SkillDisplayData;
  compact?: boolean;
  showDescription?: boolean;
  maxTags?: number;
  className?: string;
}) {
  const displayName = getSkillDisplayName(skill);

  return (
    <div className={cn('flex min-w-0 flex-1 items-start gap-3', className)}>
      <SkillIcon skill={skill} className={compact ? 'size-7' : undefined} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">{displayName}</span>
          {compact && skill.version ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              v{skill.version}
            </span>
          ) : null}
        </div>
        {!compact ? (
          <SkillMetadataBadges skill={skill} maxTags={maxTags} showVersion />
        ) : null}
        {compact && skill.category ? (
          <span className="truncate text-xs text-muted-foreground">
            {skill.category}
          </span>
        ) : null}
        {showDescription && skill.description ? (
          <p className="line-clamp-2 text-sm leading-normal text-muted-foreground">
            {skill.description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

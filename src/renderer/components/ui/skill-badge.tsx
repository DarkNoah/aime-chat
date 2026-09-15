import { forwardRef, type ComponentProps } from 'react';
import { cn } from '@/renderer/lib/utils';

export const SkillBadge = forwardRef<HTMLSpanElement, ComponentProps<'span'>>(
  ({ className, ...props }, ref) => (
    <span
      {...props}
      ref={ref}
      data-slot="skill-badge"
      className={cn(
        'mx-0.5 inline-flex max-w-full cursor-default items-center rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 align-baseline font-medium text-primary leading-none',
        'selection:bg-primary/20',
        className,
      )}
    />
  ),
);
SkillBadge.displayName = 'SkillBadge';

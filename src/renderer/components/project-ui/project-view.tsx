import { cn } from '@/renderer/lib/utils';
import { Project } from '@/types/project';
import React, { ForwardedRef } from 'react';

export type ProjectViewProps = {
  project?: Project;
  className?: string;
};

export interface ProjectViewRef {}

export const ProjectView = React.forwardRef<ProjectViewRef, ProjectViewProps>(
  (props: ProjectViewProps, ref: ForwardedRef<ProjectViewRef>) => {
    const { project, className } = props;
    return <div className={cn('', className)}>ProjectView</div>;
  },
);

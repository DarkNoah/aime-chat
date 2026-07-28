import { render, screen } from '@testing-library/react';
import { SkillSummary } from './skill-metadata';

describe('SkillSummary', () => {
  const skill = {
    name: 'review',
    description: 'Review pull requests',
    path: 'skills/review',
  };

  it('shows the repository path when requested', () => {
    render(<SkillSummary skill={skill} showPath />);

    expect(screen.getByText('skills/review')).not.toBeNull();
  });

  it('keeps the repository path hidden by default', () => {
    render(<SkillSummary skill={skill} />);

    expect(screen.queryByText('skills/review')).toBeNull();
  });
});

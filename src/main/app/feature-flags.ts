import { FeatureFlags } from '@/types/app';

const isEnabled = (value: string | undefined) => value === 'true';

export const isPersonalityDisabled = () =>
  isEnabled(process.env.DISABLE_PERSONALITY);

export const isProjectsDisabled = () => isEnabled(process.env.DISABLE_PROJECTS);

export const isMarketDisabled = () => isEnabled(process.env.DISABLE_MARKET);

export const isCronsDisabled = () => isEnabled(process.env.DISABLE_CRONS);

export const isEvalsDisabled = () => isEnabled(process.env.DISABLE_EVALS);
export const isKnowledgeBaseDisabled = () =>
  isEnabled(process.env.DISABLE_KNOWLEDGE_BASE);

export const isAgentsDisabled = () => isEnabled(process.env.DISABLE_AGENTS);

export const getFeatureFlags = (): FeatureFlags => ({
  personalityDisabled: isPersonalityDisabled(),
  projectsDisabled: isProjectsDisabled(),
  marketDisabled: isMarketDisabled(),
  cronsDisabled: isCronsDisabled(),
  knowledgeBaseDisabled: isKnowledgeBaseDisabled(),
  agentsDisabled: isAgentsDisabled(),
  evalsDisabled: isEvalsDisabled(),
});



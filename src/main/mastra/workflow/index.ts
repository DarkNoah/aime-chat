import { createStep, createWorkflow } from '@mastra/core/workflows';
import z from 'zod';

const compressStep = createStep({
  id: 'compress-step',
  description: 'compress messages',
  inputSchema: z.object({
    messages: z.array(z.any()),
    model: z.string(),
  }),
  outputSchema: z.object({
    messages: z.array(z.any()),
  }),
  execute: async ({ inputData, mastra, resumeData, suspend, writer }) => {
    return { messages: [] };
  },
});

export const testWorkflow = createWorkflow({
  id: 'heads-up-workflow',
  inputSchema: z.object({
    messages: z.array(z.any()),
    model: z.string(),
  }),
  outputSchema: z.object({
    famousPerson: z.string(),
    gameWon: z.boolean(),
    guessCount: z.number(),
  }),
  options: {
    shouldPersistSnapshot: ({ workflowStatus }) =>
      workflowStatus === 'suspended',
  },
})
  .then(compressStep)

  .commit();

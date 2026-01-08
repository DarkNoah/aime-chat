import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import { generateText, ToolCallOptions } from 'ai';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';
export interface AskUserQuestionParams extends BaseToolParams {}

const OptionSchema = z
  .object({
    label: z
      .string()
      .describe(
        'The display text for this option that the user will see and select. Should be concise (1-5 words) and clearly describe the choice.',
      ),
    description: z
      .string()
      .describe(
        'Explanation of what this option means or what will happen if chosen. Useful for providing context about trade-offs or implications.',
      ),
  })
  .strict(); // additionalProperties: false

const QuestionItemSchema = z
  .object({
    question: z
      .string()
      .describe(
        'The complete question to ask the user. Should be clear, specific, and end with a question mark. Example: "Which library should we use for date formatting?" If multiSelect is true, phrase it accordingly, e.g. "Which features do you want to enable?"',
      ),
    header: z
      .string()
      .describe(
        'Very short label displayed as a chip/tag (max 12 chars). Examples: "Auth method", "Library", "Approach".',
      ),
    options: z
      .array(OptionSchema)
      .min(2)
      .max(4)
      .describe(
        "The available choices for this question. Must have 2-4 options. Each option should be a distinct, mutually exclusive choice (unless multiSelect is enabled). There should be no 'Other' option, that will be provided automatically.",
      ),
    multiSelect: z
      .boolean()
      .describe(
        'Set to true to allow the user to select multiple options instead of just one. Use when choices are not mutually exclusive.',
      ),
  })
  .strict(); // additionalProperties: false, required 已由 z.object 保证

export class AskUserQuestion extends BaseTool {
  static readonly toolName = 'AskUserQuestion';
  id: string = 'AskUserQuestion';
  description = `Use this tool when you need to ask the user questions during execution. This allows you to:

1. Gather user preferences or requirements
2. Clarify ambiguous instructions
3. Get decisions on implementation choices as you work
4. Offer choices to the user about what direction to take.

Usage notes:

- Users will always be able to select "Other" to provide custom text input
- Use multiSelect: true to allow multiple answers to be selected for a question`;
  inputSchema = z
    .object({
      questions: z
        .array(QuestionItemSchema)
        .min(1)
        .max(4)
        .describe('Questions to ask the user (1-4 questions)'),
    })
    .strict();

  resumeSchema = z.object({
    answers: z.array(
      z.object({
        question: z.string(),
        answer: z.string(),
      }),
    ),
  });
  suspendSchema = z.object({
    reason: z.string(),
  });

  // outputSchema = z.object({
  //   answers: z.array(
  //     z.object({
  //       question: z.string(),
  //       answer: z.string(),
  //     }),
  //   ),
  // });

  constructor(config?: AskUserQuestionParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<
      typeof this.suspendSchema,
      typeof this.resumeSchema
    >,
  ) => {
    const { questions } = inputData;
    const { abortSignal, workflow, agent, mastra } = context;

    if (!agent.resumeData) {
      // mastra.memory?.sa
      return agent.suspend?.({ reason: 'Human approval required.' });
    }

    // const storage = mastra.getStorage();
    // const memoryStore = await storage.getStore('memory');
    // const messages = (
    //   await memoryStore.listMessages({
    //     threadId: agent.threadId,
    //     resourceId: agent.resourceId,
    //   })
    // ).messages;
    // const message = messages.find(
    //   (x) =>
    //     x.role == 'assistant' &&
    //     x.content.parts.find(
    //       (x) =>
    //         x.type == 'tool-invocation' &&
    //         x.toolInvocation.toolCallId == agent.toolCallId,
    //     ),
    // );

    // const toolCallId = agent.toolCallId;

    // delete message.content.metadata?.suspendPayload[toolCallId];
    // await memoryStore.updateMessages({
    //   messages: [
    //     {
    //       id: message.id,
    //       content: {
    //         ...message.content,
    //         metadata: {
    //           ...message.content.metadata,
    //           suspendPayload: {
    //             ...((message.content.metadata?.suspendPayload as Record<
    //               string,
    //               any
    //             >) ?? {}),
    //           },
    //         },
    //       },
    //     },
    //   ],
    // });

    const answers = agent?.resumeData?.answers;
    const answerString = answers
      .map((x) => `"${x.question}" = "${x.answer}"`)
      .join(', ');
    return `User has answered your questions: ${answerString}. You can now continue with the user's answers in mind.`;
  };

  onInputAvailable = async ({ input, toolCallId }) => {
    console.log(`Weather requested for: ${input.city}`);
  };
}

import type { Agent, AgentExecutionOptions } from '@mastra/core/agent';
import type { MessageListInput } from '@mastra/core/agent/message-list';
import type { MastraModelOutput } from '@mastra/core/stream';
import type { Processor, ProcessLLMRequestArgs } from '@mastra/core/processors';
import { filterImagesBeforeSend } from '../utils/message-image-filter';

// Rewrite only the outgoing prompt; persisted messages keep their images.
const messageImagesProcessor = {
  id: 'message-images',
  processLLMRequest: ({ prompt }: Pick<ProcessLLMRequestArgs, 'prompt'>) => ({
    prompt: filterImagesBeforeSend(prompt),
  }),
} satisfies Processor;

export type NextStepResume = {
  toolCallId?: string;
  approved?: boolean;
  resumeData?: Record<string, unknown>;
};

/** The request-dispatch portion of MastraManager.nextStep. */
export async function startNextStep(
  agent: Agent,
  inputMessage: MessageListInput,
  streamOptions: AgentExecutionOptions,
  resume?: NextStepResume,
): Promise<MastraModelOutput<unknown>> {
  // Install the outbound filter at the shared dispatch boundary. Callers do
  // not need to supply it, and restored tool runs receive it as well.
  const options: AgentExecutionOptions = {
    ...streamOptions,
    inputProcessors: [
      ...(streamOptions.inputProcessors ?? []).filter(
        (processor) => processor.id !== messageImagesProcessor.id,
      ),
      messageImagesProcessor,
    ],
  };
  const threadId = options.requestContext.get('threadId' as never) as string;
  const resourceId = options.requestContext.get(
    'resourceId' as never,
  ) as string;
  const { runId } = options;
  const suspendedRuns = await agent.listSuspendedRuns({ threadId, resourceId });

  if (
    runId &&
    resume?.toolCallId &&
    (resume.approved !== undefined || resume.resumeData !== undefined)
  ) {
    const resumeOptions = { ...options, runId, toolCallId: resume.toolCallId };
    if (resume.approved === true) return agent.approveToolCall(resumeOptions);
    if (resume.approved === false) return agent.declineToolCall(resumeOptions);
    return agent.resumeStream({ ...resume.resumeData }, resumeOptions);
  }

  // A new user message declines stale suspended calls before starting a new
  // stream. These calls use the same outbound filtering as normal resumes.
  let input = inputMessage;
  /* eslint-disable no-await-in-loop -- Each decline must finish persisting before the next run starts. */
  for (const suspendedRun of suspendedRuns.runs) {
    for (const toolCall of suspendedRun.toolCalls) {
      const stream = await agent.declineToolCall({
        ...options,
        runId: suspendedRun.runId,
        toolCallId: toolCall.toolCallId,
      });
      // Finish persisting the declined result before starting the next stream.
      await stream.consumeStream();
      const toolResults = await stream.toolResults;
      const toolResult = toolResults.find(
        (result) => result.runId === suspendedRun.runId,
      )?.payload?.result;
      if (Array.isArray(input))
        input = input.map((message) => {
          if (
            typeof message !== 'object' ||
            !('role' in message) ||
            message.role !== 'assistant' ||
            !('parts' in message) ||
            !Array.isArray(message.parts)
          ) {
            return message;
          }
          return {
            ...message,
            parts: message.parts.map((part) =>
              part.state === 'input-available' &&
              part.toolCallId === toolCall.toolCallId
                ? { ...part, state: 'output-available', output: toolResult }
                : part,
            ),
          };
        });
    }
  }
  /* eslint-enable no-await-in-loop */

  return agent.stream(input, options);
}

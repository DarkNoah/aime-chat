import type { ToolExecutionContext } from '@mastra/core/tools' with {
  'resolution-mode': 'import',
};
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';

export interface InteractiveHtmlParams extends BaseToolParams { }

const resumeDataSchema = z
  .record(z.string(), z.unknown())
  .describe('Dynamic JSON object returned by the rendered interaction.');

export class InteractiveHtml extends BaseTool<InteractiveHtmlParams> {
  static readonly toolName = 'InteractiveHtml';

  id: string = InteractiveHtml.toolName;

  description = `Render a custom interactive HTML fragment in the chat and wait for the user to complete it.

Use this only when the interaction genuinely needs a richer UI than AskUserQuestion, such as a form, a visual configurator, a multi-step widget, or a custom interaction condition. Do not use it for ordinary text questions or simple choices.

Use the optional \`tips\` input to show concise instructions or constraints above the interaction.

The HTML runs in an isolated sandbox. It may use inline HTML, CSS, and JavaScript, but it cannot access the host page, Electron/Node APIs, local files, direct network APIs, external subresources, nested frames, or form navigation. Keep scripts finite and event-driven.

To complete the interaction, call this API from the HTML:

\`window.aimeChat.resume({ key: 'any JSON-serializable value' })\`

The object passed to \`resume\` becomes the tool's result exactly as provided. It must be a JSON-serializable object.

For simple forms, declarative submission is also supported:

\`<form data-aime-resume='{"action":"save"}'>...</form>\`

Submitting the form serializes named controls and merges them with the JSON object in \`data-aime-resume\`. A button may also use \`data-aime-resume\`; when it is inside a form, the form values are included. Keep all resources inline because external URLs are blocked.`;

  inputSchema = z.strictObject({
    html: z
      .string()
      .min(1)
      .max(200_000)
      .describe(
        'Interactive HTML fragment rendered in the chat. Keep CSS and JavaScript inline. Complete by calling window.aimeChat.resume(resumeData) or by using data-aime-resume on a form/button.',
      ),
    tips: z
      .string()
      .max(4_000)
      .optional()
      .describe(
        'Optional guidance shown above the interactive content in a tips-style UI. Use it for concise instructions, constraints, or completion guidance.',
      ),
  });

  outputSchema = resumeDataSchema;

  resumeSchema = resumeDataSchema;

  suspendSchema = z.strictObject({
    reason: z.string(),
  });

  execute = async (
    _inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<
      typeof this.suspendSchema,
      typeof this.resumeSchema
    >,
  ) => {
    if (!context.agent?.resumeData) {
      return context.agent?.suspend?.({
        reason: 'Waiting for the user to complete the interactive HTML.',
      } as any);
    }
    if (context.agent?.resumeData?.approved === false) {
      return `User skip this action.`;
    }


    return context.agent.resumeData;
  };
}

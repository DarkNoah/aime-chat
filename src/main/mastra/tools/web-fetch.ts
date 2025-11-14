import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';

export const WebFetch = createTool({
  id: 'WebFetch',
  description: `- Fetches content from a specified URL and processes it using an AI model
- Takes a URL and a prompt as input
- Fetches the URL content, converts HTML to markdown
- Processes the content with the prompt using a small, fast model
- Returns the model's response about the content
- Use this tool when you need to retrieve and analyze web content

Usage notes:
- The URL must be a fully-formed valid URL
- HTTP URLs will be automatically upgraded to HTTPS
- The prompt should describe what information you want to extract from the page
- This tool is read-only and does not modify any files
- Results may be summarized if the content is very large`,
  inputSchema: z.object({
    url: z.string().describe('The URL to fetch content from'),
    prompt: z
      .string()
      .optional()
      .describe('The prompt to run on the fetched content'),
  }),
  outputSchema: z.string(),
  execute: async ({ context: { url, prompt }, runtimeContext }) => {
    const model = runtimeContext.get('model');
    const response = await fetch('https://r.jina.ai/' + url, {
      method: 'GET',
    });
    const data = await response.text();
    if (prompt) {
      const testAgent = new Agent({
        name: 'test-agent',
        instructions: [
          'You are a helpful assistant. help user to understand the web content.',
          '- Try to retain the useful image links(eg. ![alt](image_url)) and source or references links as much as possible.',
          '- Only respond result.',
        ],
        model: model,
      });

      const result = await testAgent.generate(
        [
          {
            role: 'user',
            content: prompt + '\n\n<content>\n' + data + '\n</content>',
          },
        ],
        {
          structuredOutput: {
            schema: z.object({
              content: z.string(),
              assets: z
                .array(
                  z.object({
                    url: z.string(),
                    type: z.enum(['image', 'video', 'audio']),
                  }),
                )
                .optional()
                .describe('The useful assets links(images, videos, audios)'),
            }),
            model: model,
            jsonPromptInjection: true,
          },
        },
      );

      let text = '';
      if (result.object) {
        text = `Content: ${
          result.object.content
        }\n\nUseful Assets: \n${result.object.assets
          ?.map((x) => x.url)
          .join('\n')}`;
      } else {
        text = result.text;
      }
      console.log('WebFetch response', text);

      return text;
    } else {
      console.log('WebFetch response', data);
      return data;
    }
  },
});

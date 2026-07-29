import { hookModelRequestBody } from '../model-request-content';
import { toReadModelOutput } from '@/main/tools/file-system/read-model-output';

describe('hookModelRequestBody', () => {
  it('maps a Responses API tool image into input_image content', () => {
    const body = {
      model: 'gpt-5',
      input: [
        {
          type: 'function_call_output',
          call_id: 'call_read',
          output: JSON.stringify({
            result: [
              { type: 'text', text: 'Image metadata' },
              {
                type: 'image',
                data: 'aW1hZ2U=',
                mimeType: 'image/png',
              },
            ],
          }),
        },
      ],
    };

    expect(JSON.parse(hookModelRequestBody(JSON.stringify(body)))).toEqual({
      model: 'gpt-5',
      input: [
        {
          type: 'function_call_output',
          call_id: 'call_read',
          output: [
            { type: 'input_text', text: 'Image metadata' },
            {
              type: 'input_image',
              image_url: 'data:image/png;base64,aW1hZ2U=',
            },
          ],
        },
      ],
    });
  });

  it('supports Aime and AI SDK image tool-result shapes', () => {
    const body = {
      input: [
        {
          type: 'function_call_output',
          call_id: 'call_content',
          output: JSON.stringify({
            content: [
              {
                type: 'file',
                data: { type: 'data', data: 'Zmlyc3Q=' },
                mediaType: 'image/webp',
              },
            ],
          }),
        },
        {
          type: 'function_call_output',
          call_id: 'call_image_data',
          output: [
            {
              type: 'image-data',
              data: 'data:image/jpeg;base64,c2Vjb25k',
              mediaType: 'image/jpeg',
            },
          ],
        },
        {
          type: 'function_call_output',
          call_id: 'call_model_output',
          output: JSON.stringify(
            toReadModelOutput({
              content: [
                {
                  type: 'image',
                  data: 'dGhpcmQ=',
                  mimeType: 'image/jpeg',
                },
              ],
            }),
          ),
        },
      ],
    };

    expect(
      JSON.parse(hookModelRequestBody(JSON.stringify(body))).input,
    ).toEqual([
      {
        type: 'function_call_output',
        call_id: 'call_content',
        output: [
          {
            type: 'input_image',
            image_url: 'data:image/webp;base64,Zmlyc3Q=',
          },
        ],
      },
      {
        type: 'function_call_output',
        call_id: 'call_image_data',
        output: [
          {
            type: 'input_image',
            image_url: 'data:image/jpeg;base64,c2Vjb25k',
          },
        ],
      },
      {
        type: 'function_call_output',
        call_id: 'call_model_output',
        output: [
          {
            type: 'input_image',
            image_url: 'data:image/jpeg;base64,dGhpcmQ=',
          },
        ],
      },
    ]);
  });

  it('preserves the OpenAI-compatible chat conversion', () => {
    const body = {
      messages: [
        {
          role: 'tool',
          tool_call_id: 'call_read',
          content: JSON.stringify([
            {
              type: 'image-data',
              data: 'aW1hZ2U=',
              mediaType: 'image/png',
            },
          ]),
        },
      ],
    };

    expect(JSON.parse(hookModelRequestBody(JSON.stringify(body)))).toEqual({
      messages: [
        {
          role: 'tool',
          tool_call_id: 'call_read',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: 'data:image/png;base64,aW1hZ2U=',
              },
            },
          ],
        },
      ],
    });
  });

  it('does not change unrelated or already-native request bodies', () => {
    const unrelated = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    });
    const nativeResponses = JSON.stringify({
      input: [
        {
          type: 'function_call_output',
          call_id: 'call_read',
          output: [
            {
              type: 'input_image',
              image_url: 'data:image/png;base64,aW1hZ2U=',
            },
          ],
        },
      ],
    });

    expect(hookModelRequestBody(unrelated)).toBe(unrelated);
    expect(hookModelRequestBody(nativeResponses)).toBe(nativeResponses);
  });
});

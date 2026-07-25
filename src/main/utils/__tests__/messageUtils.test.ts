import { ModelMessage } from 'ai';
import { filterImagePartsForModel } from '../messageUtils';

describe('filterImagePartsForModel', () => {
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What is in this image?' },
        {
          type: 'image',
          image: 'data:image/png;base64,aW1hZ2U=',
          mediaType: 'image/png',
        },
        {
          type: 'file',
          data: 'ZmlsZQ==',
          mediaType: 'application/pdf',
        },
      ],
    },
    {
      role: 'assistant',
      content: 'The image contains a diagram.',
    },
  ];

  it('keeps image parts when the compression model supports vision', () => {
    expect(filterImagePartsForModel(messages, true)).toBe(messages);
  });

  it('removes only image parts when the compression model does not support vision', () => {
    const filteredMessages = filterImagePartsForModel(messages, false);

    expect(filteredMessages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is in this image?' },
          {
            type: 'file',
            data: 'ZmlsZQ==',
            mediaType: 'application/pdf',
          },
        ],
      },
      {
        role: 'assistant',
        content: 'The image contains a diagram.',
      },
    ]);
    expect(messages[0].content).toHaveLength(3);
  });
});

import { InteractiveHtml } from './interactive-html';

describe('InteractiveHtml', () => {
  it('suspends until resume data is provided', async () => {
    const tool = new InteractiveHtml();
    const suspend = jest.fn((payload) => payload);

    const result = await tool.execute({ html: '<button>Continue</button>' }, {
      agent: { suspend },
    } as any);

    expect(suspend).toHaveBeenCalledWith({
      reason: 'Waiting for the user to complete the interactive HTML.',
    });
    expect(result).toEqual({
      reason: 'Waiting for the user to complete the interactive HTML.',
    });
  });

  it('returns the dynamic resume data without changing its shape', async () => {
    const tool = new InteractiveHtml();
    const resumeData = {
      action: 'save',
      values: { name: 'Aime', enabled: true },
    };

    const result = await tool.execute({ html: '<form></form>' }, {
      agent: { resumeData },
    } as any);

    expect(result).toBe(resumeData);
  });

  it('accepts optional tips alongside the required html', () => {
    const tool = new InteractiveHtml();

    expect(
      tool.inputSchema.parse({
        html: '<form></form>',
        tips: 'Complete every field before submitting.',
      }),
    ).toEqual({
      html: '<form></form>',
      tips: 'Complete every field before submitting.',
    });
  });
});

import { getSubAgentThreadId } from './subagent-thread';

describe('getSubAgentThreadId', () => {
  it('derives the persisted thread id from a tool call id', () => {
    expect(getSubAgentThreadId('tool-123')).toBe('subagent:tool-123');
  });

  it('rejects an empty tool call id', () => {
    expect(() => getSubAgentThreadId('   ')).toThrow(
      'toolCallId is required',
    );
  });
});

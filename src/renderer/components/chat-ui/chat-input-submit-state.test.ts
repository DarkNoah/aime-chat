import { getChatInputSubmitState } from './chat-input-submit-state';

describe('getChatInputSubmitState', () => {
  it('uses the submit button as stop while streaming without pending input', () => {
    expect(getChatInputSubmitState('streaming', false)).toEqual({
      disabled: false,
      showSecondaryStop: false,
      status: 'streaming',
    });
  });

  it('uses the submit button for queue submit while streaming with pending input', () => {
    expect(getChatInputSubmitState('streaming', true)).toEqual({
      disabled: false,
      showSecondaryStop: true,
      status: 'ready',
    });
  });

  it('uses the submit button for queue submit while submitted with pending input', () => {
    expect(getChatInputSubmitState('submitted', true)).toEqual({
      disabled: false,
      showSecondaryStop: false,
      status: 'ready',
    });
  });

  it('disables submit when ready without pending input', () => {
    expect(getChatInputSubmitState('ready', false)).toEqual({
      disabled: true,
      showSecondaryStop: false,
      status: 'ready',
    });
  });
});

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { ModelType } from '@/types/provider';
import { ChatModelSelect } from './chat-model-select';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('../ai-elements/prompt-input', () => ({
  PromptInputButton: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('../ai-elements/model-selector', () => {
  const Wrapper = ({ children }: any) => <div>{children}</div>;
  return {
    ModelSelector: Wrapper,
    ModelSelectorContent: Wrapper,
    ModelSelectorEmpty: Wrapper,
    ModelSelectorGroup: Wrapper,
    ModelSelectorInput: () => null,
    ModelSelectorList: Wrapper,
    ModelSelectorLogo: () => null,
    ModelSelectorLogoGroup: Wrapper,
    ModelSelectorName: Wrapper,
    ModelSelectorTrigger: ({ children }: any) => (
      <div data-testid="selected-model">{children}</div>
    ),
    ModelSelectorItem: ({ children, onSelect }: any) => (
      <button type="button" onClick={onSelect}>
        {children}
      </button>
    ),
  };
});

describe('ChatModelSelect controlled value', () => {
  const getAvailableModels = jest.fn();
  const providers = [
    {
      id: 'provider',
      name: 'Provider',
      models: [
        { id: 'provider/A', name: 'Model A' },
        { id: 'provider/B', name: 'Model B' },
      ],
    },
  ];
  beforeEach(() => {
    jest.clearAllMocks();
    getAvailableModels.mockResolvedValue(providers);
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: { providers: { getAvailableModels } },
    });
  });

  it('loads and synchronizes a value without firing a save or fetching on every value change', async () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <ChatModelSelect value="provider/A" onChange={onChange} clearable />,
    );
    await waitFor(() =>
      expect(
        within(screen.getByTestId('selected-model')).getByText('Model A'),
      ).toBeTruthy(),
    );
    expect(onChange).not.toHaveBeenCalled();
    rerender(
      <ChatModelSelect value="provider/B" onChange={onChange} clearable />,
    );
    expect(
      within(screen.getByTestId('selected-model')).getByText('Model B'),
    ).toBeTruthy();
    rerender(<ChatModelSelect value="" onChange={onChange} clearable />);
    expect(
      within(screen.getByTestId('selected-model')).queryByText('Model B'),
    ).toBeNull();
    expect(getAvailableModels).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('emits changes only on user selection and clearing', async () => {
    const onChange = jest.fn();
    render(
      <ChatModelSelect value="provider/A" onChange={onChange} clearable />,
    );
    await screen.findByRole('button', { name: 'Model B' });
    fireEvent.click(screen.getByRole('button', { name: 'Model B' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('provider/B');
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear selected model' }),
    );
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('does not restore a value captured by an outstanding list request', async () => {
    let resolve: (value: any) => void;
    getAvailableModels.mockReturnValueOnce(
      new Promise((_resolve) => {
        resolve = _resolve;
      }),
    );
    const onChange = jest.fn();
    const { rerender } = render(
      <ChatModelSelect value="provider/A" onChange={onChange} />,
    );
    rerender(<ChatModelSelect value="provider/B" onChange={onChange} />);
    await act(async () => {
      resolve(providers);
    });
    expect(
      within(screen.getByTestId('selected-model')).getByText('Model B'),
    ).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores a late model list from the previous model type', async () => {
    let resolveOld: (value: any) => void;
    getAvailableModels.mockReturnValueOnce(
      new Promise((_resolve) => {
        resolveOld = _resolve;
      }),
    );
    const { rerender } = render(
      <ChatModelSelect type={ModelType.LLM} value="provider/A" />,
    );
    rerender(
      <ChatModelSelect type={ModelType.VIDEO_GENERATION} value="provider/B" />,
    );
    await waitFor(() =>
      expect(
        within(screen.getByTestId('selected-model')).getByText('Model B'),
      ).toBeTruthy(),
    );
    await act(async () => {
      resolveOld([]);
    });
    expect(
      within(screen.getByTestId('selected-model')).getByText('Model B'),
    ).toBeTruthy();
  });
});

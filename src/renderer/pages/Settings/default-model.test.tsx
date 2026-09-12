import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useGlobal } from '@/renderer/hooks/use-global';
import { ModelType } from '@/types/provider';
import DefaultModel from './default-model';

jest.mock('@/renderer/hooks/use-global', () => ({ useGlobal: jest.fn() }));
jest.mock('@/renderer/hooks/use-title', () => ({
  useHeader: () => ({ setTitle: jest.fn() }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/renderer/components/chat-ui/chat-model-select', () => ({
  ChatModelSelect: ({ type, value, onChange, clearable }: any) => (
    <select
      aria-label={type || 'llm'}
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
    >
      {clearable && <option value="">Clear</option>}
      <option value="minimax/MiniMax-H3">MiniMax H3</option>
      <option value="minimax/MiniMax-H3-Max">MiniMax H3 Max</option>
    </select>
  ),
}));

describe('default video model setting', () => {
  const updateDefaultModel = jest.fn();
  const existingModels = {
    model: 'chat/model',
    generateImageModel: 'image/model',
    generateVideoModel: 'minimax/MiniMax-H3',
  };
  beforeEach(() => {
    jest.clearAllMocks();
    (useGlobal as jest.Mock).mockReturnValue({
      appInfo: { defaultModel: existingModels },
      updateDefaultModel,
    });
    updateDefaultModel.mockResolvedValue(undefined);
  });

  it('selects video models and persists a change without dropping other defaults', async () => {
    render(<DefaultModel />);
    const selector = screen.getByRole('combobox', {
      name: ModelType.VIDEO_GENERATION,
    }) as HTMLSelectElement;
    expect(selector.value).toBe('minimax/MiniMax-H3');
    fireEvent.change(selector, { target: { value: 'minimax/MiniMax-H3-Max' } });
    await waitFor(() =>
      expect(updateDefaultModel).toHaveBeenCalledWith({
        generateVideoModel: 'minimax/MiniMax-H3-Max',
      }),
    );
  });

  it('allows clearing the default video model', async () => {
    render(<DefaultModel />);
    fireEvent.change(
      screen.getByRole('combobox', { name: ModelType.VIDEO_GENERATION }),
      { target: { value: '' } },
    );
    await waitFor(() =>
      expect(updateDefaultModel).toHaveBeenCalledWith({
        generateVideoModel: '',
      }),
    );
  });
});

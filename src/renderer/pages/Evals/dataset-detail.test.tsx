import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DatasetDetailPage from './dataset-detail';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ id: 'ds' }),
  useNavigate: () => mockNavigate,
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/renderer/hooks/use-global', () => ({
  useGlobal: () => ({ appInfo: { defaultModel: { model: 'provider/model' } } }),
}));
jest.mock('@/renderer/components/chat-ui/chat-model-select', () => ({
  ChatModelSelect: () => <span>model selector</span>,
}));
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

const startExperiment = jest.fn();
const showOpenDialog = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  startExperiment.mockResolvedValue({ experimentId: 'exp' });
  window.electron = {
    evals: {
      getDataset: jest.fn().mockResolvedValue({
        id: 'ds',
        name: 'QA',
        version: 1,
        targetIds: ['agent'],
        scorerIds: ['scorer'],
        defaultWorkspace: '/server/user data/evals/ds',
      }),
      listDatasetItems: jest
        .fn()
        .mockResolvedValue({ items: [{ id: 'item', input: 'Hi' }] }),
      listExperiments: jest.fn().mockResolvedValue({ experiments: [] }),
      listScorers: jest
        .fn()
        .mockResolvedValue([
          { id: 'scorer', name: 'Accuracy', source: 'custom' },
        ]),
      startExperiment,
    },
    agents: {
      getList: jest.fn().mockResolvedValue([{ id: 'agent', name: 'Agent' }]),
    },
    ipcRenderer: { on: jest.fn(() => () => {}) },
    app: { showOpenDialog },
  } as any;
});

const openRunDialog = async () => {
  render(
    <MemoryRouter>
      <DatasetDetailPage />
    </MemoryRouter>,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'evals.run_experiment' }),
  );
  return screen.getByRole('textbox', { name: 'evals.workspace *' });
};

it('prefills the required workspace and submits the default directory', async () => {
  const input = await openRunDialog();
  expect(input).toBeRequired();
  expect(input).toHaveValue('/server/user data/evals/ds');
  fireEvent.click(screen.getByRole('button', { name: 'evals.start' }));
  await waitFor(() =>
    expect(startExperiment).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId: 'ds',
        workspace: '/server/user data/evals/ds',
      }),
    ),
  );
});

it('disables starting with a blank directory and accepts a custom directory', async () => {
  const input = await openRunDialog();
  fireEvent.change(input, { target: { value: '   ' } });
  expect(screen.getByRole('button', { name: 'evals.start' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'evals.start' }));
  expect(startExperiment).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: ' /custom/测评 ' } });
  fireEvent.click(screen.getByRole('button', { name: 'evals.start' }));
  await waitFor(() =>
    expect(startExperiment).toHaveBeenCalledWith(
      expect.objectContaining({ workspace: '/custom/测评' }),
    ),
  );
});

it('keeps the path when the picker is cancelled and uses a selected folder', async () => {
  const input = await openRunDialog();
  showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
  fireEvent.click(
    screen.getByRole('button', { name: 'evals.choose_workspace' }),
  );
  await waitFor(() => expect(showOpenDialog).toHaveBeenCalledTimes(1));
  expect(input).toHaveValue('/server/user data/evals/ds');
  showOpenDialog.mockResolvedValueOnce({
    canceled: false,
    filePaths: ['/selected/folder'],
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'evals.choose_workspace' }),
  );
  await waitFor(() => expect(input).toHaveValue('/selected/folder'));
  fireEvent.click(screen.getByRole('button', { name: 'evals.start' }));
  await waitFor(() =>
    expect(startExperiment).toHaveBeenCalledWith(
      expect.objectContaining({ workspace: '/selected/folder' }),
    ),
  );
});

import { useLocalModelStore } from './use-local-model-store';

describe('useLocalModelStore', () => {
  beforeEach(() => {
    useLocalModelStore.setState({ downloadingIds: new Set() });
  });

  it('keeps a download active until it finishes', () => {
    const { startDownload, finishDownload } = useLocalModelStore.getState();

    expect(startDownload('model-a')).toBe(true);
    expect(useLocalModelStore.getState().downloadingIds.has('model-a')).toBe(
      true,
    );
    expect(startDownload('model-a')).toBe(false);

    finishDownload('model-a');

    expect(useLocalModelStore.getState().downloadingIds.has('model-a')).toBe(
      false,
    );
  });
});

import { useProviderStore } from '@/renderer/store/index';

import useSWR from 'swr';

export const useProviders = () => {
  const swr = useSWR<{
    providers: {
      id: string;
      name: string;
      models: { id: string; name: string }[];
    }[];
    defaultModel?: string;
  }>('/api/models', fetcher, {
    dedupingInterval: 60_000 * 5,
    revalidateOnFocus: false,
    //fallbackData: [],

    onSuccess: (data) => {
      const status = useProviderStore.getState();
      if (!status.defaultModel && data?.providers?.length > 0) {
        const model =
          data.defaultModel ??
          `${data?.providers[0].id}/${data?.providers[0].models[0].id}`;
        useProviderStore.setState({
          defaultModel: model,
        });
      }
    },
  });

  return {
    ...swr,
    isLoading: swr.isLoading,
    isValidating: swr.isValidating,
  };
};

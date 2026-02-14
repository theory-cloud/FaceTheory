export const DEFAULT_NS = 'translation';

export function useTranslation(_config?: unknown) {
  return {
    t: (key: string) => key,
    i18n: {
      language: 'en',
      changeLanguage: () => {},
      loadNamespaces: async () => {},
      setDefaultNamespace: () => {},
    },
  };
}


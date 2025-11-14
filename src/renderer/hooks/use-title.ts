import { useContext } from 'react';
import { HeaderContext } from '../contexts/header-provider';

export function useHeader() {
  const context = useContext(HeaderContext);
  if (!context) {
    throw new Error('useHeader 必须在 HeaderProvider 内使用');
  }
  return context;
}

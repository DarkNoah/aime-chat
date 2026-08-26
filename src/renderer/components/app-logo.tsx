import defaultLogo from '@/../assets/icon.png';
import { useGlobal } from '../hooks/use-global';
import { cn } from '../lib/utils';

/**
 * Renders the bundled icon unless a branded logo was configured through the
 * APP_LOGO environment variable.
 */
export function AppLogo({ className }: { className?: string }) {
  const { appInfo } = useGlobal();

  return (
    <img
      src={appInfo?.logo || defaultLogo}
      alt={appInfo?.name ?? 'logo'}
      className={cn('object-contain', className)}
    />
  );
}

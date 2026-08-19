import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '../../components/ui/sidebar';
import { useHeader } from '../../hooks/use-title';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import About from './about';
import General from './general';
import Providers from './providers';
import Runtime from './runtime';
import LocalModel from './local-model';
import DefaultModel from './default-model';
import Instances from './instances';
import Usage from './usage';
import RequestLogs from './request-logs';
import Channels from './channels';
import Secrets from './secrets';
import Personality from './personality';
import Appearance from './appearance';
import { useGlobal } from '../../hooks/use-global';
import {
  IconAdjustments,
  IconChartBar,
  IconCloud,
  IconBrandTelegram,
  IconCpu,
  IconInfoCircle,
  IconKey,
  IconListDetails,
  IconPlayerPlay,
  IconServer,
  IconSparkles,
  IconMoodSmile,
  IconPalette,
  IconWand,
} from '@tabler/icons-react';

function Settings() {
  const { setTitle } = useHeader();
  const { t } = useTranslation();
  const location = useLocation();
  const { setupStatus } = useGlobal();
  const personalityDisabled = setupStatus?.personalityDisabled ?? false;
  useEffect(() => {
    setTitle(t('settings.settings'));
  }, [setTitle, t]);

  const navItems = [
    {
      key: 'general',
      label: t('settings.general'),
      icon: IconAdjustments,
    },
    {
      key: 'appearance',
      label: t('settings.appearance'),
      icon: IconPalette,
    },
    {
      key: 'providers',
      label: t('settings.providers'),
      icon: IconCloud,
    },
    {
      key: 'runtime',
      label: t('settings.runtime'),
      icon: IconPlayerPlay,
    },
    {
      key: 'local-model',
      label: t('settings.local_model'),
      icon: IconCpu,
    },
    {
      key: 'default-model',
      label: t('settings.default_model'),
      icon: IconSparkles,
    },
    ...(personalityDisabled
      ? []
      : [
          {
            key: 'personality',
            label: t('settings.personality'),
            icon: IconMoodSmile,
          },
        ]),
    {
      key: 'instances',
      label: t('settings.instances'),
      icon: IconServer,
    },
    {
      key: 'channels',
      label: t('settings.channels'),
      icon: IconBrandTelegram,
    },
    {
      key: 'secrets',
      label: t('settings.secrets'),
      icon: IconKey,
    },
    {
      key: 'usage',
      label: t('settings.usage'),
      icon: IconChartBar,
    },
    {
      key: 'request-logs',
      label: t('settings.request_logs'),
      icon: IconListDetails,
    },
    {
      key: 'about',
      label: t('settings.about'),
      icon: IconInfoCircle,
    },
  ];
  return (
    <div className="flex flex-row h-full">
      <div className="p-4 border-r h-full w-48 shrink-0 overflow-y-auto">
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.key} className="group/item mb-1">
              <SidebarMenuButton
                asChild
                isActive={location?.pathname?.startsWith(
                  `/settings/${item.key}`,
                )}
                className="truncate w-full flex flex-row justify-between h-full"
              >
                <Link
                  to={`/settings/${item.key}`}
                  aria-current={
                    location?.pathname?.startsWith(`/settings/${item.key}`)
                      ? 'page'
                      : undefined
                  }
                  className="text-sm flex items-center justify-start gap-2"
                >
                  <item.icon size={16} />
                  {item.label}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          <SidebarMenuItem className="group/item mb-1">
            <SidebarMenuButton
              asChild
              className="truncate w-full flex flex-row justify-between h-full"
            >
              <Link
                to="/setup"
                className="text-sm flex items-center justify-start gap-2"
              >
                <IconWand size={16} />
                {t('settings.setup', 'Setup')}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </div>
      <div className="flex flex-col flex-1 w-full min-w-0">
        <Routes>
          <Route path="general" element={<General />} />
          <Route path="appearance" element={<Appearance />} />
          <Route path="about" element={<About />} />
          <Route path="providers" element={<Providers />} />
          <Route path="runtime" element={<Runtime />} />
          <Route path="local-model" element={<LocalModel />} />
          <Route path="default-model" element={<DefaultModel />} />
          {personalityDisabled ? (
            <Route
              path="personality"
              element={<Navigate to="/settings/general" replace />}
            />
          ) : (
            <Route path="personality" element={<Personality />} />
          )}
          <Route path="instances" element={<Instances />} />
          <Route path="channels" element={<Channels />} />
          <Route path="secrets" element={<Secrets />} />
          <Route path="usage" element={<Usage />} />
          <Route path="request-logs" element={<RequestLogs />} />
        </Routes>
      </div>
    </div>
  );
}

export default Settings;

import { AppSidebar } from '../components/app-sidebar';
import { Button } from '../components/ui/button';
import {
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '../components/ui/sidebar';
import { useHeader } from '../hooks/use-title';
import { useTranslation } from 'react-i18next';
import React, { useEffect, useState } from 'react';
import { ScrollArea } from '../components/ui/scroll-area';

import { Separator } from '../components/ui/separator';
import {
  Link,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import About from './Settings/about';
import General from './Settings/general';
import Providers from './Settings/providers';
import Runtime from './Settings/runtime';
import { Item } from '../components/ui/item';
import LocalModel from './Settings/local-model';
import DefaultModel from './Settings/default-model';

function Settings() {
  const { setTitle } = useHeader();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    setTitle(t('settings.settings'));
  }, [setTitle]);

  const navItems = [
    {
      key: 'general',
      label: t('settings.general'),
    },
    {
      key: 'providers',
      label: t('settings.providers'),
    },
    {
      key: 'runtime',
      label: t('settings.runtime'),
    },
    {
      key: 'local-model',
      label: t('settings.local_model'),
    },
    {
      key: 'default-model',
      label: t('settings.default_model'),
    },
    {
      key: 'about',
      label: t('settings.about'),
    },
  ];
  return (
    <div className="flex flex-row h-full">
      <div className="p-4 border-r h-full w-48">
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem
              key={item.key}
              className="group/item mb-1 cursor-pointer"
              onClick={() => {
                navigate(`/settings/${item.key}`);
              }}
            >
              <SidebarMenuButton
                asChild
                isActive={location?.pathname?.startsWith(
                  `/settings/${item.key}`,
                )}
                className="truncate w-full flex flex-row justify-between h-full"
              >
                <div className="text-sm">{item.label}</div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </div>
      <div className="flex flex-col flex-1 w-full min-w-0">
        <Routes>
          <Route path="general" element={<General />} />
          <Route path="about" element={<About />} />
          <Route path="providers" element={<Providers />} />
          <Route path="runtime" element={<Runtime />} />
          <Route path="local-model" element={<LocalModel />} />
          <Route path="default-model" element={<DefaultModel />} />
        </Routes>
      </div>
    </div>
  );
}

export default Settings;

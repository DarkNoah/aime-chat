import {
  IconCamera,
  IconChartBar,
  IconDashboard,
  IconDatabase,
  IconMessageCircle,
  IconFileAi,
  IconFileDescription,
  IconFileWord,
  IconFolder,
  IconHelp,
  IconInnerShadowTop,
  IconListDetails,
  IconReport,
  IconSearch,
  IconSettings,
  IconUsers,
  IconSparkles,
  IconBrandOpenai,
  IconEdit,
  IconTools,
  IconBook,
  IconRobot,
} from '@tabler/icons-react';
// import { NavMain } from '@/app/(pages)/nav-main';
// import { NavSecondary } from '@/app/dashboard/nav-secondary';
// import { NavUser } from '@/components/nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from './ui/sidebar';
import { Badge } from './ui/badge';
import { useGlobal } from '../hooks/use-global';
import React from 'react';
import { NavItems } from './nav-items';
import { useTranslation } from 'react-i18next';
import ThreadsList from './threads-list';
import { Button } from './ui/button';
import { useLocation, useNavigate } from 'react-router-dom';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { appInfo } = useGlobal();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const navItems = [
    {
      title: t('sidebar.new_chat'),
      url: '/chat',
      icon: IconEdit,
    },
    {
      title: t('sidebar.tools'),
      url: '/tools',
      icon: IconTools,
    },
    {
      title: t('sidebar.knowledge_base'),
      url: '/knowledge-base',
      icon: IconBook,
    },
    {
      title: t('sidebar.agents'),
      url: '/agents',
      icon: IconRobot,
    },
  ];
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex flex-row gap-2">
            <span className="text-base font-semibold">{appInfo?.name}</span>
            {appInfo?.isPackaged === false && (
              <Badge
                variant="outline"
                className="text-muted-foreground  text-xs"
              >
                Dev
              </Badge>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
        <NavItems items={navItems}></NavItems>
        <SidebarSeparator className="ml-0"></SidebarSeparator>
      </SidebarHeader>

      <ThreadsList></ThreadsList>
      {/* <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent className="flex flex-col gap-2"></SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent> */}

      <SidebarFooter>
        <SidebarSeparator className="ml-0"></SidebarSeparator>
        <SidebarMenu>
          <SidebarMenuItem className="flex flex-row gap-2">
            <SidebarMenuButton
              isActive={location.pathname === '/settings'}
              onClick={() => navigate('/settings')}
              className="cursor-pointer"
            >
              <IconSettings></IconSettings>
              {t('sidebar.settings')}
            </SidebarMenuButton>
          </SidebarMenuItem>
          {appInfo?.version}
        </SidebarMenu>

        {/* <div className="flex flex-col gap-2 ">
          <Button
            variant="ghost"
            size="icon-sm"
            className="w-full"
            onClick={() => navigate('/settings')}
          >
            <IconSettings></IconSettings>
            {t('sidebar.settings')}
          </Button>
        </div> */}
      </SidebarFooter>
    </Sidebar>
  );
}

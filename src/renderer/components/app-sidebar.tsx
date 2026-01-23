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
  IconFolderPlus,
  IconBrandGithub,
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
import React, { useEffect, useState } from 'react';
import { NavItems } from './nav-items';
import { useTranslation } from 'react-i18next';
import ThreadsList from './threads-list';
import { Button } from './ui/button';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChatProjectDialog } from './chat-project/chat-project-dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './ui/accordion';
import ProjectsList from './project-list';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { cn } from '../lib/utils';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { appInfo } = useGlobal();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(
    window.localStorage.getItem('activeTab') || 'chat',
  );
  useEffect(() => {
    window.localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (
      location.pathname.startsWith('/projects/') &&
      activeTab !== 'projects'
    ) {
      setActiveTab('projects');
    } else if (location.pathname.startsWith('/chat/') && activeTab !== 'chat') {
      setActiveTab('chat');
    }
  }, [location.pathname]);

  const [openProjectDialog, setOpenProjectDialog] = useState(false);

  const navItems = [
    {
      title: t('sidebar.new_chat'),
      url: '/chat',
      icon: IconEdit,
    },
    {
      title: t('sidebar.new_project'),
      icon: IconFolderPlus,
      onClick: () => {
        console.log('new project');
        setOpenProjectDialog(true);
      },
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
                className="text-muted-foreground text-xs"
              >
                Dev
              </Badge>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
        <NavItems items={navItems}></NavItems>
        <SidebarSeparator className="ml-0"></SidebarSeparator>
      </SidebarHeader>
      <ChatProjectDialog
        open={openProjectDialog}
        onOpenChange={setOpenProjectDialog}
      ></ChatProjectDialog>
      <div className="flex flex-row ">
        <Button
          variant="link"
          size="sm"
          onClick={() => setActiveTab('chat')}
          className={cn(
            'text-xs ',
            activeTab === 'chat'
              ? 'text-foreground underline'
              : 'text-muted-foreground',
            'transition-all duration-300 ease-in-out',
          )}
        >
          {t('common.chat')}
        </Button>
        <Button
          variant="link"
          size="sm"
          onClick={() => setActiveTab('projects')}
          className={cn(
            'text-xs ',
            activeTab === 'projects'
              ? 'text-foreground underline'
              : 'text-muted-foreground',
            'transition-all duration-300 ease-in-out',
          )}
        >
          {t('common.project')}
        </Button>
      </div>

      <ThreadsList
        className={`${activeTab === 'chat' ? 'block' : 'hidden'}`}
      ></ThreadsList>
      <ProjectsList
        className={`${activeTab === 'projects' ? 'block' : 'hidden'}`}
      ></ProjectsList>
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
              onClick={() => window.open('https://github.com/DarkNoah/aime-chat', '_blank')}
              className="cursor-pointer"
            >
              <IconBrandGithub></IconBrandGithub>
              GitHub
            </SidebarMenuButton>
          </SidebarMenuItem>
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

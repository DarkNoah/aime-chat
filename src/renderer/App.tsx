'use client';

import {
  MemoryRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
  Link,
} from 'react-router-dom';
import icon from '../../assets/icon.svg';
import './styles/globals.css';
import { useChat } from '@ai-sdk/react';
import {
  ChatTransport,
  DefaultChatTransport,
  HttpChatTransportInitOptions,
  PrepareReconnectToStreamRequest,
  PrepareSendMessagesRequest,
  ToolUIPart,
  UIMessage,
  UIMessageChunk,
  UIMessagePart,
} from 'ai-v5';

import Home from './pages/Home';
import { AppSidebar } from './components/app-sidebar';
import React, { ReactNode, useMemo, createContext, useEffect } from 'react';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from './components/ui/sidebar';
import { Button } from './components/ui/button';
import { ThemeProvider } from 'next-themes';
import { Separator } from './components/ui/separator';
import LanguageToggle from './components/language-toggle';
import { I18nProvider } from './components/provider/i18n-provider';
import { ModeToggle } from './components/mode-toggle';
// import { Toaster } from './components/ui/sonner';
import { HeaderProvider } from './contexts/header-provider';
import { useHeader } from './hooks/use-title';
// import { t } from 'i18next';
import { useTranslation } from 'react-i18next';
import { GlobalProvider, useGlobal } from './hooks/use-global';
import { AppHeader } from './components/app-header';
import Settings from './pages/Settings';
import Tools from './pages/Tools';
import ChatPage from './pages/ChatPage';
import KnowledgeBasePage from './pages/KnowledgeBase';
import AgentPage from './pages/agents';
import { Toaster } from 'react-hot-toast';
import AgentDetail from './pages/agents/detail';
import { isArray, isString } from '@/utils/is';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from './components/ui/breadcrumb';
import ProjectsPage from './pages/projects';
import { ChatProvider } from './hooks/use-chat';

function Hello() {
  const { setTitle } = useHeader();
  const { appInfo } = useGlobal();
  const { t, i18n } = useTranslation();
  useEffect(() => {
    setTitle(t('hello'));
  }, [setTitle, t, i18n.language]);
  return (
    <div>
      Hello<Button variant="outline">{t('hello')}</Button>
    </div>
  );
}

export function SiteHeader() {
  // const pathname = usePathname();
  // const pageTitle = usePageTitle(pathname);
  const { title, titleAction, setTitle, setTitleAction } = useHeader();

  const location = useLocation();
  useEffect(() => {
    setTitle('');
    setTitleAction('');
  }, [location.pathname]);

  const renderTitle = () => {
    if (isString(title)) {
      return (
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={location.pathname}>{title}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      );
    } else if (
      isArray(title) &&
      title.length > 0 &&
      'title' in title[0] &&
      'path' in title[0]
    ) {
      return (
        <Breadcrumb>
          <BreadcrumbList>
            {title.map((item, index) => {
              return (
                <>
                  <BreadcrumbItem key={item.path}>
                    <BreadcrumbLink asChild>
                      <Link to={item.path}>{item.title}</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  {title.length > index + 1 && <BreadcrumbSeparator />}
                </>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      );
    } else {
      return title as ReactNode;
    }
  };

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium flex-1">{renderTitle()}</h1>
        <div className="ml-auto flex items-center gap-2">{titleAction}</div>
      </div>
    </header>
  );
}

function LayoutPage(props: { children: ReactNode }) {
  const { children } = props;

  return (
    <GlobalProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <I18nProvider>
          {/* <AppHeader></AppHeader> */}
          <ChatProvider>
            <SidebarProvider
              style={
                {
                  '--sidebar-width': 'calc(var(--spacing) * 64)',
                  '--header-height': 'calc(var(--spacing) * 12)',
                } as React.CSSProperties
              }
              className="group/layout"
            >
              <HeaderProvider>
                <AppSidebar variant="inset" className="" />

                <SidebarInset>
                  <SiteHeader></SiteHeader>
                  <div className="@container/main flex-1 min-h-0 flex flex-col max-h-[calc(100vh-var(--header-height)-var(--spacing)*4)]">
                    {children}
                  </div>
                </SidebarInset>
              </HeaderProvider>
              <Toaster />

              {/* <Toaster /> */}
            </SidebarProvider>
          </ChatProvider>
        </I18nProvider>
      </ThemeProvider>
    </GlobalProvider>
  );
}

export default function App() {
  return (
    <Router>
      <LayoutPage>
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat/*" element={<ChatPage />} />
          {/* <Route path="/home" element={<Home />} /> */}
          <Route path="/settings/*" element={<Settings />} />
          <Route path="/tools/*" element={<Tools />} />
          <Route path="/knowledge-base/*" element={<KnowledgeBasePage />} />
          <Route path="/agents" element={<AgentPage />} />
          <Route path="/agents/:id" element={<AgentDetail />} />
          <Route path="/projects/:id" element={<ProjectsPage />} />
        </Routes>
      </LayoutPage>
    </Router>
  );
}

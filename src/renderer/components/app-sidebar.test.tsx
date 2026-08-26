import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { AppSidebar } from './app-sidebar';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/chat' }),
  useNavigate: () => jest.fn(),
}));

let mockFeatureFlags: Record<string, boolean> = {};

jest.mock('../hooks/use-global', () => ({
  useGlobal: () => ({
    appInfo: {
      name: 'Aime Chat',
      version: '0.0.0',
      isPackaged: true,
      featureFlags: mockFeatureFlags,
    },
  }),
}));

jest.mock('../hooks/use-update-state', () => ({
  useUpdateState: () => ({
    status: 'downloaded',
    updateInfo: {
      version: '1.2.3',
    },
  }),
}));

const renderedNavTitles: string[] = [];

jest.mock('./nav-items', () => ({
  NavItems: ({ items }: { items: { title: string }[] }) => {
    renderedNavTitles.splice(
      0,
      renderedNavTitles.length,
      ...items.map((item) => item.title),
    );
    return <div data-testid="nav-items" />;
  },
}));

jest.mock('./threads-list', () => () => <div data-testid="threads-list" />);
jest.mock('./project-list', () => () => <div data-testid="projects-list" />);
jest.mock('./chat-project/chat-project-dialog', () => ({
  ChatProjectDialog: () => <div data-testid="project-dialog" />,
}));

jest.mock('./ui/sidebar', () => ({
  Sidebar: ({ children }: React.PropsWithChildren) => <aside>{children}</aside>,
  SidebarContent: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  SidebarFooter: ({ children }: React.PropsWithChildren) => (
    <footer>{children}</footer>
  ),
  SidebarGroup: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SidebarGroupContent: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  SidebarHeader: ({ children }: React.PropsWithChildren) => (
    <header>{children}</header>
  ),
  SidebarMenu: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SidebarMenuButton: ({
    children,
    isActive,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { isActive?: boolean }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  SidebarMenuItem: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  SidebarSeparator: () => <hr />,
}));

describe('AppSidebar', () => {
  beforeEach(() => {
    mockFeatureFlags = {};
    renderedNavTitles.length = 0;
  });

  it('shows a red dot on the update menu item', () => {
    render(<AppSidebar />);

    expect(screen.getByText('update.downloadedReady')).toBeInTheDocument();
    expect(screen.getByTestId('update-ready-dot')).toHaveClass('bg-red-500');
  });

  it('shows every navigation entry when no feature is disabled', () => {
    render(<AppSidebar />);

    expect(renderedNavTitles).toEqual([
      'sidebar.new_chat',
      'sidebar.new_project',
      'sidebar.tools',
      'sidebar.market',
      'sidebar.crons',
      'sidebar.knowledge_base',
      'sidebar.agents',
    ]);
    expect(screen.getByTestId('projects-list')).toBeInTheDocument();
  });

  it('hides the navigation entries turned off by feature flags', () => {
    mockFeatureFlags = {
      marketDisabled: true,
      cronsDisabled: true,
      knowledgeBaseDisabled: true,
      agentsDisabled: true,
    };

    render(<AppSidebar />);

    expect(renderedNavTitles).toEqual([
      'sidebar.new_chat',
      'sidebar.new_project',
      'sidebar.tools',
    ]);
  });

  it('hides the new project entry and the project list when projects are disabled', () => {
    mockFeatureFlags = { projectsDisabled: true };

    render(<AppSidebar />);

    expect(renderedNavTitles).not.toContain('sidebar.new_project');
    expect(screen.queryByTestId('projects-list')).not.toBeInTheDocument();
    expect(screen.queryByText('common.project')).not.toBeInTheDocument();
    expect(screen.getByTestId('threads-list')).toBeInTheDocument();
  });
});

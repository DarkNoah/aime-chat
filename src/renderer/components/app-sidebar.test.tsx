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

jest.mock('../hooks/use-global', () => ({
  useGlobal: () => ({
    appInfo: {
      name: 'Aime Chat',
      version: '0.0.0',
      isPackaged: true,
    },
  }),
}));

jest.mock('../hooks/use-update-state', () => ({
  useUpdateState: () => ({
    status: 'idle',
    updateInfo: {
      version: '1.2.3',
    },
  }),
}));

jest.mock('./nav-items', () => ({
  NavItems: () => <div data-testid="nav-items" />,
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
  it('shows a red dot on the update menu item', () => {
    render(<AppSidebar />);

    expect(screen.getByText('update.downloadedReady')).toBeInTheDocument();
    expect(screen.getByTestId('update-ready-dot')).toHaveClass('bg-red-500');
  });
});

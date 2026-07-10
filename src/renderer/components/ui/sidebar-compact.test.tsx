import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import React from 'react';
import { Sidebar, SidebarProvider } from './sidebar';

jest.mock('../../hooks/use-mobile', () => ({
  useIsMobile: () => true,
}));

describe('compact sidebar layout', () => {
  it('renders the collapsed desktop icon rail below the mobile breakpoint', () => {
    const { container } = render(
      <SidebarProvider forceDesktop open={false}>
        <Sidebar collapsible="icon">
          <span>Navigation</span>
        </Sidebar>
      </SidebarProvider>,
    );

    const sidebar = container.querySelector(
      '[data-slot="sidebar"][data-state="collapsed"]',
    );
    expect(sidebar).toHaveAttribute('data-collapsible', 'icon');
    expect(sidebar).toHaveClass('block');
    expect(
      container.querySelector('[data-sidebar="sidebar"]'),
    ).not.toHaveAttribute('data-mobile');
  });
});

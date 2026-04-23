'use client';

import * as React from 'react';
import { IconBrightness, type Icon } from '@tabler/icons-react';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/renderer/components/ui/sidebar';
import { ModeToggle } from '@/renderer/components/mode-toggle';
import { useNavigate, useLocation } from 'react-router-dom';

export function NavItems({
  items,
  ...props
}: {
  items: {
    title: string;
    url?: string;
    icon: Icon;
    onClick?: () => void;
    isActive: boolean;
  }[];
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton
            asChild
            onClick={() => {
              if (item.url) {
                navigate(item.url);
              } else {
                item.onClick?.();
              }
            }}
            isActive={item.isActive ?? false}
          >
            <div className="cursor-pointer">
              <item.icon />
              <span>{item.title}</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

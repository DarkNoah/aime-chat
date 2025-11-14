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
import { useNavigate } from 'react-router-dom';

export function NavItems({
  items,
  ...props
}: {
  items: {
    title: string;
    url: string;
    icon: Icon;
  }[];
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const navigate = useNavigate();
  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton
            asChild
            onClick={() => {
              navigate(item.url);
            }}
          >
            <div className="cursor-pointer">
              <item.icon />
              <span>{item.title}</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
      {/* <SidebarMenuItem>
        <SidebarMenuButton asChild>
          <label>
            <IconBrightness />
            Dark Mode
            <span className="ml-auto">
              <ModeToggle />
            </span>
          </label>
        </SidebarMenuButton>
      </SidebarMenuItem> */}
    </SidebarMenu>
  );
}

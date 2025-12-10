import { Tldraw, TLUiOverrides } from 'tldraw';
import 'tldraw/tldraw.css';
import { useTheme } from 'next-themes';
import React, {
  ForwardedRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Button } from '../../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import {
  Copy,
  Download,
  Trash2,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Maximize2,
} from 'lucide-react';

export type ChatCanvasProps = {
  className?: string;
};

export interface ChatCanvasRef {}

export const ChatCanvas = React.forwardRef<ChatCanvasRef, ChatCanvasProps>(
  (props: ChatCanvasProps, ref: ForwardedRef<ChatCanvasRef>) => {
    const { className } = props;
    const { theme } = useTheme();

    const overrides: TLUiOverrides = {
      actions(editor, actions) {
        // You can delete actions, but remember to
        // also delete the menu items that reference them!
        delete actions['insert-embed'];

        // Create a new action or replace an existing one
        actions['my-new-action'] = {
          id: 'my-new-action',
          label: 'My new action',
          readonlyOk: true,
          kbd: 'cmd+u,ctrl+u',
          onSelect(source: any) {
            // Whatever you want to happen when the action is run
            window.alert('My new action just happened!');
          },
        };
        return actions;
      },
      // contextMenu(editor, items, { selectedShapes }) {
      //   return [
      //     ...items,
      //     {
      //       id: 'export-json',
      //       type: 'item',
      //       actionId: 'export-json',
      //     },
      //   ];
      // },
    };

    return <Tldraw overrides={overrides} />;
  },
);

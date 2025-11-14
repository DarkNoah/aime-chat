import { Excalidraw } from '@excalidraw/excalidraw';
import { ExcalidrawProps } from '@excalidraw/excalidraw/types';
import { useTheme } from 'next-themes';
import React, { ForwardedRef } from 'react';

export type ChatCanvasProps = {
  className?: string;
};

export interface ChatCanvasRef {}

export const ChatCanvas = React.forwardRef<ChatCanvasRef, ChatCanvasProps>(
  (props: ChatCanvasProps, ref: ForwardedRef<ChatCanvasRef>) => {
    const { theme } = useTheme();
    return <Excalidraw className={props.className} theme={theme} aiEnabled />;
  },
);

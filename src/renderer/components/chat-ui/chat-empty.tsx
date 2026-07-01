import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import templates from '../../../../assets/market/template/template.json';
import { cn } from '@/renderer/lib/utils';
import { Card, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { ScrollArea, ScrollBar } from '../ui/scroll-area';

type TemplateItem = {
  icon?: string;
  title?: string;
  description?: string;
  prompt?: string;
  agent?: string;
};

export type ChatEmptyProps = {
  children?: React.ReactNode;
  className?: string;
  onClick?: (value: TemplateItem) => void;
};

export const ChatEmpty = ({ children, ...props }: ChatEmptyProps) => {
  const { className, onClick } = props;
  const { t } = useTranslation();
  return (
    <ScrollArea
      className={cn(
        'flex flex-col items-center justify-center gap-2 w-full ',
        className,
      )}
    >
      <div className="flex flex-col items-center justify-center gap-2 mb-6">
        {(templates ?? []).map((template) => (
          <div key={template.title} className=" max-w-[400px] w-[400px]">
            <span className="font-thin">{template.title}</span>
            <small className="text-muted-foreground text-xs font-thin ml-2">
              {template.description}
            </small>
            <ScrollArea className="whitespace-nowrap">
              <div className="flex flex-row gap-4 mb-1">
                {template.items.map((item) => (
                  <Card
                    key={item.title}
                    className={cn(
                      'p-2 shrink-0 h-[100px] max-w-[150px] w-full cursor-pointer hover:bg-accent/80 transition-colors duration-100',
                    )}
                    onClick={() => onClick?.(item)}
                    style={{
                      backgroundColor: item.backgroundColor,
                      color: item.color ?? '#000',
                    }}
                  >
                    <CardHeader className="py-1 px-1">
                      <CardTitle className="line-clamp-1 text-sm">
                        {item.title}
                      </CardTitle>
                      <CardDescription className="break-words whitespace-normal text-wrap line-clamp-3 text-xs">
                        {item.description}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>

              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};

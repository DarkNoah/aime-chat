import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion, type Variants } from 'motion/react';
import { ChevronDownIcon } from 'lucide-react';
import templates from '../../../../assets/market/template/template.json';
import { cn } from '@/renderer/lib/utils';
import { Card, CardHeader, CardTitle, CardDescription } from '../ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../ui/collapsible';
import { ScrollArea } from '../ui/scroll-area';

export type TemplateItem = {
  icon?: string;
  title?: string;
  description?: string;
  prompt?: string;
  agent?: string;
  tools?: string[];
  subAgents?: string[];
};

export type ChatEmptyProps = {
  children?: React.ReactNode;
  className?: string;
  onClick?: (value: TemplateItem) => void;
};

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: 0.05,
    },
  },
};

const groupVariants: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 300,
      damping: 22,
    },
  },
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
      <motion.div
        className="flex flex-col items-center justify-center gap-2 mb-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {(templates ?? []).map((template) => (
          <motion.div
            key={template.title}
            className="w-full px-6"
            variants={groupVariants}
          >
            <Collapsible defaultOpen className="group/template">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 rounded-md py-2 text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <ChevronDownIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]/template:-rotate-90" />
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-thin text-foreground">
                      {template.title}
                    </span>
                    <small className="text-xs font-thin text-muted-foreground">
                      {template.description}
                    </small>
                  </span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 motion-reduce:animate-none">
                <div className="mb-1 flex flex-row flex-wrap gap-4 pt-1">
                  {template.items.map((item) => (
                    <motion.div
                      key={item.title}
                      variants={cardVariants}
                      whileHover={{ y: -4 }}
                      whileTap={{ y: 0 }}
                      transition={{
                        type: 'spring',
                        stiffness: 400,
                        damping: 25,
                      }}
                    >
                      <Card
                        className={cn(
                          'min-h-[100px] w-[150px] max-w-[150px] shrink-0 cursor-pointer p-2 transition-colors duration-100 hover:bg-accent/80',
                        )}
                        onClick={() => onClick?.(item)}
                        style={{
                          backgroundColor: item.backgroundColor,
                          color: item.color ?? '',
                        }}
                      >
                        <CardHeader className="px-1 py-1">
                          <CardTitle
                            className="break-words whitespace-normal text-sm leading-snug text-accent-foreground"
                            style={{
                              color: item.color ?? '',
                            }}
                          >
                            {item.title}
                          </CardTitle>
                          <CardDescription className="wrap-break-word line-clamp-3 whitespace-normal text-wrap text-xs font-thin">
                            {item.description}
                          </CardDescription>
                        </CardHeader>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </motion.div>
        ))}
      </motion.div>
    </ScrollArea>
  );
};

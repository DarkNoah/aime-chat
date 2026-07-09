import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion, type Variants } from 'motion/react';
import templates from '../../../../assets/market/template/template.json';
import { cn } from '@/renderer/lib/utils';
import { Card, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { ScrollArea, ScrollBar } from '../ui/scroll-area';

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
            className=" max-w-[400px] w-[400px]"
            variants={groupVariants}
          >
            <span className="font-thin text-foreground">{template.title}</span>
            <small className="text-muted-foreground text-xs font-thin ml-2">
              {template.description}
            </small>
            <ScrollArea className="whitespace-nowrap">
              <div className="h-2"></div>
              <div className="flex flex-row gap-4 mb-1">
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
                        'p-2 shrink-0 h-[100px] w-[150px] max-w-[150px] cursor-pointer hover:bg-accent/80 transition-colors duration-100',
                      )}
                      onClick={() => onClick?.(item)}
                      style={{
                        backgroundColor: item.backgroundColor,
                        color: item.color ?? '',
                      }}
                    >
                      <CardHeader className="py-1 px-1">
                        <CardTitle
                          className="line-clamp-1 text-sm text-accent-foreground"
                          style={{
                            color: item.color ?? '',
                          }}
                        >
                          {item.title}
                        </CardTitle>
                        <CardDescription className="wrap-break-word whitespace-normal text-wrap line-clamp-3 text-xs font-thin">
                          {item.description}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </motion.div>
                ))}
              </div>

              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </motion.div>
        ))}
      </motion.div>
    </ScrollArea>
  );
};

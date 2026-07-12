import { ToolUIPart } from 'ai';
import React, { ComponentProps, ForwardedRef, useMemo, useState } from 'react';
import { Label } from '../../ui/label';
import { Checkbox } from '../../ui/checkbox';
import { Item, ItemContent, ItemDescription, ItemTitle } from '../../ui/item';
import { ToggleGroup, ToggleGroupItem } from '../../ui/toggle-group';
import {
  IconCheck,
  IconSquare,
  IconSquareCheckFilled,
} from '@tabler/icons-react';
import { Button } from '../../ui/button';
import { RadioGroup, RadioGroupItem } from '../../ui/radio-group';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '../../ui/card';
import { ToolSuspended } from '.';
import { isArray } from '@/utils/is';
import { Input } from '../../ui/input';
import { useTranslation } from 'react-i18next';
import { Streamdown } from '../../ai-elements/streamdown';

export interface CreatePlanMessageRef { }

export type CreatePlanMessageProps = ComponentProps<typeof Card> & {
  part: ToolUIPart;
  title?: string;
  suspendedData?: ToolSuspended;
  onResume?: (resumeData: Record<string, any>) => void;
};

export const CreatePlanMessage = React.forwardRef<
  CreatePlanMessageRef,
  CreatePlanMessageProps
>((props: CreatePlanMessageProps, ref: ForwardedRef<CreatePlanMessageRef>) => {
  const { className, part, title, onResume, suspendedData, ...rest } = props;
  const { t } = useTranslation();
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string[] | string>
  >({});

  const [inputValues, setInputValues] = useState<
    Record<string, string[] | string>
  >({});

  // const handleConfirm = (question: string, option: string[] | string) => {
  //   setSelectedOptions((prev) => {
  //     return {
  //       ...prev,
  //       [question]: isArray(option) ? option.filter((x) => x) : option,
  //     };
  //   });
  // };

  return (
    <div className="rounded-2xl w-fit bg-secondary/50">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{part?.input?.name}</CardTitle>
          <CardDescription>{part?.input?.overview}</CardDescription>
        </CardHeader>
        <CardContent className="px-4 text-sm text-muted-foreground">
          <Streamdown className="text-wrap break-all w-full h-full whitespace-break-spaces">
            {part?.input?.plan}
          </Streamdown>
          <h1>Todos:</h1>
          <hr className="my-2"></hr>
          <div className="flex flex-col gap-2">
            {part?.input?.todos?.map((todo) => (
              <div key={todo.id}>
                <Item variant="outline" size="sm">
                  <ItemTitle>{todo.content}</ItemTitle>
                </Item>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      {/* <Card {...rest} className={cn('w-full', className)}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      </Card> */}
      {part?.state === 'input-available' && (
        <div className="p-4 flex flex-row justify-end gap-2">
          <Button
            className="cursor-pointer"
            disabled={
              Object.keys(selectedOptions).length === 0 ||
              Object.values(selectedOptions).some((x) => !x)
            }
            onClick={() => {
              onResume?.({
                confirmed: true,
              });
            }}
          >
            {t('common.confirm')}
          </Button>
        </div>
      )}
    </div>
  );
});

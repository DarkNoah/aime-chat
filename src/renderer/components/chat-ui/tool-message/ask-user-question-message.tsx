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
import { Card } from '../../ui/card';
import { ToolSuspended } from '.';
import { isArray } from '@/utils/is';
import { Input } from '../../ui/input';

export interface AskUserQuestionMessageRef {}

export type AskUserQuestionMessageProps = ComponentProps<typeof Card> & {
  part: ToolUIPart;
  title?: string;
  suspendedData?: ToolSuspended;
  onResume?: (resumeData: Record<string, any>) => void;
};

export const AskUserQuestionMessage = React.forwardRef<
  AskUserQuestionMessageRef,
  AskUserQuestionMessageProps
>(
  (
    props: AskUserQuestionMessageProps,
    ref: ForwardedRef<AskUserQuestionMessageRef>,
  ) => {
    const { className, part, title, onResume, suspendedData, ...rest } = props;
    const [selectedOptions, setSelectedOptions] = useState<
      Record<string, string[] | string>
    >({});

    const handleSelect = (question: string, option: string[] | string) => {
      setSelectedOptions((prev) => {
        return {
          ...prev,
          [question]: option,
        };
      });
    };

    return (
      <div className="rounded-2xl w-fit bg-secondary/50">
        {part?.input?.questions?.map((question) => {
          return (
            <Item>
              <ItemContent>
                <ItemTitle>{question?.header}</ItemTitle>
                <ItemDescription>{question?.question}</ItemDescription>
                {!question.multiSelect && (
                  <div className="flex flex-col gap-2">
                    <RadioGroup
                      value={
                        (selectedOptions[question.question] as string) || ''
                      }
                      onValueChange={(value) => {
                        handleSelect(question.question, value);
                      }}
                    >
                      {question?.options?.map((option) => {
                        return (
                          <div
                            className={`cursor-pointer flex items-center gap-3 border p-2 rounded-md w-fit ${selectedOptions[question.question] === option.label ? 'bg-secondary' : ''}`}
                          >
                            <RadioGroupItem
                              value={option.label}
                              id={option.label}
                            ></RadioGroupItem>
                            <Label
                              htmlFor={option.label}
                              className="cursor-pointer"
                            >
                              {option.label}
                              <small className="text-xs text-muted-foreground">
                                {option?.description}
                              </small>
                            </Label>
                          </div>
                        );
                      })}
                    </RadioGroup>
                    <Input />
                  </div>
                )}
                {question.multiSelect && (
                  <div className="flex flex-col gap-2">
                    <ToggleGroup
                      type="multiple"
                      variant="outline"
                      spacing={2}
                      size="sm"
                      className="flex flex-col items-start"
                      value={selectedOptions[question.question] as string[]}
                      onValueChange={(value) => {
                        handleSelect(question.question, value);
                      }}
                    >
                      {question?.options.map((option) => {
                        return (
                          <ToggleGroupItem
                            variant="default"
                            value={option.label}
                            id={option.label}
                            aria-label={option.label}
                          >
                            {selectedOptions[question.question]?.includes(
                              option?.label,
                            ) && (
                              <IconSquareCheckFilled></IconSquareCheckFilled>
                            )}

                            {!selectedOptions[question.question]?.includes(
                              option?.label,
                            ) && <IconSquare></IconSquare>}

                            {option?.label}
                            <small className="text-muted-foreground text-xs">
                              {option?.description}
                            </small>
                          </ToggleGroupItem>
                        );
                      })}
                    </ToggleGroup>
                    <Input />
                  </div>
                )}
              </ItemContent>
            </Item>
          );
        })}
        {part?.state === 'input-available' && (
          <div className="p-4">
            <Button
              onClick={() => {
                onResume?.({
                  answers: Object.entries(selectedOptions).map(
                    ([question, answer]) => ({
                      question,
                      answer: isArray(answer) ? answer.join(', ') : answer,
                    }),
                  ),
                });
              }}
            >
              Submit
            </Button>
          </div>
        )}
      </div>
    );
  },
);

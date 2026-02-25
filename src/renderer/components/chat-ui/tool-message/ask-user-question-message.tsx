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
import { useTranslation } from 'react-i18next';

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
    const { t } = useTranslation();
    const [selectedOptions, setSelectedOptions] = useState<
      Record<string, string[] | string>
    >({});

    const [inputValues, setInputValues] = useState<
      Record<string, string[] | string>
    >({});

    const handleSelect = (question: string, option: string[] | string) => {
      setSelectedOptions((prev) => {
        return {
          ...prev,
          [question]: isArray(option) ? option.filter((x) => x) : option,
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
                      <div
                        className={`cursor-pointer flex items-center gap-3 border p-2 rounded-md w-full ${selectedOptions[question.question] === inputValues[question.question] && inputValues[question.question] ? 'bg-secondary' : ''}`}
                      >
                        <RadioGroupItem
                          value={inputValues[question.question] as string}
                          id={`${question.question}_extra`}
                        ></RadioGroupItem>
                        <Input
                          value={
                            (inputValues[question.question] as string) || ''
                          }
                          className="border-none focus-visible:ring-0 focus-visible:ring-offset-0"
                          placeholder={t('common.type_something')}
                          onChange={(e) => {
                            setInputValues({
                              ...inputValues,
                              [question.question]: e.target.value,
                            });
                            handleSelect(question.question, e.target.value);
                          }}
                          onFocus={() => {
                            handleSelect(
                              question.question,
                              inputValues[question.question],
                            );
                          }}
                        />
                      </div>
                    </RadioGroup>
                  </div>
                )}
                {question.multiSelect && (
                  <div className="flex flex-col gap-2">
                    <ToggleGroup
                      type="multiple"
                      variant="outline"
                      spacing={2}
                      size="sm"
                      className="flex flex-col items-start w-full"
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
                            className="flex flex-row gap-1 flex-wrap whitespace-pre-wrap text-left h-auto items-center justify-start"
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
                            <small className="text-muted-foreground text-xs whitespace-pre-wrap text-left">
                              {option?.description}
                            </small>
                          </ToggleGroupItem>
                        );
                      })}
                      <div className="flex flex-row items-center gap-2 w-full">
                        <ToggleGroupItem
                          value={
                            (inputValues[question.question] as string) ??
                            undefined
                          }
                          id={`${question.question}_extra`}
                          className="w-fit border-none justify-start"
                        >
                          {selectedOptions[question.question]?.includes(
                            inputValues[question.question] as string,
                          ) && <IconSquareCheckFilled></IconSquareCheckFilled>}
                          {!selectedOptions[question.question]?.includes(
                            inputValues[question.question] as string,
                          ) && <IconSquare></IconSquare>}
                        </ToggleGroupItem>
                        <Input
                          value={
                            (inputValues[question.question] as string) ||
                            undefined
                          }
                          className="flex-1 w-full border-none focus-visible:ring-0 focus-visible:ring-offset-0"
                          placeholder={t('common.type_something')}
                          onChange={(e) => {
                            setInputValues({
                              ...inputValues,
                              [question.question]: e.target.value,
                            });

                            const v = (
                              (selectedOptions[
                                question.question
                              ] as string[]) ?? []
                            ).filter((x) =>
                              question?.options.map((z) => z.label).includes(x),
                            );

                            handleSelect(question.question, [
                              ...v,
                              e.target.value,
                            ]);
                          }}
                        />
                      </div>
                    </ToggleGroup>
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
              {t('common.submit')}
            </Button>
          </div>
        )}
      </div>
    );
  },
);

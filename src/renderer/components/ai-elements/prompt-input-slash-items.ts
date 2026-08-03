export type PromptInputSlashItem = {
  id: string;
  label: string;
  description?: string;
  group?: 'commands' | 'skills';
  instant?: boolean;
};

export function findInstantSlashItem(
  id: string,
  slashItems: PromptInputSlashItem[],
): PromptInputSlashItem | undefined {
  return slashItems.find((item) => item.id === id && item.instant === true);
}

export function findMatchingSkillSlashItem(
  value: string,
  slashItems: PromptInputSlashItem[],
): PromptInputSlashItem | undefined {
  return slashItems
    .filter((item) => item.group === 'skills')
    .toSorted((a, b) => b.id.length - a.id.length)
    .find((item) => {
      const mentionText = `/${item.id}`;
      const nextCharacter = value.charAt(mentionText.length);
      return (
        value.startsWith(mentionText) &&
        (value.length === mentionText.length || /\s/.test(nextCharacter))
      );
    });
}

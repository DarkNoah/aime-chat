import { Button } from '@/renderer/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/renderer/components/ui/item';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/renderer/components/ui/native-select';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import { useGlobal } from '@/renderer/hooks/use-global';
import { useHeader } from '@/renderer/hooks/use-title';
import { useTranslation } from 'react-i18next';

function Runtime() {
  const { appInfo, getAppInfo } = useGlobal();
  const { setTitle } = useHeader();
  const { t } = useTranslation();
  setTitle(t('runtime'));
  return (
    <div className="flex flex-col gap-2 p-4">
      <Item variant="outline" className="bg-green-200/10">
        <ItemContent>
          <ItemTitle>UV</ItemTitle>
          <ItemDescription>
            A simple item with title and description.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="Select mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="banana">Banana</SelectItem>
                <SelectItem value="system" disabled>
                  Use System
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </ItemActions>
      </Item>
    </div>
  );
}
export default Runtime;

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/renderer/components/ui/button';
import { Progress } from '@/renderer/components/ui/progress';
import { CircleCheckIcon, Loader2Icon, StarIcon } from 'lucide-react';
import { useHeader } from '@/renderer/hooks/use-title';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Input } from '@/renderer/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/renderer/components/ui/dropdown-menu';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { ScrollArea } from '@/renderer/components/ui/scroll-area';
import { SidebarMenu } from '@/renderer/components/ui/sidebar';
import {
  Link,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { Agent, AgentTags } from '@/types/agent';
import { Label } from '@/renderer/components/ui/label';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/renderer/components/ui/toggle-group';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/renderer/components/ui/input-group';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/renderer/components/ui/card';
import { Switch } from '@/renderer/components/ui/switch';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/renderer/components/ui/breadcrumb';

function AgentDetail() {
  const { setTitle } = useHeader();
  const [isRunning, setIsRunning] = useState(false);
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [agent, setAgent] = useState<Agent>();
  // useEffect(() => {
  //   setTitle(t('sidebar.agents'));
  // }, [setTitle, t]);

  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();

  const getAgent = async () => {
    const data = await window.electron.agents.getAgent(id);
    console.log(data);

    setTitle(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/agents">{t('common.agents')}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/agents">{data?.name}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );
    setAgent(data);
  };
  useEffect(() => {
    getAgent();
  }, []);

  const handleStart = () => {};

  return <div className="h-full w-full flex flex-col gap-2 p-4"></div>;
}

export default AgentDetail;

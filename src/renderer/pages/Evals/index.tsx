import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import {
  IconDatabase,
  IconGitCompare,
  IconHistory,
  IconRulerMeasure,
} from '@tabler/icons-react';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/renderer/components/ui/sidebar';
import { useHeader } from '@/renderer/hooks/use-title';
import DatasetsPage from './datasets';
import DatasetDetailPage from './dataset-detail';
import ExperimentDetailPage from './experiment-detail';
import ExperimentsComparePage from './experiments-compare';
import ScorersPage from './scorers';
import SessionsPage from './sessions';

export default function EvalsPage() {
  const { t } = useTranslation();
  const { setTitle } = useHeader();
  const location = useLocation();

  useEffect(() => {
    setTitle(t('evals.title'));
  }, [setTitle, t]);

  const navItems = [
    {
      key: 'datasets',
      label: t('evals.datasets'),
      icon: IconDatabase,
      path: '/evals/datasets',
    },
    {
      key: 'compare',
      label: t('evals.compare'),
      icon: IconGitCompare,
      path: '/evals/compare',
    },
    {
      key: 'scorers',
      label: t('evals.scorers'),
      icon: IconRulerMeasure,
      path: '/evals/scorers',
    },
    {
      key: 'sessions',
      label: t('evals.sessions'),
      icon: IconHistory,
      path: '/evals/sessions',
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col xl:flex-row">
      <aside className="shrink-0 border-b bg-background/95 px-3 py-2 xl:w-48 xl:border-r xl:border-b-0 xl:p-3">
        <SidebarMenu className="grid grid-cols-2 gap-1 sm:grid-cols-4 xl:flex xl:flex-col">
          {navItems.map((item) => {
            const active =
              location.pathname === item.path ||
              location.pathname.startsWith(`${item.path}/`);
            return (
              <SidebarMenuItem key={item.key} className="min-w-0">
                <SidebarMenuButton asChild isActive={active}>
                  <NavLink to={item.path}>
                    <item.icon size={16} />
                    <span>{item.label}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </aside>
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <Routes>
          <Route index element={<Navigate to="datasets" replace />} />
          <Route path="datasets" element={<DatasetsPage />} />
          <Route path="datasets/:id" element={<DatasetDetailPage />} />
          <Route
            path="experiments/:datasetId/:experimentId"
            element={<ExperimentDetailPage />}
          />
          <Route path="compare" element={<ExperimentsComparePage />} />
          <Route path="scorers" element={<ScorersPage />} />
          <Route path="sessions" element={<SessionsPage />} />
        </Routes>
      </main>
    </div>
  );
}

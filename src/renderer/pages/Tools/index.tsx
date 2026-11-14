import { Navigate, Route, Routes } from 'react-router-dom';
import { useGlobal } from '@/renderer/hooks/use-global';
import CapabilityHub from './hub';
import AgentEditor from './agent-editor';
import ToolDetail from './detail';
import SkillGroupDetail from './skill-group-detail';
import { HUB_TAB_STORAGE_KEY, HubTab, isHubTab } from './hub-model';

function DefaultTabRedirect() {
  const { appInfo } = useGlobal();
  const agentsDisabled = appInfo?.featureFlags?.agentsDisabled ?? false;
  const stored = window.localStorage.getItem(HUB_TAB_STORAGE_KEY);
  let tab: HubTab = agentsDisabled ? 'builtin' : 'agents';
  if (isHubTab(stored) && !(agentsDisabled && stored === 'agents')) {
    tab = stored;
  }
  return <Navigate to={tab} replace />;
}

function Tools() {
  return (
    <Routes>
      <Route index element={<DefaultTabRedirect />} />
      <Route path="agents" element={<CapabilityHub tab="agents" />} />
      <Route path="builtin" element={<CapabilityHub tab="builtin" />} />
      <Route path="skills" element={<CapabilityHub tab="skills" />} />
      <Route path="connectors" element={<CapabilityHub tab="connectors" />} />
      <Route path="agents/:id" element={<AgentEditor />} />
      <Route path="skill-group" element={<SkillGroupDetail />} />
      <Route path=":id" element={<ToolDetail />} />
    </Routes>
  );
}

export default Tools;

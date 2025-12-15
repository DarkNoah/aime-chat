import ChatPanel from '@/renderer/components/chat-ui/chat-panel';
import { useGlobal } from '@/renderer/hooks/use-global';
import { useHeader } from '@/renderer/hooks/use-title';
import { useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';

function ProjectsPage() {
  const { id } = useParams();
  const { setTitle } = useHeader();

  const getProjects = useCallback(async () => {
    const data = await window.electron.projects.getProject(id);
    console.log(data);
    setTitle(data?.title || '');
  }, [id, setTitle]);

  useEffect(() => {
    getProjects();
  }, [getProjects]);

  return (
    <div className="h-full w-full @container">
      <ChatPanel projectId={id} className="h-full w-[500px]"></ChatPanel>
    </div>
  );
}

export default ProjectsPage;

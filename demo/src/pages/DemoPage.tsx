import { ScanPane } from 'components/ScanPane/ScanPane';
import { REPOS } from 'data/repos';
import { useState } from 'react';

export function DemoPage() {
  const [repoUrl, setRepoUrl] = useState<string | null>(null);

  return <ScanPane repo={null} repoUrl={repoUrl} suggestions={REPOS} onRepoUrlSubmit={setRepoUrl} />;
}

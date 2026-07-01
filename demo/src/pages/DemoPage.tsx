import { useState } from 'react';

import { ScanPane } from '../components/ScanPane/ScanPane';
import { REPOS } from '../data/repos';

export function DemoPage() {
  const [repoUrl, setRepoUrl] = useState<string | null>(null);

  return <ScanPane repo={null} repoUrl={repoUrl} suggestions={REPOS} onRepoUrlSubmit={setRepoUrl} />;
}

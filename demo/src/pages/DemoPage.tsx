import { useState } from 'react';

import { ScanPane } from '../components/ScanPane/ScanPane';
import { REPOS } from '../data/repos';

export interface DemoPageProps {
  apiBaseUrl?: string | undefined;
}

export function DemoPage({ apiBaseUrl }: DemoPageProps = {}) {
  const [repoUrl, setRepoUrl] = useState<string | null>(null);

  return (
    <ScanPane
      apiBaseUrl={apiBaseUrl}
      repo={null}
      repoUrl={repoUrl}
      suggestions={REPOS}
      onRepoUrlSubmit={setRepoUrl}
    />
  );
}

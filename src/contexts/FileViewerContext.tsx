import React, { createContext, useCallback, useContext, useState } from 'react';
import { useAgents } from '@/hooks/useAgents';
import { AgentFileViewerModal } from '@/components/chat/AgentFileViewerModal';

export interface FileViewerContextValue {
  /** Open the agent file viewer for the given file name (relative to the active agent's workspace). */
  openFile: (fileName: string) => void;
}

const FileViewerContext = createContext<FileViewerContextValue | null>(null);

export function FileViewerProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const { currentAgent } = useAgents();
  const [openFileName, setOpenFileName] = useState<string | null>(null);

  const openFile = useCallback((fileName: string): void => {
    setOpenFileName(fileName);
  }, []);

  const handleClose = useCallback((): void => {
    setOpenFileName(null);
  }, []);

  return (
    <FileViewerContext.Provider value={{ openFile }}>
      {children}
      <AgentFileViewerModal
        visible={openFileName != null}
        fileName={openFileName}
        agentId={currentAgent?.id ?? null}
        onClose={handleClose}
      />
    </FileViewerContext.Provider>
  );
}

export function useFileViewer(): FileViewerContextValue {
  const ctx = useContext(FileViewerContext);
  if (!ctx) {
    throw new Error('useFileViewer requires FileViewerProvider');
  }
  return ctx;
}

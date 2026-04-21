import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Agent } from '@/lib/openclaw/types';
import { useConnection } from '@/contexts/ConnectionContext';

const CURRENT_AGENT_KEY = 'clawboy-current-agent-v1';

export interface AgentsContextValue {
  agents: Agent[];
  currentAgent: Agent | null;
  setCurrentAgent: (agentId: string) => void;
  refreshAgents: () => Promise<void>;
}

const AgentsContext = createContext<AgentsContextValue | null>(null);

function useAgentsInternal(): AgentsContextValue {
  const { client: openClawRef, connectionState } = useConnection();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(CURRENT_AGENT_KEY).then((id) => {
      if (!cancelled && typeof id === 'string' && id.length > 0) {
        setCurrentAgentId(id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshAgents = useCallback(async (): Promise<void> => {
    const oc = openClawRef.current;
    if (!oc || connectionState.status !== 'connected') {
      return;
    }
    const list = await oc.listAgents();
    setAgents(list);
  }, [openClawRef, connectionState.status]);

  useEffect(() => {
    if (connectionState.status !== 'connected') {
      return;
    }
    void refreshAgents();
  }, [connectionState.status, refreshAgents]);

  const setCurrentAgent = useCallback((agentId: string): void => {
    setCurrentAgentId(agentId);
    void AsyncStorage.setItem(CURRENT_AGENT_KEY, agentId).catch(() => {});
  }, []);

  const currentAgent = useMemo((): Agent | null => {
    if (agents.length === 0) {
      return null;
    }
    if (currentAgentId) {
      const found = agents.find((a) => a.id === currentAgentId);
      if (found) {
        return found;
      }
    }
    return agents.find((a) => a.id === 'main') ?? agents[0] ?? null;
  }, [agents, currentAgentId]);

  return {
    agents,
    currentAgent,
    setCurrentAgent,
    refreshAgents,
  };
}

export function AgentsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const value = useAgentsInternal();
  return <AgentsContext.Provider value={value}>{children}</AgentsContext.Provider>;
}

export function useAgents(): AgentsContextValue {
  const ctx = useContext(AgentsContext);
  if (!ctx) {
    throw new Error('useAgents requires AgentsProvider');
  }
  return ctx;
}

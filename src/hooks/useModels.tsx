import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Model } from '@/types';
import { useConnection } from '@/contexts/ConnectionContext';

const CURRENT_MODEL_KEY = 'clawboy-current-model-v1';

export interface ModelsContextValue {
  models: Model[];
  currentModel: Model | null;
  setCurrentModel: (modelId: string) => void;
  refreshModels: () => Promise<void>;
}

const ModelsContext = createContext<ModelsContextValue | null>(null);

function useModelsInternal(): ModelsContextValue {
  const { client: openClawRef, connectionState } = useConnection();
  const [models, setModels] = useState<Model[]>([]);
  const [currentModelId, setCurrentModelId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(CURRENT_MODEL_KEY).then((id) => {
      if (!cancelled && typeof id === 'string' && id.length > 0) {
        setCurrentModelId(id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshModels = useCallback(async (): Promise<void> => {
    const oc = openClawRef.current;
    if (!oc || connectionState.status !== 'connected') {
      return;
    }
    try {
      const list = await oc.listModels();
      setModels(list);
    } catch (err) {
      // Transient RPC failure during a reconnect — keep the existing list so
      // the picker doesn't fall back to placeholders while the client recovers.
      console.warn('[useModels] refreshModels failed, keeping existing list:', err);
    }
  }, [openClawRef, connectionState.status]);

  useEffect(() => {
    if (connectionState.status !== 'connected') {
      return;
    }
    void refreshModels();
  }, [connectionState.status, refreshModels]);

  const setCurrentModel = useCallback((modelId: string): void => {
    setCurrentModelId(modelId);
    void AsyncStorage.setItem(CURRENT_MODEL_KEY, modelId).catch(() => {});
  }, []);

  const currentModel = useMemo((): Model | null => {
    if (models.length === 0) {
      return null;
    }
    if (currentModelId) {
      const found = models.find((m) => m.id === currentModelId);
      if (found) {
        return found;
      }
    }
    return models[0] ?? null;
  }, [models, currentModelId]);

  return {
    models,
    currentModel,
    setCurrentModel,
    refreshModels,
  };
}

export function ModelsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const value = useModelsInternal();
  return <ModelsContext.Provider value={value}>{children}</ModelsContext.Provider>;
}

export function useModels(): ModelsContextValue {
  const ctx = useContext(ModelsContext);
  if (!ctx) {
    throw new Error('useModels requires ModelsProvider');
  }
  return ctx;
}

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Model } from '@/types';
import { useConnection } from '@/contexts/ConnectionContext';

const CURRENT_MODEL_KEY = 'clawboy-current-model-v1';

export interface ModelsContextValue {
  models: Model[];
  currentModel: string | null;
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
    const list = await oc.listModels();
    setModels(list);
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

  const currentModel = useMemo((): string | null => {
    if (!currentModelId && models.length > 0) {
      return models[0]?.id ?? null;
    }
    if (currentModelId && models.some((m) => m.id === currentModelId)) {
      return currentModelId;
    }
    return models[0]?.id ?? null;
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

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Model } from '@/types';
import { emitModelSet } from '@/badges/events';
import type { CachedModelSnapshot } from '@/lib/chatCache/types';
import { useConnection } from '@/contexts/ConnectionContext';

const CURRENT_MODEL_KEY = 'clawboy-current-model-v1';

export interface ModelsContextValue {
  models: Model[];
  currentModel: Model | null;
  /** Updates local state and patches the active session on the server. */
  setCurrentModel: (modelId: string, sessionKey?: string | null) => void;
  refreshModels: () => Promise<void>;
  /** Seed the selected model from disk cache before the server list loads. */
  seedModelFromCache: (snap: CachedModelSnapshot) => void;
}

const ModelsContext = createContext<ModelsContextValue | null>(null);

function useModelsInternal(): ModelsContextValue {
  const { client: openClawRef, connectionState } = useConnection();
  const [models, setModels] = useState<Model[]>([]);
  const [currentModelId, setCurrentModelId] = useState<string | null>(null);
  const [cachedModel, setCachedModel] = useState<Model | null>(null);

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

  const setCurrentModel = useCallback((modelId: string, sessionKey?: string | null): void => {
    const midConversation = sessionKey != null;
    setCurrentModelId(modelId);
    void AsyncStorage.setItem(CURRENT_MODEL_KEY, modelId).catch(() => {});
    const modelMeta = models.find((m) => m.id === modelId);
    emitModelSet({ modelId, midConversation, isReasoning: modelMeta?.reasoning ?? false });
    // Patch the session on the server so the gateway uses this model.
    const oc = openClawRef.current;
    const sk = sessionKey ?? null;
    if (oc && sk && connectionState.status === 'connected') {
      void oc.updateSession(sk, { model: modelId }).catch((err: unknown) => {
        console.warn('[useModels] sessions.patch model failed:', err);
      });
    }
  }, [openClawRef, connectionState.status]);

  const seedModelFromCache = useCallback((snap: CachedModelSnapshot): void => {
    setCachedModel({
      id: snap.id,
      name: snap.name ?? snap.id,
      provider: snap.providerSlug,
    } as Model);
    setCurrentModelId(snap.id);
  }, []);

  const currentModel = useMemo((): Model | null => {
    // Cold start: use the cached snapshot until the real list arrives.
    if (models.length === 0) {
      return cachedModel;
    }
    if (currentModelId) {
      const found = models.find((m) => m.id === currentModelId);
      if (found) {
        return found;
      }
    }
    return models[0] ?? null;
  }, [models, currentModelId, cachedModel]);

  return {
    models,
    currentModel,
    setCurrentModel,
    refreshModels,
    seedModelFromCache,
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

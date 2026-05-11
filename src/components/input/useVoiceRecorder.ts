import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { VOICE_RECORDING_MAX_SECONDS } from '@/constants/attachmentsGateway';
import type { InputAttachment } from './types';
import { makeId } from './palette/shared';

interface UseVoiceRecorderOptions {
  setAttachments: (a: InputAttachment[]) => void;
  attachmentsRef: React.MutableRefObject<InputAttachment[]>;
  disabled: boolean;
  isThinking: boolean;
}

export interface UseVoiceRecorderResult {
  isVoiceRecording: boolean;
  onMicPressIn: () => void;
  onMicPressOut: () => void;
}

export function useVoiceRecorder({
  setAttachments,
  attachmentsRef,
  disabled,
  isThinking,
}: UseVoiceRecorderOptions): UseVoiceRecorderResult {
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const voiceStartRef = useRef(0);
  const voiceMaxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micPressActiveRef = useRef(false);
  const onMicPressOutRef = useRef<(() => Promise<void>) | null>(null);

  const clearVoiceMaxTimer = useCallback((): void => {
    if (voiceMaxTimerRef.current) {
      clearTimeout(voiceMaxTimerRef.current);
      voiceMaxTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearVoiceMaxTimer();
    };
  }, [clearVoiceMaxTimer]);

  const onMicPressOut = useCallback(async (): Promise<void> => {
    micPressActiveRef.current = false;
    setIsVoiceRecording(false);
    clearVoiceMaxTimer();
    if (!recorder.isRecording) return;
    try {
      await recorder.stop();
    } catch {
      /* ignore */
    }
    const uri = recorder.uri;
    const ms = Date.now() - voiceStartRef.current;
    if (!uri || ms < 400) return;
    const next: InputAttachment = {
      id: makeId(),
      name: `Voice (${Math.max(1, Math.round(ms / 1000))}s)`,
      type: 'audio',
      uri,
      preview: uri,
      mimeType: 'audio/mp4',
    };
    setAttachments([...attachmentsRef.current, next]);
  }, [clearVoiceMaxTimer, recorder, setAttachments, attachmentsRef]);

  useEffect(() => {
    onMicPressOutRef.current = onMicPressOut;
  }, [onMicPressOut]);

  const onMicPressIn = useCallback(async (): Promise<void> => {
    if (disabled || isThinking) return;
    micPressActiveRef.current = true;
    clearVoiceMaxTimer();
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      micPressActiveRef.current = false;
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    try {
      await recorder.prepareToRecordAsync();
      voiceStartRef.current = Date.now();
      recorder.record();
      if (micPressActiveRef.current) {
        setIsVoiceRecording(true);
      }
      voiceMaxTimerRef.current = setTimeout(() => {
        void onMicPressOutRef.current?.();
      }, VOICE_RECORDING_MAX_SECONDS * 1000);
    } catch {
      micPressActiveRef.current = false;
    }
  }, [clearVoiceMaxTimer, disabled, isThinking, recorder]);

  return {
    isVoiceRecording,
    onMicPressIn: useCallback(() => { void onMicPressIn(); }, [onMicPressIn]),
    onMicPressOut: useCallback(() => { void onMicPressOut(); }, [onMicPressOut]),
  };
}

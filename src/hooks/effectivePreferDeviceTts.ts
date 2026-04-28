/**
 * Returns the effective `preferDeviceTts` value for TTS playback.
 *
 * When the user has "Read responses aloud" on and the gateway is connected but
 * has no configured voice providers, there is no server audio to prefer, so
 * the device voice should be treated as the active choice regardless of the
 * stored preference toggle.
 *
 * The override only activates once the provider list has finished loading and
 * the connection is established — during connecting/loading we leave the stored
 * value unchanged so nothing flickers.
 */
export function effectivePreferDeviceTts(opts: {
  preferDeviceTts: boolean;
  autoSpeakReplies: boolean;
  isConnected: boolean;
  loading: boolean;
  providerCount: number;
}): boolean {
  const { preferDeviceTts, autoSpeakReplies, isConnected, loading, providerCount } = opts;
  if (preferDeviceTts) return true;
  const noServerVoice = isConnected && !loading && providerCount === 0;
  return autoSpeakReplies && noServerVoice;
}

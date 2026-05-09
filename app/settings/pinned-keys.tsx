import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PinnedKeysScreen } from '@/components/settings/PinnedKeysScreen';

export default function PinnedKeysRoute(): React.JSX.Element | null {
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  if (!profileId) return null;
  return <PinnedKeysScreen profileId={profileId} />;
}

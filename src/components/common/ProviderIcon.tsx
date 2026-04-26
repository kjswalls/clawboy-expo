import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  siAnthropic,
  siGooglegemini,
  siMeta,
  siMistralai,
  siPerplexity,
} from 'simple-icons';

import type { ProviderSlug } from '@/lib/modelProvider';

const ICON_MAP: Partial<Record<ProviderSlug, { path: string; viewBox?: string }>> = {
  anthropic:  { path: siAnthropic.path },
  google:     { path: siGooglegemini.path },
  meta:       { path: siMeta.path },
  mistral:    { path: siMistralai.path },
  perplexity: { path: siPerplexity.path },
};

interface ProviderIconProps {
  slug: ProviderSlug;
  color: string;
  /** First letter to show when no SVG is available */
  fallbackChar?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function ProviderIcon({
  slug,
  color,
  fallbackChar = '?',
  size = 16,
  style,
}: ProviderIconProps): React.JSX.Element {
  const icon = ICON_MAP[slug];

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color + '26',
        },
        style,
      ]}
    >
      {icon ? (
        <Svg
          width={size * 0.6}
          height={size * 0.6}
          viewBox="0 0 24 24"
        >
          <Path d={icon.path} fill={color} />
        </Svg>
      ) : (
        <Text
          style={{
            fontSize: size * 0.5,
            fontWeight: '700',
            color,
            lineHeight: size * 0.6,
          }}
        >
          {fallbackChar.toUpperCase()}
        </Text>
      )}
    </View>
  );
}

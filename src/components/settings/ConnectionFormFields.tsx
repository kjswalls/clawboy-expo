import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';

import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';

export interface ConnectionFormFieldsProps {
  colors: ThemeColors;
  name: string;
  onChangeName: (t: string) => void;
  showName: boolean;
  serverUrl: string;
  onChangeUrl: (t: string) => void;
  token: string;
  onChangeToken: (t: string) => void;
  showToken: boolean;
  onToggleTokenVisible: () => void;
  urlPlaceholder?: string;
}

export function ConnectionFormFields({
  colors,
  name,
  onChangeName,
  showName,
  serverUrl,
  onChangeUrl,
  token,
  onChangeToken,
  showToken,
  onToggleTokenVisible,
  urlPlaceholder = 'wss://your-server.example.com',
}: ConnectionFormFieldsProps): React.JSX.Element {
  return (
    <View style={styles.gap}>
      {showName ? (
        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Server name (optional)</Text>
          <TextInput
            value={name}
            onChangeText={onChangeName}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="My home server"
            placeholderTextColor={colors.mutedForeground}
            style={[
              styles.input,
              {
                backgroundColor: colors.input,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
          />
        </View>
      ) : null}
      <View>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Server URL</Text>
        <TextInput
          value={serverUrl}
          onChangeText={onChangeUrl}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="URL"
          keyboardType="url"
          placeholder={urlPlaceholder}
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.input,
            { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground },
          ]}
        />
      </View>
      <View>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Auth token</Text>
        <View style={styles.tokenRow}>
          <TextInput
            value={token}
            onChangeText={onChangeToken}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            textContentType="none"
            secureTextEntry={!showToken}
            placeholder="Token from your gateway"
            placeholderTextColor={colors.mutedForeground}
            style={[
              styles.input,
              styles.tokenInput,
              { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground },
            ]}
          />
          <Pressable
            onPress={onToggleTokenVisible}
            style={({ pressed }) => [styles.eye, { backgroundColor: colors.secondary }, pressed && { opacity: 0.9 }]}
            accessibilityLabel={showToken ? 'Hide token' : 'Show token'}
          >
            {showToken ? <EyeOff size={18} color={colors.mutedForeground} /> : <Eye size={18} color={colors.mutedForeground} />}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: {
    gap: Spacing.lg,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: Spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: FontSize.sm,
  },
  tokenRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  tokenInput: {
    flex: 1,
    paddingRight: 44,
  },
  eye: {
    position: 'absolute',
    right: 8,
    borderRadius: BorderRadius.md,
    padding: 6,
  },
});

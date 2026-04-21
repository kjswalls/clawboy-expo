import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { Colors, FontSize } from '@/constants/theme';

export default function SettingsScreen(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Settings UI coming in Prompt 8</Text>
        <Link href="/" asChild>
          <Pressable style={styles.back}>
            <Text style={styles.backLabel}>← Back to chat</Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.dark.foreground,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.dark.mutedForeground,
    marginBottom: 20,
    textAlign: 'center',
  },
  back: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  backLabel: {
    fontSize: FontSize.sm,
    color: Colors.dark.primary,
    fontWeight: '600',
  },
});

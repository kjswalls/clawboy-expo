import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { Colors, FontSize } from '@/constants/theme';

export default function OnboardingScreen(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome to ClawBoy</Text>
        <Text style={styles.subtitle}>Onboarding flow coming in Prompt 4</Text>
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
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.dark.foreground,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.dark.mutedForeground,
    textAlign: 'center',
    marginBottom: 20,
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

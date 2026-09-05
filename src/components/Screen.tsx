import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/src/theme/tokens';

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  scroll?: boolean;
};

export function Screen({ title, subtitle, children, scroll = true }: Props) {
  const content = (
    <View style={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll}>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xxl },
  content: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.lg },
  header: { gap: spacing.xs },
  title: { color: colors.text, fontSize: typography.display, fontWeight: '800', letterSpacing: -0.7 },
  subtitle: { color: colors.textMuted, fontSize: typography.body, lineHeight: 23 },
});

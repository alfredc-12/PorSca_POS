import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

type DataStateKind = 'loading' | 'no-results' | 'unavailable' | 'not-found';

type Props = {
  kind: DataStateKind;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

const icons: Record<DataStateKind, React.ComponentProps<typeof Ionicons>['name']> = {
  loading: 'sync-outline',
  'no-results': 'search-outline',
  unavailable: 'cloud-offline-outline',
  'not-found': 'barcode-outline',
};

export function DataState({ kind, title, message, actionLabel, onAction }: Props) {
  return (
    <View testID={`data-state-${kind}`} style={styles.card} accessibilityLiveRegion="polite">
      {kind === 'loading' ? (
        <ActivityIndicator testID="data-state-loading-indicator" size="small" color={colors.primary} />
      ) : (
        <View style={styles.icon}><Ionicons name={icons[kind]} size={28} color={kind === 'unavailable' ? colors.warning : colors.primary} /></View>
      )}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction} style={styles.action}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.primaryWash, borderWidth: 1, borderColor: colors.outline },
  icon: { width: 52, height: 52, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: typography.label, fontWeight: '900', textAlign: 'center' },
  message: { color: colors.textMuted, fontSize: typography.caption, lineHeight: 18, textAlign: 'center' },
  action: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: colors.white, fontSize: typography.caption, fontWeight: '900' },
});

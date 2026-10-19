import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { DescribedFailure, supportCodeLine } from '@/src/domain/userFacingError';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

type Props = {
  failure: DescribedFailure;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The single renderer for a described failure: what happened, what to do, and
 * the support code that maps back to the raw detail on the Diagnostics screen.
 */
export function FailureNotice({ failure, testID, style }: Props) {
  const supportCode = supportCodeLine(failure);
  return (
    <View testID={testID} accessibilityRole="alert" style={[styles.card, style]}>
      <Text style={styles.title}>{failure.title}</Text>
      <Text style={styles.body}>{failure.body}</Text>
      {supportCode ? <Text selectable style={styles.code}>{supportCode}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.primaryWash },
  title: { color: colors.text, fontSize: typography.label, fontWeight: '900' },
  body: { color: colors.textMuted, fontSize: typography.caption, lineHeight: 18 },
  code: { color: colors.text, fontSize: typography.caption, fontWeight: '800', letterSpacing: 0.5, marginTop: 2 },
});

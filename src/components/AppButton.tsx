import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
};

export function AppButton({ label, onPress, variant = 'primary', disabled, style }: Props) {
  const palette = variant === 'primary'
    ? { bg: colors.primary, text: colors.white, border: colors.primary }
    : variant === 'danger'
      ? { bg: colors.dangerSoft, text: colors.danger, border: colors.dangerSoft }
      : { bg: colors.surface, text: colors.text, border: colors.outline };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.45 : pressed ? 0.82 : 1 },
        style,
      ]}
    >
      <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: typography.body,
    fontWeight: '700',
  },
});

import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '@/src/theme/tokens';
import { productControlStyles } from './ProductFormControls';

export type StockQuantityInputProps = { value: string; onChangeText: (value: string) => void; onBlur: () => void; error?: string; disabled: boolean; errorId: string };
export const MAX_STOCK = 4294967295;

export function StockQuantityInput({ value, onChangeText, onBlur, error, disabled, errorId }: StockQuantityInputProps) {
  const valid = /^\d+$/.test(value) && Number(value) <= MAX_STOCK;
  const step = (delta: number) => {
    if (disabled || (!valid && value !== '')) return;
    onChangeText(String(Math.min(MAX_STOCK, Math.max(0, Number(value || 0) + delta))));
  };
  return <View style={[styles.spinner, error && productControlStyles.invalid]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Decrease stock quantity" disabled={disabled || !valid || Number(value) === 0} onPress={() => step(-1)} style={styles.button}><Ionicons name="remove" size={20} color={disabled || !valid || Number(value) === 0 ? colors.textMuted : colors.primary} /></Pressable>
    <TextInput testID="product-stock-input" accessibilityLabel="Stock quantity" accessibilityRole="spinbutton" accessibilityValue={{ min: 0, max: MAX_STOCK, now: valid ? Number(value) : undefined }} value={value} keyboardType="number-pad" inputMode="numeric" placeholder="0" placeholderTextColor={colors.textMuted} editable={!disabled} onBlur={onBlur} onChangeText={onChangeText} onKeyPress={(event) => { if (event.nativeEvent.key === 'ArrowUp' || event.nativeEvent.key === 'ArrowDown') { event.preventDefault(); step(event.nativeEvent.key === 'ArrowUp' ? 1 : -1); } }} style={styles.input} {...{ 'aria-invalid': Boolean(error), 'aria-describedby': error ? errorId : undefined }} />
    <Pressable accessibilityRole="button" accessibilityLabel="Increase stock quantity" disabled={disabled || (!valid && value !== '') || Number(value) === MAX_STOCK} onPress={() => step(1)} style={styles.button}><Ionicons name="add" size={20} color={disabled || (!valid && value !== '') || Number(value) === MAX_STOCK ? colors.textMuted : colors.primary} /></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  spinner: { flexDirection: 'row', borderWidth: 1, borderColor: colors.outline, borderRadius: radius.md, backgroundColor: colors.surface },
  input: { flex: 1, minWidth: 0, minHeight: 52, textAlign: 'center', color: colors.text, fontSize: 16, fontVariant: ['tabular-nums'] },
  button: { minWidth: 48, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
});

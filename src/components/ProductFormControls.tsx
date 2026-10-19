import React, { useEffect, useId, useRef, useState } from 'react';
import { AccessibilityRole, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '@/src/theme/tokens';

export const productControlStyles = StyleSheet.create({
  field: { gap: 8 },
  label: { color: colors.text, fontSize: 14, fontWeight: '800' },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.outline, borderRadius: radius.md, paddingHorizontal: 14, color: colors.text, backgroundColor: colors.surface, fontSize: 16 },
  invalid: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
});

export function FieldError({ error, id }: { error?: string; id?: string }) {
  return error ? <Text nativeID={id} accessibilityLiveRegion="polite" style={productControlStyles.error}>{error}</Text> : null;
}

export function productInputOutline(error?: string) {
  return Platform.OS === 'web' ? { borderColor: error ? colors.danger : colors.outline, outlineColor: error ? colors.danger : colors.primary } : undefined;
}

export type PriceParts = { whole: string; decimal: string };
export function splitPrice(price: string): PriceParts {
  const [whole, decimal] = price.split('.');
  return { whole, decimal: price ? (decimal ?? '').padEnd(2, '0') : '' };
}
export function joinPrice({ whole, decimal }: PriceParts) {
  return `${whole}.${decimal.padStart(2, '0')}`;
}

export function ProductPriceInput({ parts, onChange, onBlur, error, disabled }: {
  parts: PriceParts; onChange: (parts: PriceParts) => void; onBlur: () => void; error?: string; disabled: boolean;
}) {
  const id = useId();
  const invalidProps = { 'aria-invalid': Boolean(error), 'aria-describedby': error ? id : undefined };
  return <View style={productControlStyles.field}>
    <Text style={productControlStyles.label}>Price (PHP)</Text>
    <View style={styles.price}>
      <TextInput testID="product-price-input" accessibilityLabel="Price in whole pesos" value={parts.whole} inputMode="numeric" keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.textMuted} editable={!disabled} onBlur={onBlur} onChangeText={(whole) => onChange({ ...parts, whole })} style={[productControlStyles.input, styles.whole, error && productControlStyles.invalid, productInputOutline(error)]} {...invalidProps} />
      <Text accessible={false} style={styles.decimalPoint}>.</Text>
      <TextInput testID="product-price-decimal-input" accessibilityLabel="Price in centavos" value={parts.decimal} inputMode="numeric" keyboardType="number-pad" maxLength={2} placeholder="00" placeholderTextColor={colors.textMuted} editable={!disabled} onBlur={() => { if (/^\d$/.test(parts.decimal)) onChange({ ...parts, decimal: parts.decimal.padStart(2, '0') }); onBlur(); }} onChangeText={(decimal) => onChange({ ...parts, decimal })} style={[productControlStyles.input, styles.decimal, error && productControlStyles.invalid, productInputOutline(error)]} {...invalidProps} />
    </View>
    <FieldError error={error} id={id} />
  </View>;
}

export function CategoryComboBox({ value, categories, onChange, onBlur, error, disabled }: {
  value: string; categories: string[]; onChange: (value: string) => void; onBlur: () => void; error?: string; disabled: boolean;
}) {
  const id = useId();
  const input = useRef<TextInput>(null);
  const suppressEscape = useRef(false);
  const optionList = useRef<ScrollView>(null);
  const optionOffsets = useRef<Record<number, number>>({});
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(-1);
  const options = categories.filter((category) => category.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  const expanded = open && !disabled;
  useEffect(() => {
    if (expanded && active >= 0) optionList.current?.scrollTo({ y: Math.max(0, (optionOffsets.current[active] ?? 0) - 48), animated: false });
  }, [active, expanded]);
  const choose = (category: string) => { onChange(category); setOpen(false); setActive(-1); input.current?.focus(); };
  const toggle = () => { setFilter(''); setActive(-1); setOpen((current) => !current); input.current?.focus(); };
  // Keep DOM focus on the combo input until its option's click can commit.
  const keepInputFocus = Platform.OS === 'web' ? { onMouseDown: (event: React.MouseEvent) => event.preventDefault() } : {};
  const webProps = Platform.OS === 'web' ? {
    'aria-controls': `${id}-options`, 'aria-autocomplete': 'list' as const, 'aria-haspopup': 'listbox' as const,
    'aria-activedescendant': expanded && active >= 0 ? `${id}-option-${active}` : undefined,
    onKeyUp: (event: React.KeyboardEvent) => { if (event.key === 'Escape' && suppressEscape.current) { event.stopPropagation(); suppressEscape.current = false; } },
  } : {};
  return <View style={productControlStyles.field}>
    <Text style={productControlStyles.label}>Category</Text>
    <View style={[styles.combo, error && productControlStyles.invalid]}>
      <TextInput ref={input} testID="product-category-input" accessibilityLabel="Category" accessibilityRole="combobox" accessibilityState={{ expanded, disabled }} {...webProps} {...{ 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : `${id}-hint` }} value={value} placeholder="Choose or type a category" placeholderTextColor={colors.textMuted} editable={!disabled} onChangeText={(text) => { onChange(text); setFilter(text); setActive(-1); setOpen(true); }} onBlur={() => { setOpen(false); onBlur(); }} onKeyPress={(event) => {
        const key = event.nativeEvent.key;
        if (key === 'ArrowDown' || key === 'ArrowUp') {
          event.preventDefault(); setOpen(true);
          if (!expanded) { setFilter(''); setActive(key === 'ArrowDown' ? 0 : categories.length - 1); }
          else setActive((current) => options.length ? (current + (key === 'ArrowDown' ? 1 : -1) + options.length) % options.length : -1);
        } else if (key === 'Enter' && expanded) {
          event.preventDefault(); if (active >= 0 && options[active]) choose(options[active]); else setOpen(false);
        } else if (key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); suppressEscape.current = true; setOpen(false); }
      }} style={[styles.comboInput, productInputOutline(error)]} />
      <Pressable testID="category-dropdown-button" accessibilityRole="button" accessibilityLabel={expanded ? 'Hide categories' : 'Show categories'} accessibilityState={{ expanded, disabled }} disabled={disabled} onPress={toggle} style={styles.comboToggle} {...keepInputFocus}>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </Pressable>
    </View>
    {expanded ? <ScrollView ref={optionList} nativeID={`${id}-options`} accessible accessibilityRole={Platform.OS === 'web' ? 'listbox' as AccessibilityRole : 'list'} accessibilityLabel="Categories" keyboardShouldPersistTaps="handled" style={styles.options}>
      {options.map((category, index) => <Pressable key={category} nativeID={`${id}-option-${index}`} role="option" accessibilityLabel={category} accessibilityState={{ selected: value === category }} focusable={false} onLayout={(event) => { optionOffsets.current[index] = event.nativeEvent.layout.y; }} onPress={() => choose(category)} style={[styles.option, (active === index || value === category) && styles.activeOption]} {...keepInputFocus}>
        <Text style={styles.optionText}>{category}</Text>
        {value === category ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
      </Pressable>)}
      {!options.length ? <Text style={styles.empty}>Use “{value.trim()}” as a custom category.</Text> : null}
    </ScrollView> : null}
    <Text nativeID={`${id}-hint`} style={styles.hint}>Choose a category or type a new name.</Text>
    <FieldError error={error} id={`${id}-error`} />
  </View>;
}

const styles = StyleSheet.create({
  price: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  whole: { flex: 1, minWidth: 0, fontVariant: ['tabular-nums'] },
  decimal: { width: 64, textAlign: 'center', paddingHorizontal: 8, fontVariant: ['tabular-nums'] },
  decimalPoint: { color: colors.text, fontSize: 22, fontWeight: '800' },
  combo: { flexDirection: 'row', borderWidth: 1, borderColor: colors.outline, borderRadius: radius.md, backgroundColor: colors.surface },
  comboInput: { flex: 1, minWidth: 0, minHeight: 52, paddingHorizontal: 14, color: colors.text, fontSize: 16, borderRadius: radius.md },
  comboToggle: { minWidth: 48, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  options: { maxHeight: 208, borderWidth: 1, borderColor: colors.outline, borderRadius: radius.md, backgroundColor: colors.surface },
  option: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionText: { flex: 1, color: colors.text, fontSize: 16 },
  activeOption: { backgroundColor: colors.primarySoft },
  empty: { padding: 14, color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
});

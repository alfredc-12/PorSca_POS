import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { AppButton } from '@/src/components/AppButton';
import { usePos } from '@/src/context/PosContext';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

export default function ProductFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { products, updateProduct, createProduct } = usePos();
  const existing = useMemo(() => products.find((p) => p.id === id), [id, products]);

  const [name, setName] = useState(existing?.name ?? '');
  const [barcode, setBarcode] = useState(existing?.barcode ?? '');
  const [price, setPrice] = useState(existing ? String(existing.price) : '');
  const [stock, setStock] = useState(existing ? String(existing.stock) : '');

  const save = () => {
    const parsedPrice = Number(price);
    const parsedStock = Number(stock);
    if (!name.trim() || !barcode.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0 || !Number.isInteger(parsedStock) || parsedStock < 0) {
      Alert.alert('Check product details', 'Enter a name, barcode, valid non-negative price, and whole-number stock quantity.');
      return;
    }
    const duplicate = products.some((product) => product.barcode === barcode.trim() && product.id !== existing?.id);
    if (duplicate) {
      Alert.alert('Barcode already exists', 'Each product must have a unique barcode.');
      return;
    }

    if (existing) {
      updateProduct({ ...existing, name: name.trim(), barcode: barcode.trim(), price: parsedPrice, stock: parsedStock });
    } else {
      createProduct({ name: name.trim(), barcode: barcode.trim(), price: parsedPrice, stock: parsedStock });
    }
    router.back();
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen title={existing ? 'Edit product' : 'Add product'} subtitle="Use the barcode printed on the product or its packaging.">
        <View style={styles.form}>
          <Field label="Product name" value={name} onChangeText={setName} placeholder="e.g. Bottled Water 500ml" />
          <Field label="Barcode" value={barcode} onChangeText={setBarcode} placeholder="e.g. 4800010000011" keyboardType="number-pad" />
          <Field label="Price (PHP)" value={price} onChangeText={setPrice} placeholder="0.00" keyboardType="decimal-pad" />
          <Field label="Stock quantity" value={stock} onChangeText={setStock} placeholder="0" keyboardType="number-pad" />
        </View>
        <AppButton label={existing ? 'Save changes' : 'Add product'} onPress={save} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.textMuted} style={styles.input} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { gap: spacing.lg },
  field: { gap: spacing.sm },
  label: { color: colors.text, fontSize: typography.label, fontWeight: '700' },
  input: { minHeight: 54, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, color: colors.text, fontSize: typography.body },
});

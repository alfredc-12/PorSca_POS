import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { AppButton } from '@/src/components/AppButton';
import { usePos } from '@/src/context/PosContext';
import { ProductCategory } from '@/src/types';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

const categories: ProductCategory[] = ['Beverages', 'Noodles', 'Milk', 'Snacks', 'Personal Care', 'Household', 'General'];

export default function ProductFormScreen() {
  const { id, barcode: scannedBarcode } = useLocalSearchParams<{ id?: string; barcode?: string }>();
  const { products, updateProduct, createProduct } = usePos();
  const existing = useMemo(() => products.find((p) => p.id === id), [id, products]);

  const [name, setName] = useState(existing?.name ?? '');
  const [barcode, setBarcode] = useState(existing?.barcode ?? scannedBarcode ?? '');
  const [price, setPrice] = useState(existing ? String(existing.price) : '');
  const [stock, setStock] = useState(existing ? String(existing.stock) : '');
  const [category, setCategory] = useState<ProductCategory>(existing?.category ?? 'General');

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
      updateProduct({ ...existing, name: name.trim(), barcode: barcode.trim(), price: parsedPrice, stock: parsedStock, category });
    } else {
      createProduct({ name: name.trim(), barcode: barcode.trim(), price: parsedPrice, stock: parsedStock, category });
    }
    router.back();
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen title={existing ? 'Edit Product' : 'Add Product'} subtitle="Keep barcode, price, category, and stock information accurate." back>
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}><Ionicons name={existing ? 'create-outline' : 'cube-outline'} size={30} color={colors.primary} /></View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>{existing ? existing.name : 'New inventory item'}</Text>
            <Text style={styles.heroBody}>{existing ? 'Changes are reflected immediately in the POS.' : 'Scan or enter the barcode printed on the package.'}</Text>
          </View>
        </View>

        <View style={styles.formCard}>
          <Field icon="pricetag-outline" label="Product name" value={name} onChangeText={setName} placeholder="e.g. Coca-Cola 500mL" />
          <Field icon="barcode-outline" label="Barcode" value={barcode} onChangeText={setBarcode} placeholder="e.g. 4800010000011" keyboardType="number-pad" />
          <View style={styles.twoCol}>
            <View style={styles.flexField}><Field icon="cash-outline" label="Price (PHP)" value={price} onChangeText={setPrice} placeholder="0.00" keyboardType="decimal-pad" /></View>
            <View style={styles.flexField}><Field icon="layers-outline" label="Stock quantity" value={stock} onChangeText={setStock} placeholder="0" keyboardType="number-pad" /></View>
          </View>

          <View style={styles.categoryBlock}>
            <Text style={styles.label}>Category</Text>
            <View style={styles.categoryGrid}>
              {categories.map((item) => (
                <Pressable key={item} onPress={() => setCategory(item)} style={[styles.categoryChip, category === item && styles.categoryChipActive]}>
                  <Text style={[styles.categoryText, category === item && styles.categoryTextActive]}>{item}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <AppButton label={existing ? 'Save Changes' : 'Add Product'} onPress={save} />
        <Text style={styles.footerHint}>Product information is stored locally in this scaffold until the persistent backend is connected.</Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Field({ label, icon, ...props }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name'] } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}><Ionicons name={icon} size={17} color={colors.primary} /><Text style={styles.label}>{label}</Text></View>
      <TextInput placeholderTextColor={colors.textMuted} style={styles.input} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  heroCard: { minHeight: 92, backgroundColor: colors.primaryWash, borderRadius: radius.lg, borderWidth: 1, borderColor: '#D8EADA', padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1, minWidth: 0, gap: 4 },
  heroTitle: { color: colors.text, fontSize: typography.title, fontWeight: '900' },
  heroBody: { color: colors.textMuted, fontSize: typography.caption, lineHeight: 18 },
  formCard: { gap: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, padding: spacing.lg, shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 13, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  field: { gap: spacing.sm },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  label: { color: colors.text, fontSize: typography.label, fontWeight: '800' },
  input: { minHeight: 56, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.background, paddingHorizontal: spacing.lg, color: colors.text, fontSize: typography.body },
  twoCol: { flexDirection: 'row', gap: spacing.md },
  flexField: { flex: 1, minWidth: 0 },
  categoryBlock: { gap: spacing.sm },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { minHeight: 40, paddingHorizontal: 13, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  categoryChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  categoryText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  categoryTextActive: { color: colors.primary },
  footerHint: { color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center', paddingHorizontal: spacing.lg },
});

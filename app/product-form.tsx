import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { AppButton } from '@/src/components/AppButton';
import { DataState } from '@/src/components/DataState';
import { ProductField, usePos } from '@/src/context/PosContext';
import { ProductCategory } from '@/src/types';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

const categories: ProductCategory[] = ['Beverages', 'Noodles', 'Milk', 'Snacks', 'Personal Care', 'Household', 'General'];

type ProductDraft = {
  name: string;
  barcode: string;
  price: number;
  stock: number;
  category: ProductCategory;
};

export type ProductDraftErrors = Partial<Record<ProductField, string>>;

export function validateProductDraft(draft: { name: string; barcode: string; price: string; stock: string }): ProductDraftErrors {
  const errors: ProductDraftErrors = {};
  if (!draft.name.trim()) errors.name = 'Enter a product name.';

  const barcode = draft.barcode.trim();
  if (!/^\d{8,64}$/.test(barcode)) errors.barcode = 'Enter an 8–64 digit barcode.';

  const price = draft.price.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(price)) {
    errors.price = 'Enter a non-negative price with up to 2 decimal places.';
  }

  const stock = draft.stock.trim();
  if (!/^\d+$/.test(stock)) errors.stock = 'Enter a whole-number stock quantity of 0 or more.';

  return errors;
}

export default function ProductFormScreen() {
  const { id, barcode: scannedBarcode } = useLocalSearchParams<{ id?: string; barcode?: string }>();
  const { products, inventoryProducts, updateProduct, createProduct, refreshInventory } = usePos();
  const existing = useMemo(
    () => [...inventoryProducts, ...products].find((product) => product.id === id),
    [id, inventoryProducts, products],
  );

  const [name, setName] = useState(existing?.name ?? '');
  const [barcode, setBarcode] = useState(existing?.barcode ?? scannedBarcode ?? '');
  const [price, setPrice] = useState(existing ? String(existing.price) : '');
  const [stock, setStock] = useState(existing ? String(existing.stock) : '');
  const [category, setCategory] = useState<ProductCategory>(existing?.category ?? 'General');
  const [fieldErrors, setFieldErrors] = useState<ProductDraftErrors>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [retryingRefresh, setRetryingRefresh] = useState(false);

  const updateField = (field: ProductField, setter: (value: string) => void, value: string) => {
    setter(value);
    setFieldErrors((current) => current[field] ? { ...current, [field]: undefined } : current);
    setFormError(undefined);
    setNeedsRefresh(false);
  };

  const save = async () => {
    if (saving || retryingRefresh) return;
    const errors = validateProductDraft({ name, barcode, price, stock });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError('Check the highlighted fields and try again.');
      setNeedsRefresh(false);
      return;
    }

    const normalizedBarcode = barcode.trim();
    const knownProducts = [...inventoryProducts, ...products];
    const duplicate = knownProducts.some((product) => product.barcode === normalizedBarcode && product.id !== existing?.id);
    if (duplicate) {
      setFieldErrors({ barcode: 'Barcode already exists. Use a different barcode.' });
      setFormError('Barcode already exists. Use a different barcode, then try again.');
      setNeedsRefresh(false);
      return;
    }

    setSaving(true);
    setFormError(undefined);
    setFieldErrors({});
    setNeedsRefresh(false);

    const draft: ProductDraft = {
      name: name.trim(),
      barcode: normalizedBarcode,
      price: Number(price),
      stock: Number(stock),
      category,
    };
    const result = existing
      ? await updateProduct({ ...existing, ...draft })
      : await createProduct(draft);

    setSaving(false);
    if (result.ok) {
      router.back();
      return;
    }

    setFieldErrors(result.fieldErrors ?? {});
    setFormError(result.message);
    setNeedsRefresh(result.status === 'refresh-failed');
  };

  const retryRefresh = async () => {
    if (retryingRefresh) return;
    setRetryingRefresh(true);
    const refreshed = await refreshInventory();
    setRetryingRefresh(false);
    if (refreshed) {
      router.back();
      return;
    }
    setFormError('The inventory is still unavailable. Keep this form open and retry the refresh again.');
  };

  if (id && !existing) {
    return (
      <Screen title="Product unavailable" subtitle="This product is not present in the current inventory." back>
        <DataState
          kind="not-found"
          title="Product was not found"
          message="Refresh inventory and open the product again. No changes were made."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen title={existing ? 'Edit Product' : 'Add Product'} subtitle="Keep barcode, price, category, and stock information accurate." back>
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}><Ionicons name={existing ? 'create-outline' : 'cube-outline'} size={30} color={colors.primary} /></View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>{existing ? existing.name : 'New inventory item'}</Text>
            <Text style={styles.heroBody}>{existing ? 'Changes are saved to Laravel and reflected in inventory.' : 'Scan or enter the barcode printed on the package.'}</Text>
          </View>
        </View>

        {scannedBarcode && !existing ? (
          <View testID="scanned-barcode-notice" style={styles.scanNotice}>
            <Ionicons name="barcode-outline" size={19} color={colors.primary} />
            <Text style={styles.scanNoticeText}>Scanned barcode prefilled. Confirm the rest of the product details.</Text>
          </View>
        ) : null}

        {formError ? (
          <View testID="product-form-error" style={styles.errorCard} accessibilityLiveRegion="polite">
            <View style={styles.errorIcon}><Ionicons name="alert-circle-outline" size={23} color={colors.danger} /></View>
            <View style={styles.errorCopy}>
              <Text style={styles.errorTitle}>{needsRefresh ? 'Saved, refresh still needed' : 'Unable to save product'}</Text>
              <Text style={styles.errorMessage}>{formError}</Text>
              <Pressable
                testID={needsRefresh ? 'retry-inventory-refresh' : 'retry-product-save'}
                accessibilityRole="button"
                accessibilityLabel={needsRefresh ? 'Retry inventory refresh' : 'Try saving product again'}
                onPress={() => void (needsRefresh ? retryRefresh() : save())}
                style={styles.retryButton}
              >
                <Text style={styles.retryText}>{needsRefresh ? 'Retry inventory refresh' : 'Try again'}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.formCard}>
          <Field
            icon="pricetag-outline"
            label="Product name"
            value={name}
            onChangeText={(value) => updateField('name', setName, value)}
            placeholder="e.g. Coca-Cola 500mL"
            error={fieldErrors.name}
            testID="product-name-input"
            editable={!saving}
          />
          <Field
            icon="barcode-outline"
            label="Barcode"
            value={barcode}
            onChangeText={(value) => updateField('barcode', setBarcode, value)}
            placeholder="e.g. 4800010000011"
            keyboardType="number-pad"
            error={fieldErrors.barcode}
            testID="product-barcode-input"
            editable={!saving}
          />
          <View style={styles.twoCol}>
            <View style={styles.flexField}><Field icon="cash-outline" label="Price (PHP)" value={price} onChangeText={(value) => updateField('price', setPrice, value)} placeholder="0.00" keyboardType="decimal-pad" error={fieldErrors.price} testID="product-price-input" editable={!saving} /></View>
            <View style={styles.flexField}><Field icon="layers-outline" label="Stock quantity" value={stock} onChangeText={(value) => updateField('stock', setStock, value)} placeholder="0" keyboardType="number-pad" error={fieldErrors.stock} testID="product-stock-input" editable={!saving} /></View>
          </View>

          <View style={styles.categoryBlock}>
            <Text style={styles.label}>Category</Text>
            <View style={styles.categoryGrid}>
              {categories.map((item) => (
                <Pressable key={item} accessibilityRole="button" accessibilityLabel={`Category ${item}`} onPress={() => setCategory(item)} style={[styles.categoryChip, category === item && styles.categoryChipActive]}>
                  <Text style={[styles.categoryText, category === item && styles.categoryTextActive]}>{item}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <AppButton
          testID="save-product-button"
          label={saving ? 'Saving…' : existing ? 'Save Changes' : 'Add Product'}
          onPress={() => void save()}
          disabled={saving || retryingRefresh}
        />
        <Text style={styles.footerHint}>Product details and stock are saved by Laravel. A successful save refreshes the authoritative inventory before leaving this screen.</Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Field({ label, icon, error, testID, ...props }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; error?: string; testID?: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}><Ionicons name={icon} size={17} color={error ? colors.danger : colors.primary} /><Text style={styles.label}>{label}</Text></View>
      <TextInput
        {...props}
        testID={testID}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, error && styles.inputError]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
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
  scanNotice: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scanNoticeText: { flex: 1, color: colors.text, fontSize: typography.caption, fontWeight: '700', lineHeight: 18 },
  errorCard: { minHeight: 92, borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.dangerSoft, padding: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  errorIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  errorCopy: { flex: 1, minWidth: 0, gap: 4 },
  errorTitle: { color: colors.text, fontSize: typography.label, fontWeight: '900' },
  errorMessage: { color: colors.text, fontSize: typography.caption, lineHeight: 18 },
  retryButton: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  retryText: { color: colors.white, fontSize: typography.caption, fontWeight: '900' },
  formCard: { gap: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, padding: spacing.lg, shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 13, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  field: { gap: spacing.sm },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  label: { color: colors.text, fontSize: typography.label, fontWeight: '800' },
  input: { minHeight: 56, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.background, paddingHorizontal: spacing.lg, color: colors.text, fontSize: typography.body },
  inputError: { borderColor: colors.danger },
  fieldError: { color: colors.danger, fontSize: typography.caption, lineHeight: 17 },
  twoCol: { flexDirection: 'row', gap: spacing.md },
  flexField: { flex: 1, minWidth: 0 },
  categoryBlock: { gap: spacing.sm },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { minHeight: 48, paddingHorizontal: 13, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  categoryChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  categoryText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  categoryTextActive: { color: colors.primary },
  footerHint: { color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center', paddingHorizontal: spacing.lg },
});

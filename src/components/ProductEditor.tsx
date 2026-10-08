import React, { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/context/AuthContext';
import { usePos } from '@/src/context/PosContext';
import { DEFAULT_CATEGORIES, makeProductDraft, ProductDraft, ProductDraftErrors, productInput, productPatch, validateProductDraft } from '@/src/domain/productDraft';
import { Product } from '@/src/types';
import { colors, radius, spacing } from '@/src/theme/tokens';
import { AppButton } from './AppButton';
import { CategoryComboBox, FieldError, joinPrice, PriceParts, productInputOutline, ProductPriceInput, splitPrice } from './ProductFormControls';
import { StockQuantityInput } from './StockQuantityInput';

export type ProductEditorHandle = { requestClose: () => void; focus: () => void };
type Props = { product?: Product; scannedBarcode?: string; onClose: () => void };

export const ProductEditor = forwardRef<ProductEditorHandle, Props>(function ProductEditor({ product, scannedBarcode, onClose }, ref) {
  const { isAdmin } = useAuth();
  const { inventoryProducts, createProduct, updateProduct, refreshInventory } = usePos();
  const [initial] = useState(() => makeProductDraft(product, scannedBarcode));
  const [draft, setDraft] = useState(initial);
  const [priceParts, setPriceParts] = useState(() => splitPrice(initial.price));
  const stockErrorId = useId();
  const [barcodeEditable, setBarcodeEditable] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ProductDraftErrors>({});
  const [formError, setFormError] = useState<string>();
  const [reference, setReference] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const busy = useRef(false);
  const nameInput = useRef<TextInput>(null);
  const barcodeInput = useRef<TextInput>(null);
  const scrollView = useRef<ScrollView>(null);
  const dirty = Object.keys(initial).some((key) => initial[key as keyof ProductDraft] !== draft[key as keyof ProductDraft]);
  const blocked = saving || committed;
  const categories = Array.from(new Set([...DEFAULT_CATEGORIES, ...inventoryProducts.map((item) => item.category), product?.category].filter((item): item is string => Boolean(item))));

  const requestClose = () => {
    if (busy.current) return;
    if (dirty && !committed) setConfirmDiscard(true);
    else onClose();
  };
  useImperativeHandle(ref, () => ({ requestClose, focus: () => nameInput.current?.focus() }));
  useEffect(() => {
    if (barcodeEditable) barcodeInput.current?.focus();
  }, [barcodeEditable]);
  useEffect(() => {
    if (confirmDiscard) scrollView.current?.scrollTo({ y: 0, animated: false });
  }, [confirmDiscard]);

  const change = (field: keyof ProductDraft, value: string) => {
    if (blocked || (field === 'barcode' && !barcodeEditable)) return;
    const next = { ...draft, [field]: value };
    setDraft(next);
    setFieldErrors((current) => ({ ...current, [field]: validateProductDraft(next)[field] }));
    setFormError(undefined);
    setReference(undefined);
  };
  const validateField = (field: keyof ProductDraft) => setFieldErrors((current) => ({ ...current, [field]: validateProductDraft(draft)[field] }));
  const changePrice = (parts: PriceParts) => {
    if (blocked) return;
    setPriceParts(parts);
    change('price', joinPrice(parts));
  };

  const save = async () => {
    if (!isAdmin || busy.current || committed) return;
    const errors = validateProductDraft(draft);
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setFormError('Check the highlighted fields and try again.');
      scrollView.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    // The server owns uniqueness; a cached record may have been rebarcoded or removed.
    const patch = productPatch(initial, draft);
    if (product && Object.keys(patch).length === 0) { onClose(); return; }
    busy.current = true;
    setSaving(true);
    setConfirmDiscard(false);
    setFormError(undefined);
    setReference(undefined);
    setFieldErrors({});
    try {
      const result = product
        ? await updateProduct({ id: product.id, ...patch })
        : await createProduct(productInput(draft));
      if (result.ok) { onClose(); return; }
      setFieldErrors(result.fieldErrors ?? {});
      setFormError(result.message);
      setReference(result.reference);
      setCommitted(result.status === 'refresh-failed');
    } catch {
      setFormError('We could not confirm the save. Check the connection and try again.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const retryRefresh = async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      if (await refreshInventory()) onClose();
      else setFormError('Your product is saved. Current inventory is still unavailable; retry the refresh when connected.');
    } catch {
      setFormError('Your product is saved. Check the connection and retry the inventory refresh.');
    } finally { busy.current = false; setSaving(false); }
  };

  if (!isAdmin) return null;
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headingCopy}>
          <Text accessibilityRole="header" style={styles.title}>{product ? 'Edit Product' : 'Add Product'}</Text>
          <Text style={styles.subtitle}>{product ? 'Update product details and current stock.' : 'Add this item to your inventory.'}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close product editor" disabled={saving} onPress={requestClose} style={styles.close}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
      </View>
      <ScrollView ref={scrollView} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        {confirmDiscard ? <View accessibilityRole="alert" testID="discard-confirmation" style={styles.error}>
          <Text style={styles.errorTitle}>Discard unsaved changes?</Text>
          <Text style={styles.errorText}>Your edits have not been saved. Discarding will lose them.</Text>
          <AppButton label="Keep editing" disabled={saving} onPress={() => setConfirmDiscard(false)} variant="secondary" />
          <AppButton label="Discard" disabled={saving} onPress={() => { if (!busy.current) onClose(); }} variant="secondary" style={styles.discardButton} />
        </View> : null}
        {scannedBarcode && !product ? <View testID="scanned-barcode-notice" style={styles.notice}>
          <Ionicons name="barcode-outline" size={22} color={colors.primary} />
          <Text style={styles.noticeText}>Scanned barcode prefilled. Confirm the rest of the product details.</Text>
        </View> : null}
        {formError ? <View testID="product-form-error" accessibilityLiveRegion="polite" style={styles.error}>
          <Text style={styles.errorTitle}>{committed ? 'Saved, refresh still needed' : 'Unable to save product'}</Text>
          <Text style={styles.errorText}>{formError}</Text>
          {reference ? <Text selectable style={styles.errorText}>Support code: {reference}</Text> : null}
          <AppButton testID={committed ? 'retry-inventory-refresh' : 'retry-product-save'} label={committed ? 'Retry inventory refresh' : 'Try again'} disabled={saving} onPress={() => void (committed ? retryRefresh() : save())} variant="secondary" />
        </View> : null}
        <Field label="Product name" value={draft.name} inputRef={nameInput} testID="product-name-input" placeholder="e.g. Coca-Cola 500mL" editable={!blocked} error={fieldErrors.name} onBlur={() => validateField('name')} onChangeText={(value) => change('name', value)} />
        <View style={styles.field}>
          <View style={styles.barcodeHeading}>
            <Text style={styles.label}>Barcode</Text>
            <Pressable testID="edit-barcode-button" accessibilityRole="button" accessibilityLabel={barcodeEditable ? 'Done editing barcode' : 'Edit barcode'} disabled={blocked} onPress={() => { if (barcodeEditable) barcodeInput.current?.blur(); setBarcodeEditable((value) => !value); }} style={styles.editButton}>
              <Ionicons name={barcodeEditable ? 'checkmark' : 'pencil-outline'} size={16} color={colors.primary} />
              <Text style={styles.editText}>{barcodeEditable ? 'Done' : 'Edit'}</Text>
            </Pressable>
          </View>
          <TextInput ref={barcodeInput} testID="product-barcode-input" accessibilityLabel="Barcode" value={draft.barcode} editable={barcodeEditable && !blocked} focusable={barcodeEditable && !blocked} keyboardType="number-pad" placeholder="Scan a barcode or press Edit to enter it" placeholderTextColor={colors.textMuted} onBlur={() => validateField('barcode')} onChangeText={(value) => change('barcode', value)} style={[styles.input, !barcodeEditable && styles.lockedInput, fieldErrors.barcode && styles.inputError, productInputOutline(fieldErrors.barcode)]} {...{ 'aria-invalid': Boolean(fieldErrors.barcode), 'aria-describedby': fieldErrors.barcode ? 'product-barcode-error' : undefined }} />
          <Text style={styles.hint}>Press Edit to change the barcode.</Text>
          <FieldError error={fieldErrors.barcode} id="product-barcode-error" />
        </View>
        <View style={styles.numbers}>
          <View style={styles.numericField}><ProductPriceInput parts={priceParts} onChange={changePrice} onBlur={() => validateField('price')} disabled={blocked} error={fieldErrors.price} /></View>
          <View style={[styles.field, styles.numericField]}>
            <Text style={styles.label}>Stock quantity</Text>
            <StockQuantityInput value={draft.stock} disabled={blocked} error={fieldErrors.stock} errorId={stockErrorId} onBlur={() => validateField('stock')} onChangeText={(value) => change('stock', value)} />
            <FieldError error={fieldErrors.stock} id={stockErrorId} />
          </View>
        </View>
        <Text style={styles.stockHint}>Stock quantity sets the total units currently on hand.</Text>
        <CategoryComboBox value={draft.category} categories={categories} disabled={blocked} error={fieldErrors.category} onBlur={() => validateField('category')} onChange={(value) => change('category', value)} />
      </ScrollView>
      <View style={styles.footer}>
        <AppButton testID="discard-product-button" label={committed ? 'Close' : 'Cancel'} onPress={requestClose} disabled={saving} variant="secondary" style={styles.flex} />
        <AppButton testID="save-product-button" label={saving ? committed ? 'Refreshing…' : 'Saving…' : committed ? 'Saved' : product ? 'Save Changes' : 'Add Product'} onPress={() => void save()} disabled={blocked} style={styles.flex} />
      </View>
    </View>
  );
});

function Field({ label, error, inputRef, ...props }: React.ComponentProps<typeof TextInput> & { label: string; error?: string; inputRef?: React.Ref<TextInput> }) {
  const errorId = useId();
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput ref={inputRef} accessibilityLabel={label} placeholderTextColor={colors.textMuted} style={[styles.input, error && styles.inputError, productInputOutline(error)]} {...props} {...{ 'aria-invalid': Boolean(error), 'aria-describedby': error ? errorId : undefined }} /><FieldError error={error} id={errorId} /></View>;
}

const styles = StyleSheet.create({
  root: { flexShrink: 1, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  header: { padding: spacing.lg, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderBottomWidth: 1, borderColor: colors.outline },
  headingCopy: { flex: 1, gap: 6 }, title: { fontSize: 24, fontWeight: '900', color: colors.text }, subtitle: { fontSize: 14, lineHeight: 21, color: colors.textMuted },
  close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  body: { padding: spacing.lg, gap: spacing.md }, field: { gap: 8 }, label: { color: colors.text, fontSize: 14, fontWeight: '800' },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.outline, borderRadius: radius.md, paddingHorizontal: 14, color: colors.text, backgroundColor: colors.surface, fontSize: 16 },
  lockedInput: { backgroundColor: colors.background, color: colors.textMuted }, inputError: { borderColor: colors.danger },
  barcodeHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editButton: { minHeight: 48, paddingHorizontal: 12, gap: 6, flexDirection: 'row', alignItems: 'center' }, editText: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  hint: { fontSize: 12, color: colors.textMuted }, stockHint: { fontSize: 12, lineHeight: 18, color: colors.textMuted, marginTop: -8 },
  numbers: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, numericField: { flex: 1, minWidth: 200 }, flex: { flex: 1, minWidth: 0 },
  discardButton: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  error: { gap: 10, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerSoft }, errorTitle: { color: colors.text, fontSize: 16, fontWeight: '800' }, errorText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.primarySoft }, noticeText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 21 },
  footer: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, borderTopWidth: 1, borderColor: colors.outline },
});

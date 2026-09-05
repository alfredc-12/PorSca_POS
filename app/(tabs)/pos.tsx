import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { ProductThumbnail } from '@/src/components/ProductThumbnail';
import { usePos } from '@/src/context/PosContext';
import { PaymentMethod } from '@/src/types';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';
import { useResponsive } from '@/src/hooks/useResponsive';

export default function PosScreen() {
  const { cart, total, addProduct, decrementProduct, products, clearCart } = usePos();
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const responsive = useResponsive();

  const totalItems = cart.reduce((sum, line) => sum + line.quantity, 0);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products.filter((product) =>
      product.name.toLowerCase().includes(q) ||
      product.barcode.includes(q) ||
      (product.category ?? '').toLowerCase().includes(q),
    ).slice(0, 5);
  }, [products, query]);

  const proceed = () => {
    if (!cart.length) return;
    router.push({ pathname: '/checkout', params: { method } });
  };

  const productThumbSize = responsive.s(responsive.narrow ? 52 : 62);

  return (
    <Screen>
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, { minHeight: responsive.controlHeight }]}>
          <Ionicons name="search-outline" size={responsive.s(23)} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search product or scan barcode..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { fontSize: responsive.font(responsive.narrow ? 14 : 15.5) }]}
            returnKeyType="search"
          />
        </View>
        <Pressable
          style={[
            styles.scanButton,
            {
              minHeight: responsive.controlHeight,
              paddingHorizontal: responsive.narrow ? 13 : 17,
              minWidth: responsive.veryNarrow ? responsive.controlHeight : undefined,
            },
          ]}
          onPress={() => router.push('/scanner')}
        >
          <Ionicons name="barcode-outline" size={responsive.s(25)} color={colors.white} />
          {!responsive.veryNarrow ? <Text style={[styles.scanText, { fontSize: responsive.font(16) }]}>Scan</Text> : null}
        </Pressable>
      </View>

      <View style={[styles.statusLine, responsive.narrow && styles.statusLineNarrow]}>
        <View style={styles.statusCopy}>
          <Ionicons name="barcode-outline" size={responsive.s(19)} color={colors.primary} />
          <Text style={[styles.statusText, { fontSize: responsive.font(12.5) }]}>Scan a barcode or search for a product</Text>
        </View>
        <View style={styles.statusCopy}>
          <View style={styles.greenDot} />
          <Text style={[styles.statusText, { fontSize: responsive.font(12.5) }]}>Online • Ready</Text>
        </View>
      </View>

      {query.trim() ? (
        <View style={[styles.resultsCard, { padding: responsive.narrow ? 10 : spacing.md }]}>
          <Text style={[styles.resultsTitle, { fontSize: responsive.font(typography.label) }]}>Search results</Text>
          {matches.length ? matches.map((product) => (
            <Pressable
              key={product.id}
              disabled={product.stock === 0}
              onPress={() => { addProduct(product); setQuery(''); }}
              style={({ pressed }) => [styles.resultRow, { minHeight: responsive.s(58) }, pressed && { opacity: 0.72 }]}
            >
              <ProductThumbnail product={product} size={responsive.s(responsive.narrow ? 40 : 44)} />
              <View style={styles.resultCopy}>
                <Text style={[styles.productName, { fontSize: responsive.font(responsive.narrow ? 13.5 : 15.5) }]}>{product.name}</Text>
                <Text style={[styles.meta, { fontSize: responsive.font(typography.caption) }]}>{product.stock} in stock • ₱{product.price.toFixed(2)}</Text>
              </View>
              <View style={[styles.addCircle, product.stock === 0 && styles.addCircleDisabled, { width: responsive.s(34), height: responsive.s(34) }]}>
                <Ionicons name="add" size={responsive.s(20)} color={product.stock === 0 ? colors.textMuted : colors.white} />
              </View>
            </Pressable>
          )) : <Text style={styles.noResult}>No matching product was found.</Text>}
        </View>
      ) : null}

      <View style={[styles.cartCard, { padding: responsive.narrow ? 10 : spacing.md }]}>
        <View style={[styles.cardHeader, { minHeight: responsive.s(44) }]}>
          <View style={styles.headingRow}>
            <Ionicons name="cart" size={responsive.s(26)} color={colors.primary} />
            <Text style={[styles.sectionTitle, { fontSize: responsive.font(responsive.narrow ? 19 : 21) }]}>Cart <Text style={styles.titleMuted}>({totalItems} {totalItems === 1 ? 'item' : 'items'})</Text></Text>
          </View>
          <Pressable disabled={!cart.length} onPress={clearCart} style={styles.clearAction}>
            <Ionicons name="trash-outline" size={responsive.s(20)} color={cart.length ? colors.danger : colors.textMuted} />
            {!responsive.veryNarrow ? <Text style={[styles.clearText, { fontSize: responsive.font(14) }, !cart.length && { color: colors.textMuted }]}>Clear All</Text> : null}
          </Pressable>
        </View>

        {cart.length === 0 ? (
          <View style={[styles.emptyCart, { minHeight: responsive.heightValue(0.205, 145, 185), paddingHorizontal: responsive.narrow ? spacing.lg : spacing.xl }]}>
            <View style={[styles.emptyIcon, { width: responsive.s(58), height: responsive.s(58), borderRadius: responsive.s(18) }]}><Ionicons name="basket-outline" size={responsive.s(32)} color={colors.primary} /></View>
            <Text style={[styles.emptyTitle, { fontSize: responsive.font(typography.title) }]}>Your cart is ready for a new sale</Text>
            <Text style={[styles.emptyBody, { fontSize: responsive.font(typography.label) }]}>Scan a barcode or search for a product above to add the first item.</Text>
          </View>
        ) : cart.map((line, index) => (
          <View
            key={line.product.id}
            style={[
              styles.cartLine,
              index > 0 && styles.lineBorder,
              {
                minHeight: responsive.heightValue(0.13, 98, 118),
                gap: responsive.narrow ? 8 : spacing.md,
                paddingVertical: responsive.short ? 10 : spacing.md,
              },
            ]}
          >
            <ProductThumbnail product={line.product} size={productThumbSize} />
            <View style={styles.lineCopy}>
              <Text numberOfLines={2} style={[styles.productName, { fontSize: responsive.font(responsive.narrow ? 13.5 : 15.5) }]}>{line.product.name}</Text>
              <Text style={[styles.meta, { fontSize: responsive.font(typography.caption) }]}>₱{line.product.price.toFixed(2)}</Text>
              <View style={styles.stockLine}><View style={styles.greenDotSmall} /><Text style={[styles.stockText, { fontSize: responsive.font(responsive.narrow ? 11 : 12.5) }]}>In stock ({line.product.stock})</Text></View>
            </View>
            <View style={[styles.lineRight, { minWidth: responsive.narrow ? 94 : 108, gap: responsive.short ? 7 : 10 }]}>
              <View style={[styles.qtyControl, { minHeight: responsive.s(38) }]}>
                <Pressable accessibilityLabel={`Decrease ${line.product.name}`} style={[styles.qtyButton, { width: responsive.s(responsive.narrow ? 32 : 36), height: responsive.s(38) }]} onPress={() => decrementProduct(line.product.id)}><Text style={[styles.qtyText, { fontSize: responsive.font(20) }]}>−</Text></Pressable>
                <Text style={[styles.qtyNumber, { width: responsive.s(responsive.narrow ? 30 : 35), fontSize: responsive.font(16) }]}>{line.quantity}</Text>
                <Pressable accessibilityLabel={`Increase ${line.product.name}`} style={[styles.qtyButton, { width: responsive.s(responsive.narrow ? 32 : 36), height: responsive.s(38) }]} onPress={() => addProduct(line.product)}><Text style={[styles.qtyText, { fontSize: responsive.font(20) }]}>+</Text></Pressable>
              </View>
              <Text style={[styles.amount, { fontSize: responsive.font(responsive.narrow ? 16 : 18) }]}>₱{(line.product.price * line.quantity).toFixed(2)}</Text>
            </View>
          </View>
        ))}

        <View style={[styles.summaryCard, { padding: responsive.narrow ? 10 : spacing.md, gap: responsive.short ? 8 : 11 }]}>
          <View style={styles.summaryRow}><View style={styles.summaryLabelRow}><Ionicons name="calculator-outline" size={responsive.s(19)} color={colors.primary} /><Text style={[styles.summaryLabel, { fontSize: responsive.font(responsive.narrow ? 13 : 14.5) }]}>Subtotal ({totalItems} items)</Text></View><Text style={[styles.summaryValue, { fontSize: responsive.font(responsive.narrow ? 13 : 14.5) }]}>₱{total.toFixed(2)}</Text></View>
          <View style={styles.summaryRow}><View style={styles.summaryLabelRow}><Ionicons name="pricetag-outline" size={responsive.s(19)} color={colors.primary} /><Text style={[styles.summaryLabel, { fontSize: responsive.font(responsive.narrow ? 13 : 14.5) }]}>Discount</Text></View><Text style={[styles.summaryValue, { fontSize: responsive.font(responsive.narrow ? 13 : 14.5) }]}>₱0.00</Text></View>
          <View style={styles.divider} />
          <View style={styles.totalRow}><Text style={[styles.totalLabel, { fontSize: responsive.font(responsive.narrow ? 21 : 23) }]}>Total</Text><Text style={[styles.totalValue, { fontSize: responsive.font(responsive.narrow ? 27 : 30) }]}>₱{total.toFixed(2)}</Text></View>
        </View>
      </View>

      <View style={[styles.paymentCard, { padding: responsive.narrow ? 10 : spacing.md, gap: responsive.short ? 10 : spacing.md }]}>
        <View style={styles.paymentHeader}>
          <View style={styles.headingRow}>
            <Ionicons name="card-outline" size={responsive.s(24)} color={colors.primary} />
            <Text style={[styles.paymentTitle, { fontSize: responsive.font(responsive.narrow ? 16 : typography.title) }]}>Payment Method</Text>
          </View>
          {!responsive.veryNarrow ? <Text style={[styles.selectText, { fontSize: responsive.font(typography.caption) }]}>Select a method</Text> : null}
        </View>
        <View style={[styles.paymentOptions, responsive.veryNarrow && styles.paymentOptionsStack]}>
          <PaymentOption icon="cash-outline" label="Cash" selected={method === 'cash'} onPress={() => setMethod('cash')} />
          <PaymentOption icon="qr-code-outline" label="QR Ph / PayMongo" selected={method === 'qrph'} onPress={() => setMethod('qrph')} />
        </View>
        <Pressable
          disabled={!cart.length}
          onPress={proceed}
          style={({ pressed }) => [
            styles.proceedButton,
            { minHeight: responsive.heightValue(0.071, 54, 62) },
            !cart.length && styles.proceedDisabled,
            pressed && cart.length && { opacity: 0.86 },
          ]}
        >
          <Ionicons name="lock-closed" size={responsive.s(20)} color={colors.white} />
          <Text style={[styles.proceedText, { fontSize: responsive.font(responsive.narrow ? 15 : 17) }]}>Proceed to Payment</Text>
          <Ionicons name="arrow-forward" size={responsive.s(23)} color={colors.white} />
        </Pressable>
        <View style={styles.secureRow}>
          <Ionicons name="shield-checkmark" size={responsive.s(16)} color={colors.primary} />
          <Text style={[styles.secureText, { fontSize: responsive.font(10.5) }]}>Secure and trusted payments powered by</Text>
          <Ionicons name="ellipse" size={responsive.s(12)} color="#18A9C9" />
          <Text style={[styles.paymongo, { fontSize: responsive.font(11) }]}>PayMongo</Text>
        </View>
      </View>
    </Screen>
  );
}

function PaymentOption({ icon, label, selected, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; selected: boolean; onPress: () => void }) {
  const responsive = useResponsive();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.paymentOption,
        {
          flex: responsive.veryNarrow ? undefined : 1,
          width: responsive.veryNarrow ? '100%' : undefined,
          minHeight: responsive.s(58),
          paddingHorizontal: responsive.narrow ? 10 : spacing.md,
        },
        selected && styles.paymentOptionSelected,
      ]}
    >
      <Ionicons name={icon} size={responsive.s(23)} color={selected ? colors.primary : colors.text} />
      <Text numberOfLines={1} style={[styles.paymentOptionText, { fontSize: responsive.font(responsive.narrow ? 12 : 13.5) }]}>{label}</Text>
      <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={responsive.s(23)} color={selected ? colors.primary : colors.outline} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  searchBox: { flex: 1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.sm, shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  searchInput: { flex: 1, minWidth: 0, color: colors.text, paddingVertical: 0 },
  scanButton: { borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  scanText: { color: colors.white, fontWeight: '800' },
  statusLine: { marginTop: -8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  statusLineNarrow: { marginTop: -6, flexWrap: 'wrap' },
  statusCopy: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  statusText: { color: colors.textMuted, flexShrink: 1 },
  greenDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  greenDotSmall: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  resultsCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, gap: 4 },
  resultsTitle: { color: colors.text, fontWeight: '800', marginBottom: 2 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.outline },
  resultCopy: { flex: 1 },
  addCircle: { borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  addCircleDisabled: { backgroundColor: colors.surfaceMuted },
  noResult: { color: colors.textMuted, paddingVertical: spacing.md, textAlign: 'center' },
  cartCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, shadowColor: colors.shadow, shadowOpacity: 0.06, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: 3 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 0 },
  sectionTitle: { color: colors.text, fontWeight: '900', letterSpacing: -0.4 },
  titleMuted: { color: colors.textMuted, fontWeight: '600' },
  clearAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8 },
  clearText: { color: colors.danger, fontWeight: '800' },
  emptyCart: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIcon: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.text, fontWeight: '800', textAlign: 'center' },
  emptyBody: { color: colors.textMuted, lineHeight: 20, textAlign: 'center' },
  cartLine: { flexDirection: 'row', alignItems: 'center' },
  lineBorder: { borderTopWidth: 1, borderTopColor: colors.outline },
  lineCopy: { flex: 1, minWidth: 0, gap: 3 },
  productName: { color: colors.text, fontWeight: '800' },
  meta: { color: colors.textMuted, marginTop: 2 },
  stockLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  stockText: { color: colors.success, fontWeight: '600' },
  lineRight: { alignItems: 'flex-end' },
  qtyControl: { borderRadius: 12, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surfaceMuted, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  qtyButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  qtyText: { color: colors.text, fontWeight: '700' },
  qtyNumber: { textAlign: 'center', color: colors.text, fontWeight: '800' },
  amount: { color: colors.text, fontWeight: '900' },
  summaryCard: { marginTop: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primaryWash, overflow: 'hidden' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  summaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryLabel: { color: colors.textMuted, fontWeight: '600' },
  summaryValue: { color: colors.text, fontWeight: '800' },
  divider: { height: 1, backgroundColor: colors.outline, marginTop: 1 },
  totalRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  totalLabel: { color: colors.text, fontWeight: '900' },
  totalValue: { color: colors.primary, fontWeight: '900', letterSpacing: -0.8 },
  paymentCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, shadowColor: colors.shadow, shadowOpacity: 0.06, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  paymentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  paymentTitle: { color: colors.text, fontWeight: '900' },
  selectText: { color: colors.primary, fontWeight: '700' },
  paymentOptions: { flexDirection: 'row', gap: spacing.sm },
  paymentOptionsStack: { flexDirection: 'column' },
  paymentOption: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 8 },
  paymentOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryWash },
  paymentOptionText: { flex: 1, minWidth: 0, color: colors.text, fontWeight: '700' },
  proceedButton: { borderRadius: radius.md, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, shadowColor: colors.shadow, shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  proceedDisabled: { opacity: 0.42 },
  proceedText: { color: colors.white, fontWeight: '900' },
  secureRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, flexWrap: 'wrap' },
  secureText: { color: colors.textMuted },
  paymongo: { color: colors.text, fontWeight: '800' },
});

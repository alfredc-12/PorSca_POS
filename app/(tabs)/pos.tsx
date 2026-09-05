import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { ProductThumbnail } from '@/src/components/ProductThumbnail';
import { usePos } from '@/src/context/PosContext';
import { PaymentMethod } from '@/src/types';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

export default function PosScreen() {
  const { cart, total, addProduct, decrementProduct, products, clearCart } = usePos();
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');

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

  return (
    <Screen>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={23} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search product or scan barcode..."
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
          />
        </View>
        <Pressable style={styles.scanButton} onPress={() => router.push('/scanner')}>
          <Ionicons name="barcode-outline" size={25} color={colors.white} />
          <Text style={styles.scanText}>Scan</Text>
        </Pressable>
      </View>

      <View style={styles.statusLine}>
        <View style={styles.statusCopy}>
          <Ionicons name="barcode-outline" size={19} color={colors.primary} />
          <Text style={styles.statusText}>Scan a barcode or search for a product</Text>
        </View>
        <View style={styles.statusCopy}>
          <View style={styles.greenDot} />
          <Text style={styles.statusText}>Online • Ready</Text>
        </View>
      </View>

      {query.trim() ? (
        <View style={styles.resultsCard}>
          <Text style={styles.resultsTitle}>Search results</Text>
          {matches.length ? matches.map((product) => (
            <Pressable
              key={product.id}
              disabled={product.stock === 0}
              onPress={() => { addProduct(product); setQuery(''); }}
              style={({ pressed }) => [styles.resultRow, pressed && { opacity: 0.72 }]}
            >
              <ProductThumbnail product={product} size={44} />
              <View style={styles.resultCopy}>
                <Text style={styles.productName}>{product.name}</Text>
                <Text style={styles.meta}>{product.stock} in stock • ₱{product.price.toFixed(2)}</Text>
              </View>
              <View style={[styles.addCircle, product.stock === 0 && styles.addCircleDisabled]}>
                <Ionicons name="add" size={20} color={product.stock === 0 ? colors.textMuted : colors.white} />
              </View>
            </Pressable>
          )) : <Text style={styles.noResult}>No matching product was found.</Text>}
        </View>
      ) : null}

      <View style={styles.cartCard}>
        <View style={styles.cardHeader}>
          <View style={styles.headingRow}>
            <Ionicons name="cart" size={26} color={colors.primary} />
            <Text style={styles.sectionTitle}>Cart <Text style={styles.titleMuted}>({totalItems} {totalItems === 1 ? 'item' : 'items'})</Text></Text>
          </View>
          <Pressable disabled={!cart.length} onPress={clearCart} style={styles.clearAction}>
            <Ionicons name="trash-outline" size={20} color={cart.length ? colors.danger : colors.textMuted} />
            <Text style={[styles.clearText, !cart.length && { color: colors.textMuted }]}>Clear All</Text>
          </Pressable>
        </View>

        {cart.length === 0 ? (
          <View style={styles.emptyCart}>
            <View style={styles.emptyIcon}><Ionicons name="basket-outline" size={32} color={colors.primary} /></View>
            <Text style={styles.emptyTitle}>Your cart is ready for a new sale</Text>
            <Text style={styles.emptyBody}>Scan a barcode or search for a product above to add the first item.</Text>
          </View>
        ) : cart.map((line, index) => (
          <View key={line.product.id} style={[styles.cartLine, index > 0 && styles.lineBorder]}>
            <ProductThumbnail product={line.product} size={62} />
            <View style={styles.lineCopy}>
              <Text numberOfLines={2} style={styles.productName}>{line.product.name}</Text>
              <Text style={styles.meta}>₱{line.product.price.toFixed(2)}</Text>
              <View style={styles.stockLine}><View style={styles.greenDotSmall} /><Text style={styles.stockText}>In stock ({line.product.stock})</Text></View>
            </View>
            <View style={styles.lineRight}>
              <View style={styles.qtyControl}>
                <Pressable accessibilityLabel={`Decrease ${line.product.name}`} style={styles.qtyButton} onPress={() => decrementProduct(line.product.id)}><Text style={styles.qtyText}>−</Text></Pressable>
                <Text style={styles.qtyNumber}>{line.quantity}</Text>
                <Pressable accessibilityLabel={`Increase ${line.product.name}`} style={styles.qtyButton} onPress={() => addProduct(line.product)}><Text style={styles.qtyText}>+</Text></Pressable>
              </View>
              <Text style={styles.amount}>₱{(line.product.price * line.quantity).toFixed(2)}</Text>
            </View>
          </View>
        ))}

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}><View style={styles.summaryLabelRow}><Ionicons name="calculator-outline" size={19} color={colors.primary} /><Text style={styles.summaryLabel}>Subtotal ({totalItems} items)</Text></View><Text style={styles.summaryValue}>₱{total.toFixed(2)}</Text></View>
          <View style={styles.summaryRow}><View style={styles.summaryLabelRow}><Ionicons name="pricetag-outline" size={19} color={colors.primary} /><Text style={styles.summaryLabel}>Discount</Text></View><Text style={styles.summaryValue}>₱0.00</Text></View>
          <View style={styles.divider} />
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>₱{total.toFixed(2)}</Text></View>
        </View>
      </View>

      <View style={styles.paymentCard}>
        <View style={styles.paymentHeader}>
          <View style={styles.headingRow}>
            <Ionicons name="card-outline" size={24} color={colors.primary} />
            <Text style={styles.paymentTitle}>Payment Method</Text>
          </View>
          <Text style={styles.selectText}>Select a method</Text>
        </View>
        <View style={styles.paymentOptions}>
          <PaymentOption icon="cash-outline" label="Cash" selected={method === 'cash'} onPress={() => setMethod('cash')} />
          <PaymentOption icon="qr-code-outline" label="QR Ph / PayMongo" selected={method === 'qrph'} onPress={() => setMethod('qrph')} />
        </View>
        <Pressable
          disabled={!cart.length}
          onPress={proceed}
          style={({ pressed }) => [styles.proceedButton, !cart.length && styles.proceedDisabled, pressed && cart.length && { opacity: 0.86 }]}
        >
          <Ionicons name="lock-closed" size={20} color={colors.white} />
          <Text style={styles.proceedText}>Proceed to Payment</Text>
          <Ionicons name="arrow-forward" size={23} color={colors.white} />
        </Pressable>
        <View style={styles.secureRow}>
          <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
          <Text style={styles.secureText}>Secure and trusted payments powered by</Text>
          <Ionicons name="ellipse" size={12} color="#18A9C9" />
          <Text style={styles.paymongo}>PayMongo</Text>
        </View>
      </View>
    </Screen>
  );
}

function PaymentOption({ icon, label, selected, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.paymentOption, selected && styles.paymentOptionSelected]}>
      <Ionicons name={icon} size={23} color={selected ? colors.primary : colors.text} />
      <Text numberOfLines={1} style={styles.paymentOptionText}>{label}</Text>
      <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={23} color={selected ? colors.primary : colors.outline} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  searchBox: { flex: 1, minHeight: 56, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.sm, shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  searchInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 15.5, paddingVertical: 0 },
  scanButton: { minHeight: 56, paddingHorizontal: 17, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  scanText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  statusLine: { marginTop: -8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  statusCopy: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  statusText: { color: colors.textMuted, fontSize: 12.5, flexShrink: 1 },
  greenDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  greenDotSmall: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  resultsCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, padding: spacing.md, gap: 4 },
  resultsTitle: { color: colors.text, fontSize: typography.label, fontWeight: '800', marginBottom: 2 },
  resultRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.outline },
  resultCopy: { flex: 1 },
  addCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  addCircleDisabled: { backgroundColor: colors.surfaceMuted },
  noResult: { color: colors.textMuted, paddingVertical: spacing.md, textAlign: 'center' },
  cartCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, padding: spacing.md, shadowColor: colors.shadow, shadowOpacity: 0.06, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  cardHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: 3 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 0 },
  sectionTitle: { color: colors.text, fontSize: 21, fontWeight: '900', letterSpacing: -0.4 },
  titleMuted: { color: colors.textMuted, fontWeight: '600' },
  clearAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8 },
  clearText: { color: colors.danger, fontSize: 14, fontWeight: '800' },
  emptyCart: { minHeight: 176, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: 8 },
  emptyIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.text, fontWeight: '800', fontSize: typography.title, textAlign: 'center' },
  emptyBody: { color: colors.textMuted, fontSize: typography.label, lineHeight: 20, textAlign: 'center' },
  cartLine: { minHeight: 114, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  lineBorder: { borderTopWidth: 1, borderTopColor: colors.outline },
  lineCopy: { flex: 1, minWidth: 0, gap: 3 },
  productName: { color: colors.text, fontSize: 15.5, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: typography.caption, marginTop: 2 },
  stockLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  stockText: { color: colors.success, fontSize: 12.5, fontWeight: '600' },
  lineRight: { minWidth: 108, alignItems: 'flex-end', gap: 10 },
  qtyControl: { minHeight: 38, borderRadius: 12, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surfaceMuted, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  qtyButton: { width: 36, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  qtyText: { color: colors.text, fontSize: 20, fontWeight: '700' },
  qtyNumber: { width: 35, textAlign: 'center', color: colors.text, fontSize: 16, fontWeight: '800' },
  amount: { color: colors.text, fontSize: 18, fontWeight: '900' },
  summaryCard: { marginTop: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primaryWash, padding: spacing.md, gap: 11, overflow: 'hidden' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  summaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryLabel: { color: colors.textMuted, fontSize: 14.5, fontWeight: '600' },
  summaryValue: { color: colors.text, fontSize: 14.5, fontWeight: '800' },
  divider: { height: 1, backgroundColor: colors.outline, marginTop: 1 },
  totalRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  totalLabel: { color: colors.text, fontSize: 23, fontWeight: '900' },
  totalValue: { color: colors.primary, fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
  paymentCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, padding: spacing.md, gap: spacing.md, shadowColor: colors.shadow, shadowOpacity: 0.06, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  paymentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  paymentTitle: { color: colors.text, fontSize: typography.title, fontWeight: '900' },
  selectText: { color: colors.primary, fontSize: typography.caption, fontWeight: '700' },
  paymentOptions: { flexDirection: 'row', gap: spacing.sm },
  paymentOption: { flex: 1, minHeight: 58, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 8 },
  paymentOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryWash },
  paymentOptionText: { flex: 1, minWidth: 0, color: colors.text, fontSize: 13.5, fontWeight: '700' },
  proceedButton: { minHeight: 60, borderRadius: radius.md, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, shadowColor: colors.shadow, shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  proceedDisabled: { opacity: 0.42 },
  proceedText: { color: colors.white, fontSize: 17, fontWeight: '900' },
  secureRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, flexWrap: 'wrap' },
  secureText: { color: colors.textMuted, fontSize: 10.5 },
  paymongo: { color: colors.text, fontSize: 11, fontWeight: '800' },
});

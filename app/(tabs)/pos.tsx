import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { AppButton } from '@/src/components/AppButton';
import { usePos } from '@/src/context/PosContext';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

export default function PosScreen() {
  const { cart, total, addProduct, decrementProduct, products, clearCart } = usePos();

  return (
    <Screen title="Point of sale" subtitle="Scan a product or add one from inventory to start a sale.">
      <Pressable style={styles.scanCard} onPress={() => router.push('/scanner')}>
        <View style={styles.scanIcon}><Ionicons name="barcode-outline" size={30} color={colors.primary} /></View>
        <View style={styles.scanCopy}>
          <Text style={styles.scanTitle}>Scan product barcode</Text>
          <Text style={styles.scanSubtitle}>Use the phone camera for fast checkout.</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
      </Pressable>

      {cart.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Cart is empty</Text>
          <Text style={styles.emptyBody}>Scan a barcode or tap a quick-add item below.</Text>
        </View>
      ) : (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Current cart</Text>
            <Pressable onPress={clearCart}><Text style={styles.clear}>Clear</Text></Pressable>
          </View>
          {cart.map((line) => (
            <View key={line.product.id} style={styles.line}>
              <View style={styles.lineCopy}>
                <Text style={styles.productName}>{line.product.name}</Text>
                <Text style={styles.meta}>₱{line.product.price.toFixed(2)} each</Text>
              </View>
              <View style={styles.qty}>
                <Pressable style={styles.qtyButton} onPress={() => decrementProduct(line.product.id)}><Text style={styles.qtyText}>−</Text></Pressable>
                <Text style={styles.qtyNumber}>{line.quantity}</Text>
                <Pressable style={styles.qtyButton} onPress={() => addProduct(line.product)}><Text style={styles.qtyText}>+</Text></Pressable>
              </View>
              <Text style={styles.amount}>₱{(line.product.price * line.quantity).toFixed(2)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick add</Text>
        {products.slice(0, 3).map((product) => (
          <Pressable key={product.id} style={styles.quickItem} onPress={() => addProduct(product)} disabled={product.stock === 0}>
            <View style={styles.quickCopy}>
              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.meta}>{product.stock} in stock</Text>
            </View>
            <Text style={styles.amount}>₱{product.price.toFixed(2)}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.totalBox}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.total}>₱{total.toFixed(2)}</Text>
      </View>
      <AppButton label="Proceed to checkout" disabled={cart.length === 0} onPress={() => router.push('/checkout')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scanCard: { minHeight: 84, backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  scanIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  scanCopy: { flex: 1, gap: 3 },
  scanTitle: { color: colors.text, fontSize: typography.title, fontWeight: '800' },
  scanSubtitle: { color: colors.textMuted, fontSize: typography.label },
  empty: { paddingVertical: spacing.xxl, alignItems: 'center', gap: spacing.sm },
  emptyTitle: { fontSize: typography.title, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: typography.label, color: colors.textMuted, textAlign: 'center' },
  section: { gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: typography.title, fontWeight: '800', color: colors.text },
  clear: { color: colors.danger, fontWeight: '700' },
  line: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.outline },
  lineCopy: { flex: 1, gap: 2 },
  productName: { color: colors.text, fontSize: typography.body, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: typography.caption },
  qty: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontSize: 20, fontWeight: '700', color: colors.text },
  qtyNumber: { minWidth: 18, textAlign: 'center', fontWeight: '700', color: colors.text },
  amount: { color: colors.text, fontWeight: '800', fontSize: typography.body },
  quickItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.outline },
  quickCopy: { flex: 1, gap: 2 },
  totalBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.outline },
  totalLabel: { color: colors.textMuted, fontSize: typography.body, fontWeight: '600' },
  total: { color: colors.text, fontSize: 34, fontWeight: '900', letterSpacing: -1 },
});

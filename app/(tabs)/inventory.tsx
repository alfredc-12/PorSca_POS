import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { usePos } from '@/src/context/PosContext';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

export default function InventoryScreen() {
  const { products } = usePos();
  const lowStock = products.filter((product) => product.stock <= 5).length;

  return (
    <Screen title="Inventory" subtitle="Keep product prices, barcodes, and stock quantities accurate.">
      <View style={styles.summary}>
        <View><Text style={styles.summaryValue}>{products.length}</Text><Text style={styles.summaryLabel}>Products</Text></View>
        <View><Text style={styles.summaryValue}>{products.reduce((sum, p) => sum + p.stock, 0)}</Text><Text style={styles.summaryLabel}>Units in stock</Text></View>
        <View><Text style={styles.summaryValue}>{lowStock}</Text><Text style={styles.summaryLabel}>Low stock</Text></View>
      </View>

      <Pressable style={styles.addButton} onPress={() => router.push('/product-form')}>
        <Ionicons name="add" size={22} color={colors.white} />
        <Text style={styles.addText}>Add product</Text>
      </Pressable>

      <View style={styles.list}>
        {products.map((product) => (
          <Pressable key={product.id} style={styles.product} onPress={() => router.push({ pathname: '/product-form', params: { id: product.id } })}>
            <View style={styles.productIcon}><Ionicons name="cube-outline" size={22} color={colors.primary} /></View>
            <View style={styles.copy}>
              <Text style={styles.name}>{product.name}</Text>
              <Text style={styles.meta}>{product.barcode} · ₱{product.price.toFixed(2)}</Text>
            </View>
            <View style={styles.stockWrap}>
              <Text style={[styles.stock, product.stock <= 5 && styles.low]}>{product.stock}</Text>
              <Text style={styles.stockLabel}>in stock</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, padding: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  summaryValue: { color: colors.text, fontSize: 24, fontWeight: '900' },
  summaryLabel: { color: colors.textMuted, fontSize: typography.caption, marginTop: 2 },
  addButton: { minHeight: 50, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.sm },
  addText: { color: colors.white, fontSize: typography.body, fontWeight: '800' },
  list: { gap: spacing.sm },
  product: { minHeight: 78, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  productIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  copy: { flex: 1, gap: 3 },
  name: { color: colors.text, fontSize: typography.body, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: typography.caption },
  stockWrap: { alignItems: 'flex-end' },
  stock: { color: colors.success, fontSize: typography.title, fontWeight: '900' },
  low: { color: colors.warning },
  stockLabel: { color: colors.textMuted, fontSize: typography.caption },
});

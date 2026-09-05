import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { ProductThumbnail } from '@/src/components/ProductThumbnail';
import { usePos } from '@/src/context/PosContext';
import { Product } from '@/src/types';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

export default function InventoryScreen() {
  const { products } = usePos();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((product) =>
      product.name.toLowerCase().includes(q) ||
      product.barcode.includes(q) ||
      (product.category ?? '').toLowerCase().includes(q),
    );
  }, [products, query]);

  const lowStock = products.filter((product) => product.stock > 0 && product.stock <= 10).length;
  const outOfStock = products.filter((product) => product.stock === 0).length;
  const healthy = products.filter((product) => product.stock > 10).length;

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
          />
        </View>
        <Pressable style={styles.scanButton} onPress={() => router.push({ pathname: '/scanner', params: { mode: 'inventory' } })}>
          <Ionicons name="barcode-outline" size={25} color={colors.white} />
          <Text style={styles.scanText}>Scan</Text>
        </Pressable>
      </View>

      <View style={styles.statusLine}>
        <View style={styles.statusCopy}>
          <Ionicons name="barcode-outline" size={19} color={colors.primary} />
          <Text style={styles.statusText}>Search or scan to locate an inventory item</Text>
        </View>
        <View style={styles.statusCopy}><View style={styles.greenDot} /><Text style={styles.statusText}>Online • Ready</Text></View>
      </View>

      <View style={styles.inventoryCard}>
        <View style={styles.cardHeading}>
          <View style={styles.headingRow}>
            <Ionicons name="cube-outline" size={28} color={colors.primary} />
            <Text style={styles.title}>Inventory</Text>
          </View>
          <Text style={styles.headingHint}>Manage your products and stock levels</Text>
        </View>

        <View style={styles.metrics}>
          <Metric icon="cube-outline" value={products.length} label="Total Products" tone="green" />
          <Metric icon="checkmark-circle" value={healthy} label="In Stock" tone="green" />
          <Metric icon="alert-circle" value={lowStock} label="Low Stock" tone="yellow" />
          <Metric icon="close-circle" value={outOfStock} label="Out of Stock" tone="red" />
        </View>
      </View>

      <View style={styles.listCard}>
        {filtered.length ? filtered.map((product, index) => (
          <ProductRow key={product.id} product={product} first={index === 0} />
        )) : (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={34} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No products match your search</Text>
            <Text style={styles.emptyBody}>Try a product name, barcode, or category.</Text>
          </View>
        )}
      </View>

      <View style={styles.addWrap}>
        <Pressable style={styles.addButton} onPress={() => router.push('/product-form')}>
          <Ionicons name="add" size={25} color={colors.white} />
          <Text style={styles.addText}>Add Product</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function Metric({ icon, value, label, tone }: { icon: React.ComponentProps<typeof Ionicons>['name']; value: number; label: string; tone: 'green' | 'yellow' | 'red' }) {
  const bg = tone === 'yellow' ? colors.warningSoft : tone === 'red' ? colors.dangerSoft : colors.primarySoft;
  const fg = tone === 'yellow' ? colors.warning : tone === 'red' ? colors.danger : colors.primary;
  return (
    <View style={[styles.metric, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={23} color={fg} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text numberOfLines={2} style={[styles.metricLabel, { color: fg }]}>{label}</Text>
    </View>
  );
}

function ProductRow({ product, first }: { product: Product; first: boolean }) {
  const low = product.stock > 0 && product.stock <= 10;
  const out = product.stock === 0;
  const badgeBackground = out ? colors.dangerSoft : low ? colors.warningSoft : colors.primarySoft;
  const badgeColor = out ? colors.danger : low ? colors.warning : colors.primary;
  const badgeText = out ? 'Out of Stock' : low ? 'Low Stock' : 'In Stock';

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/product-form', params: { id: product.id } })}
      style={({ pressed }) => [styles.productRow, !first && styles.rowBorder, pressed && { opacity: 0.78 }]}
    >
      <ProductThumbnail product={product} size={58} />
      <View style={styles.productCopy}>
        <Text numberOfLines={1} style={styles.productName}>{product.name}</Text>
        <Text numberOfLines={1} style={styles.productMeta}>{product.category ?? 'General'} • SKU: {product.barcode.slice(-7)}</Text>
        <View style={styles.stockLine}>
          <View style={[styles.stockDot, { backgroundColor: badgeColor }]} />
          <Text style={[styles.stockText, { color: badgeColor }]}>{out ? 'Out of stock' : low ? 'Low stock' : 'In stock'} ({product.stock})</Text>
        </View>
      </View>
      <View style={styles.productRight}>
        <View style={[styles.badge, { backgroundColor: badgeBackground }]}><Text style={[styles.badgeText, { color: badgeColor }]}>{badgeText}</Text></View>
        <Text style={styles.price}>₱{product.price.toFixed(2)}</Text>
      </View>
      <Ionicons name="ellipsis-vertical" size={20} color={colors.textMuted} />
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
  inventoryCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, padding: spacing.md, gap: spacing.md, shadowColor: colors.shadow, shadowOpacity: 0.06, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  title: { color: colors.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  headingHint: { color: colors.textMuted, fontSize: 12.5 },
  metrics: { flexDirection: 'row', gap: 7 },
  metric: { flex: 1, minWidth: 0, minHeight: 112, borderRadius: radius.md, paddingVertical: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  metricValue: { color: colors.text, fontSize: 23, fontWeight: '900', marginTop: 3 },
  metricLabel: { fontSize: 10.5, fontWeight: '700', textAlign: 'center', lineHeight: 14 },
  listCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, overflow: 'hidden', shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  productRow: { minHeight: 112, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.outline },
  productCopy: { flex: 1, minWidth: 0, gap: 3 },
  productName: { color: colors.text, fontSize: 15, fontWeight: '800' },
  productMeta: { color: colors.textMuted, fontSize: 11.5 },
  stockLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  stockDot: { width: 8, height: 8, borderRadius: 4 },
  stockText: { fontSize: 12, fontWeight: '600' },
  productRight: { minWidth: 82, alignItems: 'flex-end', gap: 10 },
  badge: { minHeight: 30, paddingHorizontal: 10, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
  price: { color: colors.text, fontSize: 17, fontWeight: '900' },
  empty: { minHeight: 230, alignItems: 'center', justifyContent: 'center', gap: 8, padding: spacing.xl },
  emptyTitle: { color: colors.text, fontSize: typography.title, fontWeight: '800', textAlign: 'center' },
  emptyBody: { color: colors.textMuted, fontSize: typography.label, textAlign: 'center' },
  addWrap: { alignItems: 'flex-end', marginTop: -4 },
  addButton: { minHeight: 56, borderRadius: radius.md, backgroundColor: colors.primary, paddingHorizontal: spacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: colors.shadow, shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  addText: { color: colors.white, fontSize: 16, fontWeight: '900' },
});

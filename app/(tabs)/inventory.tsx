import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { ProductThumbnail } from '@/src/components/ProductThumbnail';
import { usePos } from '@/src/context/PosContext';
import { Product } from '@/src/types';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';
import { useResponsive } from '@/src/hooks/useResponsive';

export default function InventoryScreen() {
  const { products } = usePos();
  const [query, setQuery] = useState('');
  const responsive = useResponsive();

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
        <View style={[styles.searchBox, { minHeight: responsive.controlHeight }]}>
          <Ionicons name="search-outline" size={responsive.s(23)} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search product or scan barcode..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { fontSize: responsive.font(responsive.narrow ? 14 : 15.5) }]}
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
          onPress={() => router.push({ pathname: '/scanner', params: { mode: 'inventory' } })}
        >
          <Ionicons name="barcode-outline" size={responsive.s(25)} color={colors.white} />
          {!responsive.veryNarrow ? <Text style={[styles.scanText, { fontSize: responsive.font(16) }]}>Scan</Text> : null}
        </Pressable>
      </View>

      <View style={[styles.statusLine, responsive.narrow && styles.statusLineNarrow]}>
        <View style={styles.statusCopy}>
          <Ionicons name="barcode-outline" size={responsive.s(19)} color={colors.primary} />
          <Text style={[styles.statusText, { fontSize: responsive.font(12.5) }]}>Search or scan to locate an inventory item</Text>
        </View>
        <View style={styles.statusCopy}>
          <View style={styles.greenDot} />
          <Text style={[styles.statusText, { fontSize: responsive.font(12.5) }]}>Online • Ready</Text>
        </View>
      </View>

      <View style={[styles.inventoryCard, { padding: responsive.narrow ? 10 : spacing.md, gap: responsive.short ? 10 : spacing.md }]}>
        <View style={styles.cardHeading}>
          <View style={styles.headingRow}>
            <Ionicons name="cube-outline" size={responsive.s(28)} color={colors.primary} />
            <Text style={[styles.title, { fontSize: responsive.font(responsive.narrow ? 20 : 22) }]}>Inventory</Text>
          </View>
          <Text
            numberOfLines={responsive.narrow ? 2 : 1}
            style={[styles.headingHint, { fontSize: responsive.font(12.5), maxWidth: responsive.narrow ? '100%' : '58%' }]}
          >
            Manage your products and stock levels
          </Text>
        </View>

        <View style={[styles.metrics, responsive.narrow && styles.metricsWrap]}>
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
          <View style={[styles.empty, { minHeight: responsive.heightValue(0.26, 190, 250) }]}>
            <Ionicons name="search-outline" size={responsive.s(34)} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { fontSize: responsive.font(typography.title) }]}>No products match your search</Text>
            <Text style={[styles.emptyBody, { fontSize: responsive.font(typography.label) }]}>Try a product name, barcode, or category.</Text>
          </View>
        )}
      </View>

      <View style={styles.addWrap}>
        <Pressable
          style={[
            styles.addButton,
            {
              minHeight: responsive.controlHeight,
              paddingHorizontal: responsive.narrow ? spacing.lg : spacing.xl,
              width: responsive.veryNarrow ? '100%' : undefined,
            },
          ]}
          onPress={() => router.push('/product-form')}
        >
          <Ionicons name="add" size={responsive.s(25)} color={colors.white} />
          <Text style={[styles.addText, { fontSize: responsive.font(16) }]}>Add Product</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function Metric({ icon, value, label, tone }: { icon: React.ComponentProps<typeof Ionicons>['name']; value: number; label: string; tone: 'green' | 'yellow' | 'red' }) {
  const responsive = useResponsive();
  const bg = tone === 'yellow' ? colors.warningSoft : tone === 'red' ? colors.dangerSoft : colors.primarySoft;
  const fg = tone === 'yellow' ? colors.warning : tone === 'red' ? colors.danger : colors.primary;

  return (
    <View
      style={[
        styles.metric,
        {
          backgroundColor: bg,
          minHeight: responsive.heightValue(responsive.narrow ? 0.105 : 0.13, 88, 116),
          flexBasis: responsive.narrow ? '47%' : 0,
        },
      ]}
    >
      <Ionicons name={icon} size={responsive.s(23)} color={fg} />
      <Text style={[styles.metricValue, { fontSize: responsive.font(responsive.narrow ? 21 : 23) }]}>{value}</Text>
      <Text numberOfLines={2} style={[styles.metricLabel, { color: fg, fontSize: responsive.font(10.5) }]}>{label}</Text>
    </View>
  );
}

function ProductRow({ product, first }: { product: Product; first: boolean }) {
  const responsive = useResponsive();
  const low = product.stock > 0 && product.stock <= 10;
  const out = product.stock === 0;
  const badgeBackground = out ? colors.dangerSoft : low ? colors.warningSoft : colors.primarySoft;
  const badgeColor = out ? colors.danger : low ? colors.warning : colors.primary;
  const badgeText = out ? 'Out of Stock' : low ? 'Low Stock' : 'In Stock';
  const thumbnailSize = responsive.s(responsive.narrow ? 50 : 58);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/product-form', params: { id: product.id } })}
      style={({ pressed }) => [
        styles.productRow,
        !first && styles.rowBorder,
        {
          minHeight: responsive.heightValue(0.125, 94, 116),
          gap: responsive.narrow ? 8 : spacing.md,
          paddingHorizontal: responsive.narrow ? 10 : spacing.md,
          paddingVertical: responsive.short ? 10 : spacing.md,
        },
        pressed && { opacity: 0.78 },
      ]}
    >
      <ProductThumbnail product={product} size={thumbnailSize} />
      <View style={styles.productCopy}>
        <Text numberOfLines={1} style={[styles.productName, { fontSize: responsive.font(responsive.narrow ? 13.5 : 15) }]}>{product.name}</Text>
        <Text numberOfLines={1} style={[styles.productMeta, { fontSize: responsive.font(responsive.narrow ? 10.5 : 11.5) }]}>{product.category ?? 'General'} • SKU: {product.barcode.slice(-7)}</Text>
        <View style={styles.stockLine}>
          <View style={[styles.stockDot, { backgroundColor: badgeColor }]} />
          <Text style={[styles.stockText, { color: badgeColor, fontSize: responsive.font(responsive.narrow ? 11 : 12) }]}>
            {out ? 'Out of stock' : low ? 'Low stock' : 'In stock'} ({product.stock})
          </Text>
        </View>
      </View>
      <View style={[styles.productRight, { minWidth: responsive.narrow ? 68 : 82, gap: responsive.short ? 6 : 10 }]}>
        {!responsive.veryNarrow ? (
          <View style={[styles.badge, { backgroundColor: badgeBackground, minHeight: responsive.s(30), paddingHorizontal: responsive.narrow ? 7 : 10 }]}>
            <Text style={[styles.badgeText, { color: badgeColor, fontSize: responsive.font(10.5) }]}>{badgeText}</Text>
          </View>
        ) : null}
        <Text style={[styles.price, { fontSize: responsive.font(responsive.narrow ? 15 : 17) }]}>₱{product.price.toFixed(2)}</Text>
      </View>
      <Ionicons name="ellipsis-vertical" size={responsive.s(20)} color={colors.textMuted} />
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
  inventoryCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, shadowColor: colors.shadow, shadowOpacity: 0.06, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  title: { color: colors.text, fontWeight: '900', letterSpacing: -0.4 },
  headingHint: { color: colors.textMuted, flexShrink: 1 },
  metrics: { flexDirection: 'row', gap: 7 },
  metricsWrap: { flexWrap: 'wrap' },
  metric: { flex: 1, minWidth: 0, borderRadius: radius.md, paddingVertical: 9, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  metricValue: { color: colors.text, fontWeight: '900', marginTop: 3 },
  metricLabel: { fontWeight: '700', textAlign: 'center', lineHeight: 14 },
  listCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, overflow: 'hidden', shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  productRow: { flexDirection: 'row', alignItems: 'center' },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.outline },
  productCopy: { flex: 1, minWidth: 0, gap: 3 },
  productName: { color: colors.text, fontWeight: '800' },
  productMeta: { color: colors.textMuted },
  stockLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  stockDot: { width: 8, height: 8, borderRadius: 4 },
  stockText: { fontWeight: '600' },
  productRight: { alignItems: 'flex-end' },
  badge: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontWeight: '800' },
  price: { color: colors.text, fontWeight: '900' },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: spacing.xl },
  emptyTitle: { color: colors.text, fontWeight: '800', textAlign: 'center' },
  emptyBody: { color: colors.textMuted, textAlign: 'center' },
  addWrap: { alignItems: 'flex-end', marginTop: -4 },
  addButton: { borderRadius: radius.md, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: colors.shadow, shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  addText: { color: colors.white, fontWeight: '900' },
});

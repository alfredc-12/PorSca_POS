import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { usePos } from '@/src/context/PosContext';
import { PaymentMethod, Sale } from '@/src/types';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';
import { useResponsive } from '@/src/hooks/useResponsive';

type Filter = 'all' | 'today' | PaymentMethod;

export default function TransactionsScreen() {
  const { sales } = usePos();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [showFilters, setShowFilters] = useState(true);
  const responsive = useResponsive();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const today = new Date().toDateString();
    return sales.filter((sale) => {
      const matchesFilter = filter === 'all'
        || (filter === 'today' && new Date(sale.createdAt).toDateString() === today)
        || sale.paymentMethod === filter;
      const matchesQuery = !q
        || sale.id.toLowerCase().includes(q)
        || sale.total.toFixed(2).includes(q)
        || sale.items.some((item) => item.product.name.toLowerCase().includes(q));
      return matchesFilter && matchesQuery;
    });
  }, [filter, query, sales]);

  const totalSales = sales.reduce((sum, sale) => sum + sale.total, 0);
  const cashCount = sales.filter((sale) => sale.paymentMethod === 'cash').length;
  const qrCount = sales.filter((sale) => sale.paymentMethod === 'qrph').length;

  return (
    <Screen>
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, { minHeight: responsive.controlHeight }]}>
          <Ionicons name="search-outline" size={responsive.s(23)} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search receipt, product, or amount..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { fontSize: responsive.font(responsive.narrow ? 14 : 15) }]}
          />
        </View>
        <Pressable
          style={[
            styles.filterButton,
            {
              minHeight: responsive.controlHeight,
              paddingHorizontal: responsive.narrow ? 13 : 17,
              minWidth: responsive.veryNarrow ? responsive.controlHeight : undefined,
            },
          ]}
          onPress={() => setShowFilters((current) => !current)}
        >
          <Ionicons name="options-outline" size={responsive.s(24)} color={colors.white} />
          {!responsive.veryNarrow ? <Text style={[styles.filterButtonText, { fontSize: responsive.font(16) }]}>Filter</Text> : null}
        </Pressable>
      </View>

      <View style={[styles.summaryCard, { padding: responsive.narrow ? 10 : spacing.md, gap: responsive.short ? 11 : spacing.lg }]}>
        <View style={styles.headingBlock}>
          <View style={styles.headingRow}>
            <Ionicons name="receipt-outline" size={responsive.s(29)} color={colors.primary} />
            <Text style={[styles.title, { fontSize: responsive.font(responsive.narrow ? 22 : 25) }]}>Transactions</Text>
          </View>
          <Text style={[styles.subtitle, { fontSize: responsive.font(13), marginLeft: responsive.s(39) }]}>Track completed sales and payments.</Text>
        </View>

        <View style={[styles.metrics, responsive.narrow && styles.metricsWrap]}>
          <Metric icon="bar-chart-outline" value={`₱${formatCompact(totalSales)}`} label="Total Sales" tone="green" />
          <Metric icon="checkmark-circle" value={String(sales.length)} label="Completed" tone="green" />
          <Metric icon="cash-outline" value={String(cashCount)} label="Cash" tone="yellow" />
          <Metric icon="qr-code-outline" value={String(qrCount)} label="QR Ph" tone="blue" />
        </View>
      </View>

      {showFilters ? (
        <View style={[styles.chips, responsive.veryNarrow && styles.chipsWrap]}>
          <FilterChip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
          <FilterChip label="Today" active={filter === 'today'} onPress={() => setFilter('today')} />
          <FilterChip label="Cash" icon="cash-outline" active={filter === 'cash'} onPress={() => setFilter('cash')} />
          <FilterChip label="QR Ph" icon="qr-code-outline" active={filter === 'qrph'} onPress={() => setFilter('qrph')} />
        </View>
      ) : null}

      <View style={styles.list}>
        {filtered.length === 0 ? (
          <View style={[styles.empty, { minHeight: responsive.heightValue(0.31, 220, 300) }]}>
            <View style={[styles.emptyIcon, { width: responsive.s(62), height: responsive.s(62), borderRadius: responsive.s(20) }]}>
              <Ionicons name="receipt-outline" size={responsive.s(34)} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { fontSize: responsive.font(typography.title) }]}>{sales.length ? 'No matching transactions' : 'No sales yet'}</Text>
            <Text style={[styles.emptyText, { fontSize: responsive.font(typography.label) }]}>{sales.length ? 'Adjust the search or filters to see more receipts.' : 'Complete a checkout and the transaction will appear here automatically.'}</Text>
          </View>
        ) : filtered.map((sale) => <TransactionRow key={sale.id} sale={sale} />)}
      </View>
    </Screen>
  );
}

function Metric({ icon, value, label, tone }: { icon: React.ComponentProps<typeof Ionicons>['name']; value: string; label: string; tone: 'green' | 'yellow' | 'blue' }) {
  const responsive = useResponsive();
  const bg = tone === 'yellow' ? colors.warningSoft : tone === 'blue' ? colors.blueSoft : colors.primarySoft;
  const fg = tone === 'yellow' ? colors.warning : tone === 'blue' ? colors.text : colors.primary;

  return (
    <View
      style={[
        styles.metric,
        {
          backgroundColor: bg,
          minHeight: responsive.heightValue(responsive.narrow ? 0.105 : 0.135, 88, 118),
          flexBasis: responsive.narrow ? '47%' : 0,
        },
      ]}
    >
      <Ionicons name={icon} size={responsive.s(23)} color={fg} />
      <Text numberOfLines={1} style={[styles.metricValue, { fontSize: responsive.font(responsive.narrow ? 18 : 20) }]}>{value}</Text>
      <Text style={[styles.metricLabel, { fontSize: responsive.font(10.5) }]}>{label}</Text>
    </View>
  );
}

function FilterChip({ label, icon, active, onPress }: { label: string; icon?: React.ComponentProps<typeof Ionicons>['name']; active: boolean; onPress: () => void }) {
  const responsive = useResponsive();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        responsive.veryNarrow && styles.chipWrapped,
        { minHeight: responsive.s(46), paddingHorizontal: responsive.narrow ? 7 : 9 },
        active && styles.chipActive,
      ]}
    >
      {icon ? <Ionicons name={icon} size={responsive.s(17)} color={active ? colors.white : colors.primary} /> : null}
      <Text style={[styles.chipText, { fontSize: responsive.font(responsive.narrow ? 11.5 : 13) }, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function TransactionRow({ sale }: { sale: Sale }) {
  const responsive = useResponsive();
  const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);
  const methodLabel = sale.paymentMethod === 'cash' ? 'Cash' : 'QR Ph / PayMongo';

  return (
    <View
      style={[
        styles.sale,
        {
          minHeight: responsive.heightValue(0.125, 96, 114),
          padding: responsive.narrow ? 10 : spacing.md,
          gap: responsive.narrow ? 7 : 10,
        },
      ]}
    >
      <View style={[styles.saleIcon, { width: responsive.s(responsive.narrow ? 46 : 52), height: responsive.s(responsive.narrow ? 46 : 52) }]}>
        <Ionicons name="receipt-outline" size={responsive.s(25)} color={colors.primary} />
      </View>
      <View style={styles.saleCopy}>
        <Text numberOfLines={1} style={[styles.saleId, { fontSize: responsive.font(responsive.narrow ? 13.5 : 15) }]}>{sale.id}</Text>
        <Text numberOfLines={1} style={[styles.saleMeta, { fontSize: responsive.font(responsive.narrow ? 10.5 : 11.5) }]}>{formatSaleDate(sale.createdAt)}</Text>
        <View style={styles.itemsLine}><Ionicons name="bag-handle-outline" size={responsive.s(14)} color={colors.textMuted} /><Text style={[styles.saleMeta, { fontSize: responsive.font(responsive.narrow ? 10.5 : 11.5) }]}>{itemCount} {itemCount === 1 ? 'item' : 'items'}</Text></View>
      </View>
      {!responsive.veryNarrow ? (
        <View style={[styles.saleMiddle, { maxWidth: responsive.narrow ? 88 : 116 }]}>
          <View style={[styles.methodBadge, sale.paymentMethod === 'qrph' && { backgroundColor: colors.blueSoft }, { minHeight: responsive.s(30), paddingHorizontal: responsive.narrow ? 7 : 9 }]}>
            <Ionicons name={sale.paymentMethod === 'cash' ? 'cash-outline' : 'qr-code-outline'} size={responsive.s(16)} color={sale.paymentMethod === 'cash' ? colors.primary : colors.text} />
            <Text numberOfLines={1} style={[styles.methodText, { fontSize: responsive.font(10.5) }]}>{methodLabel}</Text>
          </View>
        </View>
      ) : null}
      <View style={[styles.saleRight, { minWidth: responsive.narrow ? 66 : 78, gap: responsive.short ? 6 : 10 }]}>
        {!responsive.veryNarrow ? (
          <View style={[styles.paidBadge, { minHeight: responsive.s(30), paddingHorizontal: responsive.narrow ? 7 : 10 }]}>
            <Text style={[styles.paidText, { fontSize: responsive.font(10.5) }]}>{sale.status === 'paid' ? 'Completed' : sale.status}</Text>
          </View>
        ) : null}
        <Text style={[styles.amount, { fontSize: responsive.font(responsive.narrow ? 16 : 18) }]}>₱{sale.total.toFixed(2)}</Text>
      </View>
      <Ionicons name="ellipsis-vertical" size={responsive.s(19)} color={colors.textMuted} />
    </View>
  );
}

function formatCompact(value: number) {
  if (value >= 1000) return value.toLocaleString('en-PH', { maximumFractionDigits: 0 });
  return value.toFixed(0);
}

function formatSaleDate(value: string) {
  const date = new Date(value);
  return date.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  searchBox: { flex: 1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.sm, shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  searchInput: { flex: 1, minWidth: 0, color: colors.text, paddingVertical: 0 },
  filterButton: { borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  filterButtonText: { color: colors.white, fontWeight: '800' },
  summaryCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, shadowColor: colors.shadow, shadowOpacity: 0.06, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  headingBlock: { gap: 3 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: colors.text, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { color: colors.textMuted },
  metrics: { flexDirection: 'row', gap: 7 },
  metricsWrap: { flexWrap: 'wrap' },
  metric: { flex: 1, minWidth: 0, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  metricValue: { color: colors.text, fontWeight: '900', marginTop: 5 },
  metricLabel: { color: colors.textMuted, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  chips: { flexDirection: 'row', gap: 8 },
  chipsWrap: { flexWrap: 'wrap' },
  chip: { flex: 1, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  chipWrapped: { flexBasis: '47%' },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontWeight: '700' },
  chipTextActive: { color: colors.white },
  list: { gap: spacing.sm },
  sale: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, flexDirection: 'row', alignItems: 'center', shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  saleIcon: { borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  saleCopy: { flex: 1, minWidth: 0, gap: 3 },
  saleId: { color: colors.text, fontWeight: '900' },
  saleMeta: { color: colors.textMuted },
  itemsLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  saleMiddle: {},
  methodBadge: { borderRadius: radius.pill, backgroundColor: colors.primarySoft, flexDirection: 'row', alignItems: 'center', gap: 5 },
  methodText: { color: colors.text, fontWeight: '700', flexShrink: 1 },
  saleRight: { alignItems: 'flex-end' },
  paidBadge: { borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  paidText: { color: colors.primary, fontWeight: '800', textTransform: 'capitalize' },
  amount: { color: colors.text, fontWeight: '900' },
  empty: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: spacing.xl },
  emptyIcon: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.text, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: colors.textMuted, lineHeight: 20, textAlign: 'center' },
});

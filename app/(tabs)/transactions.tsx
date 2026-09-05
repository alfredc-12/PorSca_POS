import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { usePos } from '@/src/context/PosContext';
import { PaymentMethod, Sale } from '@/src/types';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

type Filter = 'all' | 'today' | PaymentMethod;

export default function TransactionsScreen() {
  const { sales } = usePos();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [showFilters, setShowFilters] = useState(true);

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
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={23} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search receipt, product, or amount..."
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
        </View>
        <Pressable style={styles.filterButton} onPress={() => setShowFilters((current) => !current)}>
          <Ionicons name="options-outline" size={24} color={colors.white} />
          <Text style={styles.filterButtonText}>Filter</Text>
        </Pressable>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.headingBlock}>
          <View style={styles.headingRow}>
            <Ionicons name="receipt-outline" size={29} color={colors.primary} />
            <Text style={styles.title}>Transactions</Text>
          </View>
          <Text style={styles.subtitle}>Track completed sales and payments.</Text>
        </View>

        <View style={styles.metrics}>
          <Metric icon="bar-chart-outline" value={`₱${formatCompact(totalSales)}`} label="Total Sales" tone="green" />
          <Metric icon="checkmark-circle" value={String(sales.length)} label="Completed" tone="green" />
          <Metric icon="cash-outline" value={String(cashCount)} label="Cash" tone="yellow" />
          <Metric icon="qr-code-outline" value={String(qrCount)} label="QR Ph" tone="blue" />
        </View>
      </View>

      {showFilters ? (
        <View style={styles.chips}>
          <FilterChip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
          <FilterChip label="Today" active={filter === 'today'} onPress={() => setFilter('today')} />
          <FilterChip label="Cash" icon="cash-outline" active={filter === 'cash'} onPress={() => setFilter('cash')} />
          <FilterChip label="QR Ph" icon="qr-code-outline" active={filter === 'qrph'} onPress={() => setFilter('qrph')} />
        </View>
      ) : null}

      <View style={styles.list}>
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><Ionicons name="receipt-outline" size={34} color={colors.primary} /></View>
            <Text style={styles.emptyTitle}>{sales.length ? 'No matching transactions' : 'No sales yet'}</Text>
            <Text style={styles.emptyText}>{sales.length ? 'Adjust the search or filters to see more receipts.' : 'Complete a checkout and the transaction will appear here automatically.'}</Text>
          </View>
        ) : filtered.map((sale) => <TransactionRow key={sale.id} sale={sale} />)}
      </View>
    </Screen>
  );
}

function Metric({ icon, value, label, tone }: { icon: React.ComponentProps<typeof Ionicons>['name']; value: string; label: string; tone: 'green' | 'yellow' | 'blue' }) {
  const bg = tone === 'yellow' ? colors.warningSoft : tone === 'blue' ? colors.blueSoft : colors.primarySoft;
  const fg = tone === 'yellow' ? colors.warning : tone === 'blue' ? colors.text : colors.primary;
  return (
    <View style={[styles.metric, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={23} color={fg} />
      <Text numberOfLines={1} style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function FilterChip({ label, icon, active, onPress }: { label: string; icon?: React.ComponentProps<typeof Ionicons>['name']; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      {icon ? <Ionicons name={icon} size={17} color={active ? colors.white : colors.primary} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function TransactionRow({ sale }: { sale: Sale }) {
  const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);
  const methodLabel = sale.paymentMethod === 'cash' ? 'Cash' : 'QR Ph / PayMongo';
  return (
    <View style={styles.sale}>
      <View style={styles.saleIcon}><Ionicons name="receipt-outline" size={25} color={colors.primary} /></View>
      <View style={styles.saleCopy}>
        <Text style={styles.saleId}>{sale.id}</Text>
        <Text style={styles.saleMeta}>{formatSaleDate(sale.createdAt)}</Text>
        <View style={styles.itemsLine}><Ionicons name="bag-handle-outline" size={14} color={colors.textMuted} /><Text style={styles.saleMeta}>{itemCount} {itemCount === 1 ? 'item' : 'items'}</Text></View>
      </View>
      <View style={styles.saleMiddle}>
        <View style={[styles.methodBadge, sale.paymentMethod === 'qrph' && { backgroundColor: colors.blueSoft }]}>
          <Ionicons name={sale.paymentMethod === 'cash' ? 'cash-outline' : 'qr-code-outline'} size={16} color={sale.paymentMethod === 'cash' ? colors.primary : colors.text} />
          <Text numberOfLines={1} style={styles.methodText}>{methodLabel}</Text>
        </View>
      </View>
      <View style={styles.saleRight}>
        <View style={styles.paidBadge}><Text style={styles.paidText}>{sale.status === 'paid' ? 'Completed' : sale.status}</Text></View>
        <Text style={styles.amount}>₱{sale.total.toFixed(2)}</Text>
      </View>
      <Ionicons name="ellipsis-vertical" size={19} color={colors.textMuted} />
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
  searchBox: { flex: 1, minHeight: 56, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.sm, shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  searchInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 15, paddingVertical: 0 },
  filterButton: { minHeight: 56, paddingHorizontal: 17, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  filterButtonText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  summaryCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, padding: spacing.md, gap: spacing.lg, shadowColor: colors.shadow, shadowOpacity: 0.06, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  headingBlock: { gap: 3 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: colors.text, fontSize: 25, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginLeft: 39 },
  metrics: { flexDirection: 'row', gap: 7 },
  metric: { flex: 1, minWidth: 0, minHeight: 116, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  metricValue: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 5 },
  metricLabel: { color: colors.textMuted, fontSize: 10.5, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, minHeight: 46, paddingHorizontal: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: colors.white },
  list: { gap: spacing.sm },
  sale: { minHeight: 112, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  saleIcon: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  saleCopy: { flex: 1, minWidth: 0, gap: 3 },
  saleId: { color: colors.text, fontSize: 15, fontWeight: '900' },
  saleMeta: { color: colors.textMuted, fontSize: 11.5 },
  itemsLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  saleMiddle: { maxWidth: 116 },
  methodBadge: { minHeight: 30, borderRadius: radius.pill, backgroundColor: colors.primarySoft, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  methodText: { color: colors.text, fontSize: 10.5, fontWeight: '700', flexShrink: 1 },
  saleRight: { minWidth: 78, alignItems: 'flex-end', gap: 10 },
  paidBadge: { minHeight: 30, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  paidText: { color: colors.primary, fontSize: 10.5, fontWeight: '800', textTransform: 'capitalize' },
  amount: { color: colors.text, fontSize: 18, fontWeight: '900' },
  empty: { minHeight: 280, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: spacing.xl },
  emptyIcon: { width: 62, height: 62, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.text, fontSize: typography.title, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: colors.textMuted, fontSize: typography.label, lineHeight: 20, textAlign: 'center' },
});

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { usePos } from '@/src/context/PosContext';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

export default function TransactionsScreen() {
  const { sales } = usePos();

  return (
    <Screen title="Sales" subtitle="Completed transactions are recorded here.">
      {sales.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="receipt-outline" size={42} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No sales yet</Text>
          <Text style={styles.emptyText}>Complete a checkout and the transaction will appear here.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {sales.map((sale) => (
            <View key={sale.id} style={styles.sale}>
              <View style={styles.icon}><Ionicons name={sale.paymentMethod === 'cash' ? 'cash-outline' : 'qr-code-outline'} size={22} color={colors.primary} /></View>
              <View style={styles.copy}>
                <Text style={styles.id}>{sale.id}</Text>
                <Text style={styles.meta}>{new Date(sale.createdAt).toLocaleString()} · {sale.items.reduce((sum, item) => sum + item.quantity, 0)} item(s)</Text>
                <Text style={styles.method}>{sale.paymentMethod === 'cash' ? 'Cash' : 'QR Ph'} · PAID</Text>
              </View>
              <Text style={styles.amount}>₱{sale.total.toFixed(2)}</Text>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl },
  emptyTitle: { color: colors.text, fontSize: typography.title, fontWeight: '800' },
  emptyText: { color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  list: { gap: spacing.sm },
  sale: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 3 },
  id: { color: colors.text, fontSize: typography.body, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: typography.caption },
  method: { color: colors.success, fontSize: typography.caption, fontWeight: '700' },
  amount: { color: colors.text, fontSize: typography.title, fontWeight: '900' },
});

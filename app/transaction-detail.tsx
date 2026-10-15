import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { DataState } from '@/src/components/DataState';
import { usePos } from '@/src/context/PosContext';
import { colors, radius, spacing } from '@/src/theme/tokens';

const money = (value: number) => `₱${value.toFixed(2)}`;

/** Read-only receipt: uses Laravel's historical item/price snapshots, never the live catalog. */
export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sales, salesState, refreshSales } = usePos();
  const sale = sales.find((entry) => entry.id === id);

  return (
    <Screen title="Transaction details" subtitle="Receipt" back>
      {salesState === 'unavailable' ? (
        <DataState kind="unavailable" title="History may be out of date" message="The shop server is unavailable. Any receipt shown is from the last loaded history." actionLabel="Retry history" onAction={() => void refreshSales()} />
      ) : null}
      {!sale ? (
        <DataState
          kind={salesState === 'loading' ? 'loading' : 'unavailable'}
          title={salesState === 'loading' ? 'Loading receipt' : 'Receipt not available'}
          message="This transaction is not in the currently loaded history. Return to Transactions or retry history."
          actionLabel={salesState === 'loading' ? undefined : 'Retry history'}
          onAction={() => void refreshSales()}
        />
      ) : (
        <View style={styles.receipt} testID="transaction-receipt">
          <Text style={styles.heading}>PorSca POS</Text>
          <Fact label="Receipt number" value={sale.id} />
          <Fact label="Date" value={new Date(sale.createdAt).toLocaleString('en-PH')} />
          <Fact label="Status" value={sale.status === 'paid' ? 'Completed' : sale.status} />
          <Fact label="Payment method" value={sale.paymentMethod === 'cash' ? 'Cash' : 'QR Ph / PayMongo'} />
          <Text style={styles.heading}>Items</Text>
          {sale.items.map((item, index) => (
            <View key={`${item.product.id}-${index}`} style={styles.item}>
              <Text style={styles.name}>{item.product.name}</Text>
              {item.product.sku ? <Text style={styles.muted}>SKU: {item.product.sku}</Text> : null}
              <Fact label={`${item.quantity} × ${money(item.product.price)}`} value={money(item.quantity * item.product.price)} />
            </View>
          ))}
          <Fact label="Total quantity" value={String(sale.items.reduce((sum, item) => sum + item.quantity, 0))} />
          <Fact label="Total" value={money(sale.total)} />
          {sale.paymentMethod === 'cash' ? (
            <>
              <Fact label="Cash received" value={sale.cashReceived === undefined ? 'Not available' : money(sale.cashReceived)} />
              <Fact label="Change" value={sale.change === undefined ? 'Not available' : money(sale.change)} />
            </>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <View style={styles.fact}><Text style={styles.muted}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  receipt: { backgroundColor: colors.surface, borderRadius: radius.lg, borderColor: colors.outline, borderWidth: 1, padding: spacing.md, gap: spacing.md },
  heading: { color: colors.text, fontSize: 20, fontWeight: '800' },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 14, flexShrink: 1 },
  value: { color: colors.text, fontSize: 15, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  item: { borderBottomWidth: 1, borderBottomColor: colors.outline, paddingBottom: spacing.sm, gap: spacing.xs },
});

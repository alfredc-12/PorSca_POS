import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ProductThumbnail } from './ProductThumbnail';
import { CartLine } from '@/src/types';
import { colors, spacing, typography } from '@/src/theme/tokens';

export const CheckoutOrderSummary = memo(function CheckoutOrderSummary({ cart }: { cart: CartLine[] }) {
  return <View testID="checkout-order-summary">
    <Text style={styles.sectionTitle}>Order summary</Text>
    {cart.map((line, index) => <View key={line.product.id} style={[styles.orderLine, index > 0 && styles.orderBorder]}>
      <ProductThumbnail product={line.product} size={46} />
      <View style={styles.orderCopy}>
        <Text numberOfLines={1} style={styles.orderName}>{line.product.name}</Text>
        <Text style={styles.orderMeta}>Qty {line.quantity} • ₱{line.product.price.toFixed(2)} each</Text>
      </View>
      <Text style={styles.orderAmount}>₱{(line.quantity * line.product.price).toFixed(2)}</Text>
    </View>)}
  </View>;
});
const styles = StyleSheet.create({
  sectionTitle: { color: colors.text, fontSize: typography.title, fontWeight: '900' },
  orderLine: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  orderBorder: { borderTopWidth: 1, borderTopColor: colors.outline },
  orderCopy: { flex: 1, minWidth: 0 },
  orderName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  orderMeta: { color: colors.textMuted, fontSize: 11.5, marginTop: 3 },
  orderAmount: { color: colors.text, fontSize: 15, fontWeight: '900' },
});

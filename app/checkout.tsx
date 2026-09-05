import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { AppButton } from '@/src/components/AppButton';
import { ProductThumbnail } from '@/src/components/ProductThumbnail';
import { usePos } from '@/src/context/PosContext';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

export default function CheckoutScreen() {
  const { method } = useLocalSearchParams<{ method?: string }>();
  const { total, cart, completeSale } = usePos();
  const [mode, setMode] = useState<'cash' | 'qrph'>(method === 'qrph' ? 'qrph' : 'cash');
  const [cash, setCash] = useState('');

  const received = Number(cash) || 0;
  const change = useMemo(() => Math.max(received - total, 0), [received, total]);
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  const finishCash = () => {
    if (received < total) {
      Alert.alert('Insufficient cash', 'Enter an amount equal to or greater than the sale total.');
      return;
    }
    const sale = completeSale('cash');
    if (!sale) {
      Alert.alert('Unable to complete sale', 'Stock changed or the cart is empty. Review the cart and try again.');
      return;
    }
    Alert.alert('Payment recorded', `${sale.id} was completed successfully.`, [{ text: 'Done', onPress: () => router.replace('/(tabs)/transactions') }]);
  };

  const finishQrDemo = () => {
    Alert.alert(
      'QR Ph sandbox mode',
      'PayMongo secret keys stay on the backend. Until the sandbox adapter is connected, this button simulates the successful webhook result used by the POS.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Simulate paid',
          onPress: () => {
            const sale = completeSale('qrph');
            if (sale) router.replace('/(tabs)/transactions');
          },
        },
      ],
    );
  };

  if (cart.length === 0) {
    return (
      <Screen title="Checkout" subtitle="There is nothing to pay yet." back>
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}><Ionicons name="cart-outline" size={36} color={colors.primary} /></View>
          <Text style={styles.emptyTitle}>The cart is empty</Text>
          <Text style={styles.emptyBody}>Return to the POS and add a product before starting payment.</Text>
          <AppButton label="Return to POS" onPress={() => router.replace('/(tabs)/pos')} style={styles.fullButton} />
        </View>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen title="Checkout" subtitle="Confirm the sale, then record payment before inventory is deducted." back>
        <View style={styles.dueCard}>
          <View>
            <Text style={styles.dueLabel}>Amount due</Text>
            <Text style={styles.dueTotal}>₱{total.toFixed(2)}</Text>
            <Text style={styles.dueItems}>{itemCount} {itemCount === 1 ? 'item' : 'items'} in this sale</Text>
          </View>
          <View style={styles.dueIcon}><Ionicons name="bag-check-outline" size={30} color={colors.primary} /></View>
        </View>

        <View style={styles.orderCard}>
          <Text style={styles.sectionTitle}>Order summary</Text>
          {cart.map((line, index) => (
            <View key={line.product.id} style={[styles.orderLine, index > 0 && styles.orderBorder]}>
              <ProductThumbnail product={line.product} size={46} />
              <View style={styles.orderCopy}>
                <Text numberOfLines={1} style={styles.orderName}>{line.product.name}</Text>
                <Text style={styles.orderMeta}>Qty {line.quantity} • ₱{line.product.price.toFixed(2)} each</Text>
              </View>
              <Text style={styles.orderAmount}>₱{(line.quantity * line.product.price).toFixed(2)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.paymentCard}>
          <View style={styles.paymentHeader}>
            <View style={styles.headingRow}><Ionicons name="card-outline" size={23} color={colors.primary} /><Text style={styles.sectionTitle}>Payment Method</Text></View>
            <Text style={styles.helper}>Choose one</Text>
          </View>
          <View style={styles.segmentRow}>
            <Pressable onPress={() => setMode('cash')} style={[styles.segment, mode === 'cash' && styles.segmentActive]}>
              <Ionicons name="cash-outline" size={22} color={mode === 'cash' ? colors.primary : colors.textMuted} />
              <Text style={styles.segmentText}>Cash</Text>
              <Ionicons name={mode === 'cash' ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={mode === 'cash' ? colors.primary : colors.outline} />
            </Pressable>
            <Pressable onPress={() => setMode('qrph')} style={[styles.segment, mode === 'qrph' && styles.segmentActive]}>
              <Ionicons name="qr-code-outline" size={22} color={mode === 'qrph' ? colors.primary : colors.textMuted} />
              <Text style={styles.segmentText}>QR Ph</Text>
              <Ionicons name={mode === 'qrph' ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={mode === 'qrph' ? colors.primary : colors.outline} />
            </Pressable>
          </View>

          {mode === 'cash' ? (
            <View style={styles.cashPanel}>
              <Text style={styles.label}>Cash received</Text>
              <View style={styles.moneyInputWrap}>
                <Text style={styles.currency}>₱</Text>
                <TextInput
                  value={cash}
                  onChangeText={setCash}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  accessibilityLabel="Cash received"
                />
              </View>
              <View style={styles.changeBox}>
                <Text style={styles.changeLabel}>Change to customer</Text>
                <Text style={styles.changeValue}>₱{change.toFixed(2)}</Text>
              </View>
              <AppButton label="Confirm Cash Payment" onPress={finishCash} style={styles.fullButton} />
            </View>
          ) : (
            <View style={styles.qrPanel}>
              <View style={styles.qrPlaceholder}>
                <Ionicons name="qr-code" size={112} color={colors.text} />
              </View>
              <Text style={styles.qrTitle}>Dynamic QR Ph payment</Text>
              <Text style={styles.qrBody}>The backend will create a transaction-specific QR and wait for PayMongo confirmation before the sale is recorded.</Text>
              <AppButton label="Start QR Ph Sandbox Flow" onPress={finishQrDemo} style={styles.fullButton} />
            </View>
          )}

          <View style={styles.secureRow}>
            <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
            <Text style={styles.secureText}>Payment status must be confirmed before stock changes.</Text>
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dueCard: { backgroundColor: colors.primaryWash, borderRadius: radius.lg, borderWidth: 1, borderColor: '#D9EADB', padding: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  dueLabel: { color: colors.textMuted, fontSize: typography.label, fontWeight: '700' },
  dueTotal: { color: colors.primary, fontSize: 38, fontWeight: '900', letterSpacing: -1.2, marginTop: 2 },
  dueItems: { color: colors.textMuted, fontSize: typography.caption, marginTop: 3 },
  dueIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.outline },
  orderCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, padding: spacing.md, shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  sectionTitle: { color: colors.text, fontSize: typography.title, fontWeight: '900' },
  orderLine: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  orderBorder: { borderTopWidth: 1, borderTopColor: colors.outline },
  orderCopy: { flex: 1, minWidth: 0 },
  orderName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  orderMeta: { color: colors.textMuted, fontSize: 11.5, marginTop: 3 },
  orderAmount: { color: colors.text, fontSize: 15, fontWeight: '900' },
  paymentCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, padding: spacing.md, gap: spacing.md, shadowColor: colors.shadow, shadowOpacity: 0.06, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  paymentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  helper: { color: colors.primary, fontSize: typography.caption, fontWeight: '700' },
  segmentRow: { flexDirection: 'row', gap: spacing.sm },
  segment: { flex: 1, minHeight: 58, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  segmentActive: { backgroundColor: colors.primaryWash, borderColor: colors.primary },
  segmentText: { flex: 1, color: colors.text, fontSize: typography.label, fontWeight: '800' },
  cashPanel: { gap: spacing.md, paddingTop: 2 },
  label: { color: colors.text, fontSize: typography.label, fontWeight: '800' },
  moneyInputWrap: { minHeight: 62, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.background, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg },
  currency: { color: colors.textMuted, fontSize: 24, fontWeight: '700' },
  input: { flex: 1, minWidth: 0, color: colors.text, fontSize: 25, fontWeight: '900', paddingLeft: spacing.sm },
  changeBox: { minHeight: 68, borderRadius: radius.md, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  changeLabel: { color: colors.textMuted, fontSize: typography.label, fontWeight: '600' },
  changeValue: { color: colors.primary, fontSize: typography.heading, fontWeight: '900' },
  qrPanel: { gap: spacing.md, alignItems: 'center', paddingTop: spacing.sm },
  qrPlaceholder: { width: 184, height: 184, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  qrTitle: { color: colors.text, textAlign: 'center', fontSize: typography.title, fontWeight: '900' },
  qrBody: { color: colors.textMuted, textAlign: 'center', fontSize: typography.label, lineHeight: 20, maxWidth: 390 },
  fullButton: { alignSelf: 'stretch' },
  secureRow: { minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secureText: { color: colors.textMuted, fontSize: 11, textAlign: 'center', flexShrink: 1 },
  emptyCard: { minHeight: 300, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  emptyIcon: { width: 68, height: 68, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.text, fontSize: typography.heading, fontWeight: '900', textAlign: 'center' },
  emptyBody: { color: colors.textMuted, fontSize: typography.label, lineHeight: 21, textAlign: 'center' },
});

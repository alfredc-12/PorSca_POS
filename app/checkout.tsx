import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { AppButton } from '@/src/components/AppButton';
import { usePos } from '@/src/context/PosContext';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

export default function CheckoutScreen() {
  const { total, cart, completeSale } = usePos();
  const [mode, setMode] = useState<'cash' | 'qrph'>('cash');
  const [cash, setCash] = useState('');

  const received = Number(cash) || 0;
  const change = useMemo(() => Math.max(received - total, 0), [received, total]);

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
      'This scaffold keeps PayMongo secret keys on the backend. Start the server and configure EXPO_PUBLIC_API_URL to enable the live sandbox flow. For now, you can simulate a successful payment for UI testing.',
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
      <Screen title="Checkout" subtitle="There is nothing to pay yet.">
        <AppButton label="Return to POS" onPress={() => router.replace('/(tabs)/pos')} />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen title="Checkout" subtitle="Confirm the amount and record a successful payment before stock is deducted.">
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Amount due</Text>
          <Text style={styles.total}>₱{total.toFixed(2)}</Text>
          <Text style={styles.items}>{cart.reduce((sum, line) => sum + line.quantity, 0)} item(s)</Text>
        </View>

        <View style={styles.segmentRow}>
          <Pressable onPress={() => setMode('cash')} style={[styles.segment, mode === 'cash' && styles.segmentActive]}>
            <Ionicons name="cash-outline" size={22} color={mode === 'cash' ? colors.white : colors.text} />
            <Text style={[styles.segmentText, mode === 'cash' && styles.segmentTextActive]}>Cash</Text>
          </Pressable>
          <Pressable onPress={() => setMode('qrph')} style={[styles.segment, mode === 'qrph' && styles.segmentActive]}>
            <Ionicons name="qr-code-outline" size={22} color={mode === 'qrph' ? colors.white : colors.text} />
            <Text style={[styles.segmentText, mode === 'qrph' && styles.segmentTextActive]}>QR Ph</Text>
          </Pressable>
        </View>

        {mode === 'cash' ? (
          <View style={styles.panel}>
            <Text style={styles.label}>Cash received</Text>
            <TextInput
              value={cash}
              onChangeText={setCash}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              accessibilityLabel="Cash received"
            />
            <View style={styles.changeRow}>
              <Text style={styles.changeLabel}>Change</Text>
              <Text style={styles.changeValue}>₱{change.toFixed(2)}</Text>
            </View>
            <AppButton label="Confirm cash payment" onPress={finishCash} />
          </View>
        ) : (
          <View style={styles.panel}>
            <View style={styles.qrPlaceholder}>
              <Ionicons name="qr-code" size={104} color={colors.text} />
            </View>
            <Text style={styles.qrTitle}>Dynamic QR Ph payment</Text>
            <Text style={styles.qrBody}>The production-ready flow is designed to request a QR from your backend, wait for PayMongo payment confirmation, then record the sale and deduct stock.</Text>
            <AppButton label="Start QR Ph sandbox flow" onPress={finishQrDemo} />
          </View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  totalCard: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.xs },
  totalLabel: { color: '#DDECE4', fontSize: typography.label, fontWeight: '700' },
  total: { color: colors.white, fontSize: 40, fontWeight: '900', letterSpacing: -1.4 },
  items: { color: '#DDECE4', fontSize: typography.label },
  segmentRow: { flexDirection: 'row', gap: spacing.sm },
  segment: { flex: 1, minHeight: 52, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.sm },
  segmentActive: { backgroundColor: colors.text, borderColor: colors.text },
  segmentText: { color: colors.text, fontSize: typography.body, fontWeight: '800' },
  segmentTextActive: { color: colors.white },
  panel: { gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, padding: spacing.lg },
  label: { color: colors.text, fontSize: typography.label, fontWeight: '700' },
  input: { minHeight: 58, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, paddingHorizontal: spacing.lg, color: colors.text, backgroundColor: colors.background, fontSize: 24, fontWeight: '800' },
  changeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  changeLabel: { color: colors.textMuted, fontSize: typography.body },
  changeValue: { color: colors.text, fontSize: typography.heading, fontWeight: '900' },
  qrPlaceholder: { alignSelf: 'center', width: 180, height: 180, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  qrTitle: { color: colors.text, textAlign: 'center', fontSize: typography.title, fontWeight: '900' },
  qrBody: { color: colors.textMuted, textAlign: 'center', fontSize: typography.label, lineHeight: 21 },
});

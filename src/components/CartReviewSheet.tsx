import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '@/src/components/AppButton';
import { CartLineChange, CartRevalidation } from '@/src/domain/revalidation';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

/**
 * The pre-checkout review sheet. It shows exactly what changed since each line
 * was added and applies the reconciliation only when the cashier accepts it, so
 * the amount on the screen cannot silently differ from the amount Laravel will
 * charge.
 */
type Props = {
  visible: boolean;
  revalidation?: CartRevalidation;
  onApply: () => void;
  onDismiss: () => void;
};

export function CartReviewSheet({ visible, revalidation, onApply, onDismiss }: Props) {
  if (!revalidation) return null;

  const removed = revalidation.changes.some((change) => change.kind === 'removed');
  const shortStock = revalidation.changes.some((change) => change.kind === 'stock' && change.blocking);
  const blocked = revalidation.status === 'blocked';
  const applyLabel = blocked
    ? removed && shortStock
      ? 'Update cart & continue'
      : removed
        ? 'Remove unavailable items'
        : 'Update quantities & continue'
    : 'Update prices & continue';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View testID="cart-review-sheet" style={styles.sheet}>
          <View style={styles.header}>
            <View style={[styles.icon, blocked ? styles.iconDanger : styles.iconWarning]}>
              <Ionicons name={blocked ? 'alert-circle' : 'pricetag-outline'} size={26} color={blocked ? colors.danger : colors.warning} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Review before payment</Text>
              <Text style={styles.subtitle}>Laravel recomputes the final amount. Nothing has been charged yet.</Text>
            </View>
            <Pressable accessibilityLabel="Close review" onPress={onDismiss} style={styles.close}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <Text testID="cart-review-message" style={[styles.message, blocked && styles.messageDanger]}>{revalidation.message}</Text>

          <ScrollView style={styles.changes} contentContainerStyle={styles.changesContent} showsVerticalScrollIndicator={false}>
            {revalidation.changes.map((change) => (
              <ChangeRow key={`${change.productId}-${change.kind}`} change={change} />
            ))}
          </ScrollView>

          <View style={styles.actions}>
            <AppButton testID="cart-review-apply" label={applyLabel} onPress={onApply} style={styles.button} />
            <AppButton testID="cart-review-dismiss" label="Back to cart" variant="secondary" onPress={onDismiss} style={styles.button} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ChangeRow({ change }: { change: CartLineChange }) {
  const tone = change.kind === 'removed' || change.blocking ? colors.danger : colors.warning;
  const background = change.kind === 'removed' || change.blocking ? colors.dangerSoft : colors.warningSoft;

  return (
    <View testID={`cart-review-change-${change.kind}`} style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: background }]}>
        <Ionicons
          name={change.kind === 'removed' ? 'close-circle-outline' : change.kind === 'price' ? 'cash-outline' : 'layers-outline'}
          size={19}
          color={tone}
        />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowName}>{change.name}</Text>
        <Text style={styles.rowDetail}>{describeChange(change)}</Text>
      </View>
    </View>
  );
}

function describeChange(change: CartLineChange): string {
  switch (change.kind) {
    case 'price':
      return `Price changed from ₱${(change.previousPrice ?? 0).toFixed(2)} to ₱${(change.price ?? 0).toFixed(2)} each. New line total ₱${((change.price ?? 0) * change.quantity).toFixed(2)}.`;
    case 'stock':
      return change.blocking
        ? `Only ${change.stock ?? 0} left in stock, but this cart has ${change.quantity}.`
        : `Stock changed from ${change.previousStock ?? 0} to ${change.stock ?? 0}. The cart quantity is still available.`;
    case 'removed':
      return 'This product is no longer in the catalog, so it cannot be sold.';
  }
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,19,15,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '86%', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  iconWarning: { backgroundColor: colors.warningSoft },
  iconDanger: { backgroundColor: colors.dangerSoft },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: typography.title, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: typography.caption, lineHeight: 17, marginTop: 2 },
  close: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  message: { color: colors.text, fontSize: typography.label, lineHeight: 20, fontWeight: '600', backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md },
  messageDanger: { backgroundColor: colors.dangerSoft, color: colors.danger },
  changes: { flexGrow: 0 },
  changesContent: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, padding: spacing.md, backgroundColor: colors.surfaceMuted },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowName: { color: colors.text, fontSize: typography.label, fontWeight: '800' },
  rowDetail: { color: colors.textMuted, fontSize: typography.caption, lineHeight: 17, marginTop: 2 },
  actions: { gap: spacing.sm },
  button: { alignSelf: 'stretch' },
});

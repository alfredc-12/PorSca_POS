import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DataState } from '@/src/components/DataState';
import { Screen } from '@/src/components/Screen';
import { usePos } from '@/src/context/PosContext';
import { isOpenCheckout } from '@/src/domain/salesHolds';
import { colors, radius, spacing } from '@/src/theme/tokens';

export default function DeviceStorageRecoveryScreen() {
  const {
    recoverableCheckouts,
    checkoutListState,
    checkoutListError,
    checkoutRecoveryError,
    hasUnreadableCheckoutIdentity,
    canDiscardCorruptCheckout,
    openPosCheckouts,
    discardCorruptCheckout,
  } = usePos();
  const [reason, setReason] = useState('');
  const [reviewDiscard, setReviewDiscard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const openCheckouts = recoverableCheckouts.filter(isOpenCheckout);
  const discoveryReady = checkoutListState === 'ready';

  useEffect(() => { void openPosCheckouts(); }, [openPosCheckouts]);

  const retryDiscovery = () => {
    setReviewDiscard(false);
    setNotice(undefined);
    void openPosCheckouts();
  };

  const discardIdentity = async () => {
    if (!canDiscardCorruptCheckout || openCheckouts.length > 0 || reason.trim().length < 8 || reason.trim().length > 500) return;
    setBusy(true);
    setNotice(undefined);
    try {
      const attributedReason = await discardCorruptCheckout(reason);
      setReason('');
      setReviewDiscard(false);
      setNotice(`Unreadable local identity discarded after the shop server found zero open checkouts. Reason provided: ${attributedReason}. This does not confirm whether money was collected.`);
    } catch {
      setReviewDiscard(false);
      setNotice('The identity was not discarded. Retry server discovery; no payment outcome was confirmed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Device storage recovery" subtitle="An unreadable local identity cannot tell whether a payment was collected. The shop server must be checked first.">
      <View style={styles.safetyNotice} accessibilityRole="alert">
        <Ionicons name="shield-checkmark-outline" size={20} color={colors.warning} />
        <Text style={styles.safetyText}>Discarding only removes unreadable local identity data. It never confirms, denies, or changes whether money was collected.</Text>
      </View>
      {notice ? <View style={styles.notice} accessibilityRole="alert"><Text style={styles.noticeText}>{notice}</Text></View> : null}
      {checkoutListState === 'idle' || checkoutListState === 'loading' ? <DataState kind="loading" title="Discovering shop checkouts" message="Discard stays unavailable until server discovery completes." /> : null}
      {checkoutListState === 'unavailable' ? <DataState kind="unavailable" title="Server discovery unavailable" message={checkoutListError ?? 'The unreadable identity remains untouched until the shop server can be checked.'} actionLabel="Retry discovery" onAction={retryDiscovery} /> : null}
      {discoveryReady ? (
        <View style={styles.discoveryCard}>
          <View style={styles.discoveryHeader}>
            <Ionicons name={openCheckouts.length ? 'folder-open-outline' : 'checkmark-circle-outline'} size={23} color={openCheckouts.length ? colors.warning : colors.primary} />
            <Text style={styles.discoveryTitle}>{openCheckouts.length ? `${openCheckouts.length} open ${openCheckouts.length === 1 ? 'checkout' : 'checkouts'} found` : 'Server discovery found zero open checkouts'}</Text>
          </View>
          <Text style={styles.discoveryBody}>
            {openCheckouts.length
              ? 'The unreadable identity cannot be discarded while open purchases exist. Review and resolve a checkout from Sales/Holds first.'
              : canDiscardCorruptCheckout
                ? 'The unreadable identity may be discarded only with an attributed reason and a second explicit confirmation.'
                : hasUnreadableCheckoutIdentity
                  ? 'The local identity remains unreadable. Retry server discovery before deciding whether it can be discarded.'
                  : 'No unreadable identity is currently available to discard. Retry discovery if the local storage alert is still present.'}
          </Text>
          {checkoutRecoveryError ? <Text style={styles.discoveryFootnote}>{checkoutRecoveryError}</Text> : null}
        </View>
      ) : null}
      {discoveryReady && openCheckouts.length > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/sales-holds')} style={styles.linkButton}>
          <Ionicons name="archive-outline" size={18} color={colors.primary} /><Text style={styles.linkButtonText}>Open Sales/Holds to resolve a checkout</Text>
        </Pressable>
      ) : null}
      {discoveryReady && canDiscardCorruptCheckout && openCheckouts.length === 0 ? (
        <View style={styles.discardCard}>
          <Text style={styles.discardTitle}>Discard unreadable identity</Text>
          <Text style={styles.discardBody}>Enter why the local data is being discarded. The shop server rechecks for open purchases when you confirm.</Text>
          <TextInput
            testID="storage-discard-reason"
            accessibilityLabel="Reason for discarding unreadable identity"
            accessibilityHint="Enter 8 to 500 characters. This reason accompanies the local identity discard confirmation."
            value={reason}
            onChangeText={value => { setReason(value); setReviewDiscard(false); }}
            placeholder="Reason (8–500 characters)"
            placeholderTextColor={colors.textMuted}
            maxLength={500}
            multiline
            textAlignVertical="top"
            editable={!busy}
            style={styles.reasonInput}
          />
          <Text style={[styles.reasonCount, reason.trim().length < 8 && styles.reasonCountInvalid]}>{reason.trim().length}/500 characters • at least 8 required</Text>
          {reviewDiscard ? (
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>Confirm identity discard</Text>
              <Text style={styles.confirmBody}>The server recheck found zero open checkouts. This action deletes only the unreadable local identity and does not establish whether money was collected. Reason: “{reason.trim()}”</Text>
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => setReviewDiscard(false)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Go back</Text></Pressable>
                <Pressable testID="confirm-storage-discard" accessibilityRole="button" disabled={busy} onPress={() => void discardIdentity()} style={[styles.dangerButton, busy && styles.disabled]}><Text style={styles.dangerText}>{busy ? 'Checking…' : 'Confirm discard'}</Text></Pressable>
              </View>
            </View>
          ) : (
            <Pressable testID="review-storage-discard" accessibilityRole="button" disabled={reason.trim().length < 8 || busy} onPress={() => setReviewDiscard(true)} style={[styles.primaryButton, (reason.trim().length < 8 || busy) && styles.disabled]}><Text style={styles.primaryText}>Review discard</Text></Pressable>
          )}
        </View>
      ) : null}
      <View style={styles.footerActions}>
        <Pressable testID="retry-storage-discovery" accessibilityRole="button" disabled={checkoutListState === 'loading' || busy} onPress={retryDiscovery} style={[styles.secondaryButton, (checkoutListState === 'loading' || busy) && styles.disabled]}>
          <Ionicons name="refresh-outline" size={17} color={colors.text} /><Text style={styles.secondaryText}>{checkoutListState === 'loading' ? 'Discovering…' : 'Retry server discovery'}</Text>
        </Pressable>
        <Text style={styles.footerText}>Server discovery is read-only. This page does not create, cancel, or mark a sale as paid.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safetyNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  safetyText: { flex: 1, color: colors.text, lineHeight: 20, fontWeight: '700' },
  notice: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primaryWash },
  noticeText: { color: colors.text, lineHeight: 20, fontWeight: '700' },
  discoveryCard: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface },
  discoveryHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  discoveryTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '900' },
  discoveryBody: { color: colors.textMuted, lineHeight: 20 },
  discoveryFootnote: { color: colors.warning, fontSize: 12, lineHeight: 18 },
  linkButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  linkButtonText: { color: colors.primary, fontWeight: '900' },
  discardCard: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: '#EBD28B', backgroundColor: colors.surface },
  discardTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  discardBody: { color: colors.textMuted, lineHeight: 20 },
  reasonInput: { minHeight: 112, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.white, color: colors.text, padding: spacing.md },
  reasonCount: { color: colors.textMuted, fontSize: 12 },
  reasonCountInvalid: { color: colors.warning, fontWeight: '700' },
  confirmCard: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  confirmTitle: { color: colors.text, fontWeight: '900' },
  confirmBody: { color: colors.text, lineHeight: 20 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: spacing.sm },
  primaryButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.primary },
  primaryText: { color: colors.white, fontWeight: '900' },
  secondaryButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  secondaryText: { color: colors.text, fontWeight: '800' },
  dangerButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.danger },
  dangerText: { color: colors.white, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  footerActions: { gap: spacing.md, paddingTop: spacing.sm },
  footerText: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});

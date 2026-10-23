import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '@/src/theme/tokens';

type Props = {
  visible: boolean;
  title: string;
  description: string;
  submitLabel: string;
  reason: string;
  onChangeReason: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting?: boolean;
  testID?: string;
};

export function CheckoutReasonModal({ visible, title, description, submitLabel, reason, onChangeReason, onCancel, onSubmit, submitting = false, testID }: Props) {
  const length = reason.trim().length;
  const valid = length >= 8 && length <= 500;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.card} testID={testID}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          <TextInput
            accessibilityLabel="Cancellation reason"
            accessibilityHint="Enter 8 to 500 characters. This reason is sent to the shop server."
            value={reason}
            onChangeText={onChangeReason}
            placeholder="Reason (8–500 characters)"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={500}
            textAlignVertical="top"
            editable={!submitting}
            style={styles.input}
          />
          <Text style={[styles.counter, length < 8 && styles.counterInvalid]}>{length}/500 characters • at least 8 required</Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={submitting} onPress={onCancel} style={[styles.button, styles.secondary]}>
              <Text style={styles.secondaryText}>Keep sale</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={!valid || submitting} onPress={onSubmit} style={[styles.button, styles.danger, (!valid || submitting) && styles.disabled]}>
              <Text style={styles.primaryText}>{submitting ? 'Sending…' : submitLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: '#10182788' },
  card: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  description: { color: colors.textMuted, lineHeight: 21 },
  input: { minHeight: 112, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.white, color: colors.text, padding: spacing.md },
  counter: { color: colors.textMuted, fontSize: 12 },
  counterInvalid: { color: colors.warning, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: spacing.sm },
  button: { minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.pill },
  secondary: { backgroundColor: colors.surfaceMuted },
  danger: { backgroundColor: colors.danger },
  secondaryText: { color: colors.text, fontWeight: '800' },
  primaryText: { color: colors.white, fontWeight: '900' },
  disabled: { opacity: 0.45 },
});

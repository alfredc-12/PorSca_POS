import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

/** The on-screen QR box. Sized to fit the checkout card on a small phone. */
export const QR_CODE_SIZE = 248;

/**
 * ISO/IEC 18004 requires a white quiet zone of at least four module widths
 * around a QR symbol. The smallest symbol has 21 modules, so 4/21 of the code
 * width is the least quiet zone that covers every version the renderer can
 * produce from a stored payload.
 */
const QUIET_ZONE_RATIO = 4 / 21;

/**
 * Error-correction level M holds at most 2331 bytes in QR version 40, and the
 * renderer throws instead of drawing when a value cannot be encoded. Payloads
 * above this conservative bound keep the raw-value presentation rather than
 * turning the payment panel into a blank box or a crashed screen.
 */
export const QR_PAYLOAD_MAX_BYTES = 2000;

export type QrPayloadPresentation = 'empty' | 'image' | 'value' | 'oversized';

/** UTF-8 byte length without depending on a TextEncoder polyfill at runtime. */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/**
 * The shop server sends either a provider-rendered QR image (a data URL or a
 * hosted URL) or the raw QR value the device must encode itself. Transport
 * padding is not payload content, so the value is trimmed before it is
 * classified and encoded.
 */
export function classifyQrPayload(payload: string | null | undefined): QrPayloadPresentation {
  const value = payload?.trim() ?? '';
  if (!value) return 'empty';
  if (/^data:image\//i.test(value) || /^https?:\/\//i.test(value)) return 'image';
  return utf8ByteLength(value) > QR_PAYLOAD_MAX_BYTES ? 'oversized' : 'value';
}

/**
 * Renders the provider QR payload as a scannable code. This component only
 * presents what the shop server returned; it never changes payment state, so a
 * drawn code is not a payment result.
 */
export function QrPaymentCode({ payload, size = QR_CODE_SIZE }: { payload?: string | null; size?: number }) {
  const presentation = useMemo(() => classifyQrPayload(payload), [payload]);
  const value = payload?.trim() ?? '';
  const quietZone = Math.ceil(size * QUIET_ZONE_RATIO);

  if (presentation === 'image') {
    return (
      <Image
        testID="qr-payment-image"
        accessibilityLabel="QR Ph payment code"
        source={{ uri: value }}
        style={[styles.image, { width: size, height: size }]}
        resizeMode="contain"
      />
    );
  }

  if (presentation === 'value') {
    return (
      <View
        testID="qr-payment-code"
        accessible
        accessibilityRole="image"
        accessibilityLabel="QR Ph payment code"
        style={[styles.box, { width: size, height: size }]}
      >
        <QRCode
          testID="qr-payment-code-symbol"
          value={value}
          size={size}
          ecl="M"
          quietZone={quietZone}
          color="#000000"
          backgroundColor={colors.white}
        />
      </View>
    );
  }

  if (presentation === 'oversized') {
    return (
      <View testID="qr-payment-payload" style={[styles.payloadCard, { minHeight: size }]}>
        <Ionicons name="qr-code" size={64} color={colors.text} />
        <Text style={styles.payloadLabel}>This payment code is too large to draw as a QR symbol</Text>
        <Text selectable style={styles.payloadText}>{value}</Text>
      </View>
    );
  }

  return (
    <View testID="qr-payment-placeholder" style={[styles.box, styles.boxEmpty, { width: size, height: size }]}>
      <Ionicons name="qr-code" size={112} color={colors.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxEmpty: { backgroundColor: colors.surface },
  image: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.white,
  },
  payloadCard: {
    width: '100%',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  payloadLabel: { color: colors.text, fontSize: typography.caption, fontWeight: '800', textAlign: 'center' },
  payloadText: { color: colors.textMuted, fontSize: 10, textAlign: 'center' },
});

import React from 'react';
import { render } from '@testing-library/react-native';
import QRCode from 'react-native-qrcode-svg';
import {
  QrPaymentCode,
  QR_CODE_SIZE,
  QR_PAYLOAD_MAX_BYTES,
  classifyQrPayload,
  utf8ByteLength,
} from '@/src/components/QrPaymentCode';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

/** A QR Ph / EMVCo-style value the shop server hands back for local encoding. */
const emvcoPayload = '00020101021226680014ph.paymongo0015QRPH-TXN-100015204999953035605802PH5910PORSCA POS6009PASIG CITY6304ABCD';

describe('classifyQrPayload', () => {
  it('treats provider-rendered images as images and trims transport padding first', () => {
    expect(classifyQrPayload('data:image/png;base64,qr-fixture')).toBe('image');
    expect(classifyQrPayload('  data:image/png;base64,qr-fixture  ')).toBe('image');
    expect(classifyQrPayload('https://api.paymongo.com/qr/abc.png')).toBe('image');
    expect(classifyQrPayload('http://192.168.1.10:8000/qr/abc.png')).toBe('image');
  });

  it('treats a raw value as something the device must encode', () => {
    expect(classifyQrPayload(emvcoPayload)).toBe('value');
    expect(classifyQrPayload(`  ${emvcoPayload}  `)).toBe('value');
    expect(classifyQrPayload('QR')).toBe('value');
  });

  it('separates empty payloads and payloads too large to encode', () => {
    expect(classifyQrPayload(undefined)).toBe('empty');
    expect(classifyQrPayload(null)).toBe('empty');
    expect(classifyQrPayload('   ')).toBe('empty');
    expect(classifyQrPayload('a'.repeat(QR_PAYLOAD_MAX_BYTES))).toBe('value');
    expect(classifyQrPayload('a'.repeat(QR_PAYLOAD_MAX_BYTES + 1))).toBe('oversized');
  });
});

describe('utf8ByteLength', () => {
  it('counts UTF-8 bytes rather than code units', () => {
    expect(utf8ByteLength('QR-123')).toBe(6);
    expect(utf8ByteLength('₱')).toBe(3);
    expect(utf8ByteLength('😀')).toBe(4);
  });
});

describe('QrPaymentCode', () => {
  it('renders a provider image payload as an image', () => {
    const view = render(<QrPaymentCode payload="data:image/png;base64,qr-fixture" />);
    const image = view.getByTestId('qr-payment-image');

    expect(image.props.source).toEqual({ uri: 'data:image/png;base64,qr-fixture' });
    expect(image.props.accessibilityLabel).toBe('QR Ph payment code');
    expect(view.queryByTestId('qr-payment-code')).toBeNull();
  });

  it('encodes a raw payload into a QR symbol instead of printing the payload text', () => {
    const view = render(<QrPaymentCode payload={emvcoPayload} />);

    expect(view.getByTestId('qr-payment-code')).toBeTruthy();
    expect(view.queryByText(emvcoPayload)).toBeNull();
    expect(view.queryByTestId('qr-payment-image')).toBeNull();

    const symbol = view.UNSAFE_getByType(QRCode);
    expect(symbol.props.value).toBe(emvcoPayload);
    expect(symbol.props.ecl).toBe('M');
    expect(symbol.props.size).toBe(QR_CODE_SIZE);
    // ISO/IEC 18004 quiet zone: at least four modules on every QR version.
    expect(symbol.props.quietZone).toBeGreaterThanOrEqual((QR_CODE_SIZE * 4) / 21);
  });

  it('keeps only the payload itself when the server padded the value', () => {
    const view = render(<QrPaymentCode payload={`  ${emvcoPayload}\n`} />);

    expect(view.UNSAFE_getByType(QRCode).props.value).toBe(emvcoPayload);
  });

  it('renders a custom size without shrinking the quiet zone below four modules', () => {
    const view = render(<QrPaymentCode payload={emvcoPayload} size={320} />);
    const symbol = view.UNSAFE_getByType(QRCode);

    expect(symbol.props.size).toBe(320);
    expect(symbol.props.quietZone).toBeGreaterThanOrEqual((320 * 4) / 21);
  });

  it('falls back to the raw value when the payload cannot be encoded', () => {
    const oversized = 'a'.repeat(QR_PAYLOAD_MAX_BYTES + 1);
    const view = render(<QrPaymentCode payload={oversized} />);

    expect(view.getByTestId('qr-payment-payload')).toBeTruthy();
    expect(view.getByText(oversized)).toBeTruthy();
    expect(view.queryByTestId('qr-payment-code')).toBeNull();
    expect(view.queryByTestId('qr-payment-image')).toBeNull();
  });

  it('shows a placeholder when the server has not returned a payload yet', () => {
    const view = render(<QrPaymentCode payload={undefined} />);

    expect(view.getByTestId('qr-payment-placeholder')).toBeTruthy();
    expect(view.queryByTestId('qr-payment-code')).toBeNull();
    expect(view.queryByTestId('qr-payment-image')).toBeNull();
  });
});

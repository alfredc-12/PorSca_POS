import React from 'react';
import { colors, radius } from '@/src/theme/tokens';
import type { StockQuantityInputProps } from './StockQuantityInput';

export function StockQuantityInput({ value, onChangeText, onBlur, error, disabled, errorId }: StockQuantityInputProps) {
  return <input data-testid="product-stock-input" aria-label="Stock quantity" type="number" inputMode="numeric" min={0} max={4294967295} step={1} value={value} disabled={disabled} placeholder="0" aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onBlur={onBlur} onChange={(event) => onChangeText(event.currentTarget.value)} style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 52, border: `1px solid ${error ? colors.danger : colors.outline}`, borderRadius: radius.md, padding: '0 14px', color: colors.text, backgroundColor: colors.surface, font: 'inherit', fontSize: 16, fontVariantNumeric: 'tabular-nums', outlineColor: error ? colors.danger : colors.primary }} />;
}

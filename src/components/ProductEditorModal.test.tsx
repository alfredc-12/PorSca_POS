import React from 'react';
import { render } from '@testing-library/react-native';
import { KeyboardAvoidingView } from 'react-native';
import { ProductEditorModal } from '@/src/components/ProductEditorModal';

jest.mock('@/src/components/ProductEditor', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ProductEditor: ReactModule.forwardRef(() => <View testID="product-editor" />) };
});

describe('ProductEditorModal keyboard avoidance', () => {
  it('pads the modal dialog above the keyboard on every platform', () => {
    const { UNSAFE_getByType } = render(<ProductEditorModal onClose={jest.fn()} />);

    const avoiding = UNSAFE_getByType(KeyboardAvoidingView).props;
    expect(avoiding.behavior).toBe('padding');
    expect(avoiding.enabled ?? true).toBe(true);
  });
});

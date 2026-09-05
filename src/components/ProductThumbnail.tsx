import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Product } from '@/src/types';
import { colors, radius } from '@/src/theme/tokens';

type Props = {
  product: Product;
  size?: number;
};

export function ProductThumbnail({ product, size = 58 }: Props) {
  let icon: React.ComponentProps<typeof Ionicons>['name'] = 'cube-outline';
  let background = colors.primarySoft;

  if (product.category === 'Beverages') {
    icon = 'water-outline';
    background = colors.blueSoft;
  } else if (product.category === 'Noodles') {
    icon = 'restaurant-outline';
    background = colors.warningSoft;
  } else if (product.category === 'Milk') {
    icon = 'nutrition-outline';
    background = colors.surfaceGreen;
  } else if (product.category === 'Snacks') {
    icon = 'fast-food-outline';
    background = colors.creamSoft;
  } else if (product.category === 'Personal Care') {
    icon = 'sparkles-outline';
    background = colors.dangerSoft;
  } else if (product.category === 'Household') {
    icon = 'home-outline';
    background = colors.primarySoft;
  }

  return (
    <View style={[styles.root, { width: size, height: size, borderRadius: Math.min(radius.md, size / 3), backgroundColor: background }]}>
      <Ionicons name={icon} size={Math.round(size * 0.45)} color={colors.primary} />
      <Text numberOfLines={1} style={styles.initial}>{product.name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(7,131,81,0.08)',
  },
  initial: {
    position: 'absolute',
    right: 5,
    bottom: 2,
    color: 'rgba(17,25,54,0.24)',
    fontSize: 10,
    fontWeight: '900',
  },
});

import React from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

type Props = {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  scroll?: boolean;
  back?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({ title, subtitle, children, scroll = true, back = false, contentStyle }: Props) {
  const body = (
    <View style={[styles.content, contentStyle]}>
      <BrandHeader back={back} />
      {title ? (
        <View style={styles.localHeader}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <DecorativeBackground />
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {body}
        </ScrollView>
      ) : body}
    </SafeAreaView>
  );
}

function BrandHeader({ back }: { back: boolean }) {
  return (
    <View style={styles.brandRow}>
      {back ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={23} color={colors.text} />
        </Pressable>
      ) : null}
      <View style={styles.logo}>
        <Ionicons name="cart" size={25} color={colors.white} />
      </View>
      <View style={styles.brandCopy}>
        <Text numberOfLines={1} style={styles.brandName}>PorSca POS</Text>
        <Text numberOfLines={1} style={styles.tagline}>Good Products • Brighter Days</Text>
      </View>
      {!back ? (
        <View style={styles.headerActions}>
          <Pressable accessibilityRole="button" style={styles.storePill}>
            <Ionicons name="storefront-outline" size={18} color={colors.text} />
            <Text numberOfLines={1} style={styles.storeText}>Main Store</Text>
            <Ionicons name="chevron-down" size={15} color={colors.textMuted} />
          </Pressable>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>AC</Text>
            <View style={styles.onlineDot} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function DecorativeBackground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.leaf, styles.leafOne]} />
      <View style={[styles.leaf, styles.leafTwo]} />
      <View style={[styles.leaf, styles.leafThree]} />
      <View style={styles.softOrb} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xxl },
  content: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg },
  brandRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10 },
  backButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline },
  logo: { width: 50, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  brandCopy: { flex: 1, minWidth: 0 },
  brandName: { color: colors.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  tagline: { color: colors.textMuted, fontSize: 11.5, marginTop: 2, fontWeight: '500' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  storePill: { minHeight: 42, maxWidth: 126, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline, shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  storeText: { color: colors.text, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  avatar: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: '#758299', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 14, fontWeight: '800' },
  onlineDot: { position: 'absolute', right: -1, bottom: 2, width: 11, height: 11, borderRadius: 6, backgroundColor: colors.success, borderWidth: 2, borderColor: colors.background },
  localHeader: { gap: 4 },
  title: { color: colors.text, fontSize: typography.display, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { color: colors.textMuted, fontSize: typography.body, lineHeight: 22 },
  leaf: { position: 'absolute', backgroundColor: '#DDEBD8', opacity: 0.45, borderTopLeftRadius: 70, borderBottomRightRadius: 70 },
  leafOne: { width: 125, height: 56, right: -28, top: 34, transform: [{ rotate: '-28deg' }] },
  leafTwo: { width: 105, height: 44, right: 42, top: 91, transform: [{ rotate: '32deg' }], opacity: 0.28 },
  leafThree: { width: 120, height: 48, left: -54, bottom: 150, transform: [{ rotate: '38deg' }], opacity: 0.3 },
  softOrb: { position: 'absolute', width: 190, height: 190, borderRadius: 95, right: -92, top: 54, backgroundColor: '#E9F3E4', opacity: 0.48 },
});

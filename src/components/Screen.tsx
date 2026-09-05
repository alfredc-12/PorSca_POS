import React from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';
import { useResponsive } from '@/src/hooks/useResponsive';

type Props = {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  scroll?: boolean;
  back?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({ title, subtitle, children, scroll = true, back = false, contentStyle }: Props) {
  const responsive = useResponsive();

  const body = (
    <View
      style={[
        styles.content,
        {
          paddingHorizontal: responsive.horizontalPadding,
          paddingTop: responsive.short ? spacing.xs : spacing.sm,
          gap: responsive.sectionGap,
          maxWidth: responsive.wide ? 720 : undefined,
        },
        contentStyle,
      ]}
    >
      <BrandHeader back={back} />
      {title ? (
        <View style={styles.localHeader}>
          <Text style={[styles.title, { fontSize: responsive.font(typography.display) }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { fontSize: responsive.font(typography.body) }]}>{subtitle}</Text>
          ) : null}
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
          contentContainerStyle={[styles.scroll, { paddingBottom: responsive.short ? spacing.xl : spacing.xxl }]}
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
  const responsive = useResponsive();
  const logoSize = responsive.s(50);
  const actionSize = responsive.s(42);

  return (
    <View style={[styles.brandRow, { minHeight: responsive.s(66), gap: responsive.narrow ? 7 : 10 }]}>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={[
            styles.backButton,
            { width: actionSize, height: actionSize, borderRadius: responsive.s(14) },
          ]}
        >
          <Ionicons name="chevron-back" size={responsive.s(23)} color={colors.text} />
        </Pressable>
      ) : null}

      <View
        style={[
          styles.logo,
          { width: logoSize, height: logoSize, borderRadius: responsive.s(15) },
        ]}
      >
        <Ionicons name="cart" size={responsive.s(25)} color={colors.white} />
      </View>

      <View style={styles.brandCopy}>
        <Text numberOfLines={1} style={[styles.brandName, { fontSize: responsive.font(responsive.narrow ? 19 : 22) }]}>
          PorSca POS
        </Text>
        {!responsive.veryNarrow ? (
          <Text numberOfLines={1} style={[styles.tagline, { fontSize: responsive.font(responsive.narrow ? 10.5 : 11.5) }]}>
            Good Products • Brighter Days
          </Text>
        ) : null}
      </View>

      {!back ? (
        <View style={[styles.headerActions, { gap: responsive.narrow ? 5 : 8 }]}>
          <Pressable
            accessibilityRole="button"
            style={[
              styles.storePill,
              {
                minHeight: actionSize,
                maxWidth: responsive.widthValue(responsive.narrow ? 0.27 : 0.31, 88, 132),
                paddingHorizontal: responsive.narrow ? 8 : 11,
                borderRadius: responsive.s(15),
              },
            ]}
          >
            <Ionicons name="storefront-outline" size={responsive.s(responsive.narrow ? 16 : 18)} color={colors.text} />
            <Text numberOfLines={1} style={[styles.storeText, { fontSize: responsive.font(responsive.narrow ? 11.5 : 13) }]}>
              Main Store
            </Text>
            {!responsive.veryNarrow ? <Ionicons name="chevron-down" size={responsive.s(15)} color={colors.textMuted} /> : null}
          </Pressable>

          <View style={[styles.avatar, { width: actionSize, height: actionSize }]}>
            <Text style={[styles.avatarText, { fontSize: responsive.font(responsive.narrow ? 12 : 14) }]}>AC</Text>
            <View style={styles.onlineDot} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function DecorativeBackground() {
  const responsive = useResponsive();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.leaf, styles.leafOne, { transform: [{ rotate: '-28deg' }, { scale: responsive.scale }] }]} />
      <View style={[styles.leaf, styles.leafTwo, { transform: [{ rotate: '32deg' }, { scale: responsive.scale }] }]} />
      <View style={[styles.leaf, styles.leafThree, { transform: [{ rotate: '38deg' }, { scale: responsive.scale }] }]} />
      <View style={[styles.softOrb, { transform: [{ scale: responsive.scale }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1 },
  content: { flex: 1, width: '100%', alignSelf: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  backButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline },
  logo: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  brandCopy: { flex: 1, minWidth: 0 },
  brandName: { color: colors.text, fontWeight: '900', letterSpacing: -0.5 },
  tagline: { color: colors.textMuted, marginTop: 2, fontWeight: '500' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  storePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline, shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  storeText: { color: colors.text, fontWeight: '700', flexShrink: 1 },
  avatar: { borderRadius: radius.pill, backgroundColor: '#758299', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontWeight: '800' },
  onlineDot: { position: 'absolute', right: -1, bottom: 2, width: 11, height: 11, borderRadius: 6, backgroundColor: colors.success, borderWidth: 2, borderColor: colors.background },
  localHeader: { gap: 4 },
  title: { color: colors.text, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { color: colors.textMuted, lineHeight: 22 },
  leaf: { position: 'absolute', backgroundColor: '#DDEBD8', opacity: 0.45, borderTopLeftRadius: 70, borderBottomRightRadius: 70 },
  leafOne: { width: 125, height: 56, right: -28, top: 34 },
  leafTwo: { width: 105, height: 44, right: 42, top: 91, opacity: 0.28 },
  leafThree: { width: 120, height: 48, left: -54, bottom: 150, opacity: 0.3 },
  softOrb: { position: 'absolute', width: 190, height: 190, borderRadius: 95, right: -92, top: 54, backgroundColor: '#E9F3E4', opacity: 0.48 },
});

import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '@/src/theme/tokens';
import { useResponsive } from '@/src/hooks/useResponsive';

function TabButton({ children, accessibilityState, style, ...props }: any) {
  const selected = accessibilityState?.selected;
  return (
    <Pressable
      {...props}
      accessibilityState={accessibilityState}
      style={[style, styles.tabButton, selected && styles.tabButtonActive]}
    >
      {children}
    </Pressable>
  );
}

export default function TabsLayout() {
  const responsive = useResponsive();
  const iconSize = responsive.s(responsive.short ? 21 : 23);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarButton: (props) => <TabButton {...props} />,
        tabBarStyle: [
          styles.tabBar,
          {
            height: responsive.tabBarHeight,
            paddingHorizontal: responsive.horizontalPadding,
            paddingTop: responsive.short ? 5 : 8,
            paddingBottom: responsive.short ? 5 : 8,
          },
        ],
        tabBarItemStyle: [styles.tabItem, { marginHorizontal: responsive.narrow ? 2 : 5 }],
        tabBarLabelStyle: [styles.tabLabel, { fontSize: responsive.font(responsive.narrow ? 10.5 : 12) }],
      }}
    >
      <Tabs.Screen
        name="pos"
        options={{
          title: 'POS',
          tabBarIcon: ({ color }) => <Ionicons name="cart-outline" color={color} size={iconSize} />,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          tabBarIcon: ({ color }) => <Ionicons name="cube-outline" color={color} size={iconSize} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: ({ color }) => <Ionicons name="receipt-outline" color={color} size={iconSize} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 0,
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -5 },
    elevation: 12,
  },
  tabItem: {},
  tabButton: {
    flex: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
  },
  tabButtonActive: { backgroundColor: colors.primarySoft },
  tabLabel: { fontWeight: '700', marginTop: 2 },
});

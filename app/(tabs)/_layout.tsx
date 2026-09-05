import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '@/src/theme/tokens';

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
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarButton: (props) => <TabButton {...props} />,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="pos"
        options={{
          title: 'POS',
          tabBarIcon: ({ color, size }) => <Ionicons name="cart-outline" color={color} size={size + 2} />,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" color={color} size={size + 2} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" color={color} size={size + 2} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 0,
    height: 82,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 8,
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -5 },
    elevation: 12,
  },
  tabItem: { marginHorizontal: 5 },
  tabButton: {
    flex: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
  },
  tabButtonActive: { backgroundColor: colors.primarySoft },
  tabLabel: { fontSize: 12, fontWeight: '700', marginTop: 2 },
});

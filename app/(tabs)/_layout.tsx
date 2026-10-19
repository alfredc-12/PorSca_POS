import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '@/src/theme/tokens';
import { useResponsive } from '@/src/hooks/useResponsive';
import { useAuth } from '@/src/context/AuthContext';
import { SessionLoading } from '@/src/components/SessionLoading';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TabsLayout() {
  const responsive = useResponsive();
  const iconSize = responsive.s(responsive.short ? 21 : 23);
  const { status, user, isAdmin, signOut } = useAuth();
  if (status === 'loading') return <SessionLoading />;
  if (status !== 'signed-in') return <Redirect href="/login" />;

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.accountRow}>
        <Text numberOfLines={1} style={styles.accountName}>{user.name} • {user.role === 'admin' ? 'Admin' : 'Cashier'}</Text>
        {isAdmin ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Manage users" onPress={() => router.push('/users')} style={styles.usersButton}>
            <Ionicons name="people-outline" size={18} color={colors.primary} />
            <Text style={styles.usersButtonText}>Users</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={() => void signOut()} style={styles.signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </SafeAreaView>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarActiveBackgroundColor: colors.primarySoft,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, backgroundColor: colors.surface },
  accountName: { flex: 1, color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  usersButton: { minHeight: 48, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  usersButtonText: { color: colors.primary, fontWeight: '800' },
  signOut: { minHeight: 48, minWidth: 64, justifyContent: 'center', alignItems: 'center' },
  signOutText: { color: colors.primary, fontWeight: '800' },
  tabBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 0,
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -5 },
    elevation: 12,
  },
  tabItem: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  tabLabel: { fontWeight: '700', marginTop: 2 },
});

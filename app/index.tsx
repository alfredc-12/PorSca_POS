import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { SessionLoading } from '@/src/components/SessionLoading';

export default function Index() {
  const { status } = useAuth();
  if (status === 'loading') return <SessionLoading />;
  return <Redirect href={status === 'signed-in' ? '/(tabs)/pos' : '/login'} />;
}

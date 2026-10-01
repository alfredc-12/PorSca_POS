import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { AppButton } from '@/src/components/AppButton';
import { SessionLoading } from '@/src/components/SessionLoading';
import { useAuth } from '@/src/context/AuthContext';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

export default function LoginScreen() {
  const { status, signIn, sessionError, retrySession, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(false);

  const submit = async () => {
    if (pending.current) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password) {
      setError('Enter a valid email address and your password.');
      return;
    }
    pending.current = true;
    setSubmitting(true);
    setError(undefined);
    try {
      await signIn(email, password);
      setPassword('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to sign in. Please try again.');
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  };

  if (status === 'loading') return <SessionLoading />;
  if (status === 'signed-in') return <Redirect href="/(tabs)/pos" />;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen title="Sign in" subtitle="Use your shop account to open PorSca POS.">
        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            testID="login-email-input"
            accessibilityLabel="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="username"
            placeholder="you@shop.com"
            placeholderTextColor={colors.textMuted}
            editable={!submitting}
            style={styles.input}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            testID="login-password-input"
            accessibilityLabel="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
            editable={!submitting}
            style={styles.input}
          />
          {error || sessionError ? <Text accessibilityRole="alert" style={styles.error}>{error ?? sessionError}</Text> : null}
          <AppButton testID="login-submit" label={submitting ? 'Signing in…' : 'Sign in'} onPress={() => void submit()} disabled={submitting} />
          {sessionError ? (
            <>
              <AppButton label="Retry saved session" variant="secondary" onPress={() => void retrySession()} disabled={submitting} />
              <AppButton label="Forget saved session" variant="secondary" onPress={() => void signOut()} disabled={submitting} />
            </>
          ) : null}
        </View>
        <Text style={styles.hint}>Need an account or a password reset? Ask your shop administrator. Staff accounts are managed through the API, not on this phone.</Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline },
  label: { color: colors.text, fontSize: typography.label, fontWeight: '800' },
  input: { minHeight: 56, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.outline, borderRadius: radius.md, backgroundColor: colors.background, color: colors.text, fontSize: typography.body },
  error: { color: colors.danger, lineHeight: 22 },
  hint: { color: colors.textMuted, fontSize: typography.caption, lineHeight: 20 },
});

import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '@/src/components/AppButton';
import { SessionLoading } from '@/src/components/SessionLoading';
import { ApiClientError } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALIDATION_SUMMARY = 'Enter a valid email address and your password.';
const WRONG_CREDENTIALS = 'The provided credentials are incorrect. Check your email and password, then try again.';

export default function LoginScreen() {
  const { status, signIn, sessionError, retrySession, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(false);

  const editEmail = (value: string) => {
    setEmail(value);
    if (emailError) setEmailError(undefined);
    if (formError) setFormError(undefined);
  };

  const editPassword = (value: string) => {
    setPassword(value);
    if (passwordError) setPasswordError(undefined);
    if (formError) setFormError(undefined);
  };

  const submit = async () => {
    if (pending.current) return;
    const nextEmailError = EMAIL_PATTERN.test(email.trim()) ? undefined : 'Enter a valid email address.';
    const nextPasswordError = password ? undefined : 'Enter your password.';
    if (nextEmailError || nextPasswordError) {
      setEmailError(nextEmailError);
      setPasswordError(nextPasswordError);
      setFormError(VALIDATION_SUMMARY);
      return;
    }
    pending.current = true;
    setSubmitting(true);
    setEmailError(undefined);
    setPasswordError(undefined);
    setFormError(undefined);
    try {
      await signIn(email, password);
      setPassword('');
    } catch (failure) {
      // A 401 means the email/password pair was rejected. Report one generic
      // message instead of naming which field was wrong. Transport failures
      // keep the API wording so the cashier knows it is a connection problem.
      const apiError = failure instanceof ApiClientError ? failure : undefined;
      setFormError(apiError?.status === 401
        ? WRONG_CREDENTIALS
        : failure instanceof Error ? failure.message : 'Unable to sign in. Please try again.');
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  };

  if (status === 'loading') return <SessionLoading />;
  if (status === 'signed-in') return <Redirect href="/(tabs)/pos" />;

  const alert = formError ?? sessionError;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <DecorativeBackground />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View testID="login-center" style={styles.center}>
            <View style={styles.brand}>
              <View style={styles.logo}>
                <Ionicons name="cart" size={30} color={colors.white} />
              </View>
              <Text style={styles.brandName}>PorSca POS</Text>
              <Text style={styles.tagline}>Good Products • Brighter Days</Text>
              <Text style={styles.title}>Sign in</Text>
              <Text style={styles.subtitle}>Use your shop account to open PorSca POS.</Text>
            </View>

            <View testID="login-form-card" style={styles.card}>
              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  testID="login-email-input"
                  accessibilityLabel="Email"
                  value={email}
                  onChangeText={editEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="username"
                  placeholder="you@shop.com"
                  placeholderTextColor={colors.textMuted}
                  editable={!submitting}
                  returnKeyType="next"
                  style={[styles.input, emailError && styles.inputError]}
                />
                {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Password</Text>
                <View style={[styles.passwordRow, passwordError && styles.inputError]}>
                  <TextInput
                    testID="login-password-input"
                    accessibilityLabel="Password"
                    value={password}
                    onChangeText={editPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="current-password"
                    textContentType="password"
                    returnKeyType="go"
                    onSubmitEditing={() => void submit()}
                    editable={!submitting}
                    style={styles.passwordInput}
                  />
                  <Pressable
                    testID="login-password-toggle"
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    onPress={() => setShowPassword((current) => !current)}
                    disabled={submitting}
                    style={({ pressed }) => [styles.toggle, pressed && !submitting && { opacity: 0.6 }]}
                  >
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.primary} />
                    <Text style={styles.toggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
                  </Pressable>
                </View>
                {passwordError ? <Text style={styles.fieldError}>{passwordError}</Text> : null}
              </View>

              {alert ? <Text accessibilityRole="alert" style={styles.error}>{alert}</Text> : null}

              <AppButton testID="login-submit" label={submitting ? 'Signing in…' : 'Sign in'} onPress={() => void submit()} disabled={submitting} />
              {sessionError ? (
                <>
                  <AppButton label="Retry saved session" variant="secondary" onPress={() => void retrySession()} disabled={submitting} />
                  <AppButton label="Forget saved session" variant="secondary" onPress={() => void signOut()} disabled={submitting} />
                </>
              ) : null}
            </View>

            <Text style={styles.hint}>Need an account or a password reset? Ask your shop administrator. Staff accounts are managed through the API, not on this phone.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xxl },
  center: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: spacing.lg },
  brand: { alignItems: 'center', gap: 4 },
  logo: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  brandName: { color: colors.text, fontSize: typography.heading, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center' },
  tagline: { color: colors.textMuted, fontSize: typography.caption, fontWeight: '500', textAlign: 'center' },
  title: { color: colors.text, fontSize: typography.display, fontWeight: '900', letterSpacing: -0.8, textAlign: 'center', marginTop: spacing.md },
  subtitle: { color: colors.textMuted, fontSize: typography.body, lineHeight: 22, textAlign: 'center' },
  card: { gap: spacing.md, padding: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline },
  field: { gap: spacing.sm },
  label: { color: colors.text, fontSize: typography.label, fontWeight: '800' },
  input: { minHeight: 56, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.outline, borderRadius: radius.md, backgroundColor: colors.background, color: colors.text, fontSize: typography.body },
  inputError: { borderColor: colors.danger },
  fieldError: { color: colors.danger, fontSize: typography.caption, lineHeight: 17 },
  passwordRow: { minHeight: 56, borderWidth: 1, borderColor: colors.outline, borderRadius: radius.md, backgroundColor: colors.background, flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, minWidth: 0, minHeight: 56, paddingHorizontal: spacing.md, color: colors.text, fontSize: typography.body },
  toggle: { minHeight: 56, minWidth: 64, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  toggleText: { color: colors.primary, fontSize: typography.label, fontWeight: '800' },
  error: { color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md, fontSize: typography.label, lineHeight: 20, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: typography.caption, lineHeight: 20, textAlign: 'center', paddingHorizontal: spacing.sm },
  leaf: { position: 'absolute', backgroundColor: '#DDEBD8', opacity: 0.45, borderTopLeftRadius: 70, borderBottomRightRadius: 70 },
  leafOne: { width: 125, height: 56, right: -28, top: 34, transform: [{ rotate: '-28deg' }] },
  leafTwo: { width: 105, height: 44, right: 42, top: 91, opacity: 0.28, transform: [{ rotate: '32deg' }] },
  leafThree: { width: 120, height: 48, left: -54, bottom: 150, opacity: 0.3, transform: [{ rotate: '38deg' }] },
  softOrb: { position: 'absolute', width: 190, height: 190, borderRadius: 95, right: -92, top: 54, backgroundColor: '#E9F3E4', opacity: 0.48 },
});

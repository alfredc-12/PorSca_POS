import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { apiClient, ApiClientError, CashierInput, ManagedUser } from '@/src/api/client';
import { AppButton } from '@/src/components/AppButton';
import { DataState } from '@/src/components/DataState';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

type CashierField = keyof CashierInput;
type CashierFieldErrors = Partial<Record<CashierField, string>>;
type CashierDraft = CashierInput;

export function validateCashierDraft(draft: CashierDraft): CashierFieldErrors {
  const errors: CashierFieldErrors = {};
  const name = draft.name.trim();
  const email = draft.email.trim();
  if (!name) errors.name = 'Enter the cashier’s name.';
  else if (name.length > 255) errors.name = 'Name must be 255 characters or fewer.';
  if (!email) errors.email = 'Enter an email address.';
  else if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
  if (draft.password.length < 8) errors.password = 'Password must be at least 8 characters.';
  else if (draft.password.length > 255) errors.password = 'Password must be 255 characters or fewer.';
  return errors;
}

export default function UsersScreen() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<CashierFieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [confirmingUserId, setConfirmingUserId] = useState<string>();
  const [busyUserId, setBusyUserId] = useState<string>();
  const [actionError, setActionError] = useState<string>();

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setLoadError(undefined);
    try {
      setUsers(await apiClient.listUsers());
    } catch (error) {
      setLoadError(errorMessage(error, 'Unable to load users. Check the connection and try again.'));
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const scheduledLoad = setTimeout(() => { void loadUsers(); }, 0);
    return () => clearTimeout(scheduledLoad);
  }, [isAdmin, loadUsers]);

  const updateDraft = (field: CashierField, value: string) => {
    const clearFieldError = (current: CashierFieldErrors) => current[field] ? { ...current, [field]: undefined } : current;
    setFieldErrors(clearFieldError);
    setFormError(undefined);
    if (field === 'name') setName(value);
    if (field === 'email') setEmail(value);
    if (field === 'password') setPassword(value);
  };

  const createCashier = async () => {
    if (!isAdmin || saving) return;
    const draft = { name, email, password };
    const errors = validateCashierDraft(draft);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError('Check the highlighted fields and try again.');
      return;
    }

    setSaving(true);
    setFieldErrors({});
    setFormError(undefined);
    try {
      const created = await apiClient.createCashier({ name: name.trim(), email: email.trim(), password });
      setUsers((current) => [...current, created]);
      setName('');
      setEmail('');
      setPassword('');
    } catch (error) {
      setFieldErrors(extractCashierFieldErrors(error));
      setFormError(errorMessage(error, 'Unable to create the cashier. Review the details and try again.'));
    } finally {
      setSaving(false);
    }
  };

  const deactivateUser = async (user: ManagedUser) => {
    if (!isAdmin || user.role !== 'cashier' || busyUserId) return;
    setBusyUserId(user.id);
    setActionError(undefined);
    try {
      await apiClient.deactivateUser(user.id);
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, is_active: false } : item));
      setConfirmingUserId(undefined);
    } catch (error) {
      setActionError(errorMessage(error, `Unable to deactivate ${user.name}. Try again.`));
    } finally {
      setBusyUserId(undefined);
    }
  };

  const reactivateUser = async (user: ManagedUser) => {
    if (!isAdmin || user.role !== 'cashier' || busyUserId) return;
    setBusyUserId(user.id);
    setActionError(undefined);
    try {
      const updated = await apiClient.updateUser(user.id, { is_active: true });
      setUsers((current) => current.map((item) => item.id === user.id ? updated : item));
    } catch (error) {
      setActionError(errorMessage(error, `Unable to reactivate ${user.name}. Try again.`));
    } finally {
      setBusyUserId(undefined);
    }
  };

  if (!isAdmin) return <Redirect href="/(tabs)/pos" />;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen title="Users" subtitle="Create and manage cashier accounts for your store." back>
        <View style={styles.introCard}>
          <View style={styles.introIcon}><Ionicons name="people-outline" size={26} color={colors.primary} /></View>
          <View style={styles.introCopy}>
            <Text style={styles.introTitle}>Cashier accounts</Text>
            <Text style={styles.introBody}>Cashiers receive the fixed cashier role. Permissions cannot be customized here.</Text>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Create a cashier</Text>
          <Text style={styles.sectionHint}>Name, email, and a password of at least 8 characters are required.</Text>
        </View>
        {formError ? (
          <View testID="users-create-error" style={styles.errorCard} accessibilityLiveRegion="polite">
            <Ionicons name="alert-circle-outline" size={21} color={colors.danger} />
            <View style={styles.errorCopy}>
              <Text style={styles.errorTitle}>Unable to create cashier</Text>
              <Text style={styles.errorMessage}>{formError}</Text>
            </View>
          </View>
        ) : null}
        <View style={styles.formCard}>
          <Field
            label="Name"
            icon="person-outline"
            value={name}
            onChangeText={(value) => updateDraft('name', value)}
            placeholder="Cashier name"
            autoCapitalize="words"
            error={fieldErrors.name}
            testID="cashier-name-input"
            editable={!saving}
          />
          <Field
            label="Email"
            icon="mail-outline"
            value={email}
            onChangeText={(value) => updateDraft('email', value)}
            placeholder="cashier@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            error={fieldErrors.email}
            testID="cashier-email-input"
            editable={!saving}
          />
          <Field
            label="Password"
            icon="lock-closed-outline"
            value={password}
            onChangeText={(value) => updateDraft('password', value)}
            placeholder="At least 8 characters"
            secureTextEntry
            autoCapitalize="none"
            error={fieldErrors.password}
            testID="cashier-password-input"
            editable={!saving}
          />
          <AppButton
            testID="create-cashier-button"
            label={saving ? 'Creating…' : 'Create Cashier'}
            onPress={() => void createCashier()}
            disabled={saving}
          />
        </View>

        <View style={styles.listHeading}>
          <View style={styles.listHeadingCopy}>
            <Text style={styles.sectionTitle}>Accounts</Text>
            <Text style={styles.sectionHint}>Active state is enforced by the API for every session.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh users"
            disabled={loading}
            onPress={() => void loadUsers()}
            style={styles.refreshButton}
          >
            <Ionicons name="refresh-outline" size={19} color={colors.primary} />
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
        </View>

        {actionError ? <Text testID="users-action-error" style={styles.actionError} accessibilityLiveRegion="polite">{actionError}</Text> : null}
        {loading ? <DataState kind="loading" title="Loading accounts" message="Fetching the latest user accounts from the API." /> : null}
        {!loading && loadError ? (
          <DataState kind="unavailable" title="Could not load accounts" message={loadError} actionLabel="Retry users" onAction={() => void loadUsers()} />
        ) : null}
        {!loading && !loadError && users.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={28} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No user accounts found</Text>
            <Text style={styles.emptyBody}>Create the first cashier account with the form above.</Text>
          </View>
        ) : null}
        {!loading && !loadError && users.map((user) => (
          <UserCard
            key={user.id}
            user={user}
            confirming={confirmingUserId === user.id}
            busy={busyUserId === user.id}
            onRequestDeactivate={() => { setActionError(undefined); setConfirmingUserId(user.id); }}
            onCancelDeactivate={() => setConfirmingUserId(undefined)}
            onConfirmDeactivate={() => void deactivateUser(user)}
            onReactivate={() => void reactivateUser(user)}
          />
        ))}
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Field({ label, icon, error, testID, ...props }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; error?: string; testID: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabel}>
        <Ionicons name={icon} size={17} color={error ? colors.danger : colors.primary} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <TextInput
        {...props}
        testID={testID}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, error && styles.inputError]}
      />
      {error ? <Text testID={`cashier-${label.toLowerCase()}-error`} style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function UserCard({ user, confirming, busy, onRequestDeactivate, onCancelDeactivate, onConfirmDeactivate, onReactivate }: {
  user: ManagedUser;
  confirming: boolean;
  busy: boolean;
  onRequestDeactivate: () => void;
  onCancelDeactivate: () => void;
  onConfirmDeactivate: () => void;
  onReactivate: () => void;
}) {
  const isCashier = user.role === 'cashier';
  const statusStyle = user.is_active ? styles.activeStatus : styles.inactiveStatus;
  return (
    <View testID={`user-row-${user.id}`} style={styles.userCard}>
      <View style={styles.userDetails}>
        <View style={styles.userHeading}>
          <Text style={styles.userName}>{user.name}</Text>
          <View style={[styles.statusBadge, statusStyle]}>
            <Text style={[styles.statusText, user.is_active ? styles.activeText : styles.inactiveText]}>{user.is_active ? 'Active' : 'Inactive'}</Text>
          </View>
        </View>
        <Text selectable style={styles.userEmail}>{user.email}</Text>
        <Text style={styles.userRole}>{isCashier ? 'Cashier' : 'Admin'}</Text>
      </View>

      {isCashier && confirming ? (
        <View style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>Deactivate {user.name}?</Text>
          <Text style={styles.confirmMessage}>They will be unable to sign in, and the API will revoke their active sessions.</Text>
          <View style={styles.confirmActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Cancel deactivation for ${user.name}`}
              disabled={busy}
              onPress={onCancelDeactivate}
              style={[styles.actionButton, styles.cancelButton]}
            >
              <Text style={styles.cancelText}>Keep active</Text>
            </Pressable>
            <Pressable
              testID={`confirm-deactivate-user-${user.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Confirm deactivation for ${user.name}`}
              disabled={busy}
              onPress={onConfirmDeactivate}
              style={[styles.actionButton, styles.deactivateButton, busy && styles.disabledButton]}
            >
              <Text style={styles.deactivateText}>{busy ? 'Deactivating…' : 'Confirm deactivation'}</Text>
            </Pressable>
          </View>
        </View>
      ) : isCashier && user.is_active ? (
        <Pressable
          testID={`deactivate-user-${user.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Deactivate ${user.name}`}
          disabled={busy}
          onPress={onRequestDeactivate}
          style={[styles.actionButton, styles.deactivateButton, busy && styles.disabledButton]}
        >
          <Text style={styles.deactivateText}>Deactivate</Text>
        </Pressable>
      ) : isCashier ? (
        <Pressable
          testID={`reactivate-user-${user.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Reactivate ${user.name}`}
          disabled={busy}
          onPress={onReactivate}
          style={[styles.actionButton, styles.reactivateButton, busy && styles.disabledButton]}
        >
          <Text style={styles.reactivateText}>{busy ? 'Reactivating…' : 'Reactivate'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function extractCashierFieldErrors(error: unknown): CashierFieldErrors {
  if (!(error instanceof ApiClientError) || !error.details || typeof error.details !== 'object' || Array.isArray(error.details)) return {};
  const details = error.details as Record<string, unknown>;
  const fields = details.errors && typeof details.errors === 'object' && !Array.isArray(details.errors)
    ? details.errors as Record<string, unknown>
    : details;
  const errors: CashierFieldErrors = {};
  (['name', 'email', 'password'] as const).forEach((field) => {
    const message = fields[field];
    if (Array.isArray(message) && typeof message[0] === 'string') errors[field] = message[0];
    else if (typeof message === 'string') errors[field] = message;
  });
  return errors;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  introCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: '#D8EADA', backgroundColor: colors.primaryWash },
  introIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  introCopy: { flex: 1, minWidth: 0, gap: 3 },
  introTitle: { color: colors.text, fontSize: typography.label, fontWeight: '900' },
  introBody: { color: colors.textMuted, fontSize: typography.caption, lineHeight: 18 },
  sectionHeading: { gap: 4 },
  sectionTitle: { color: colors.text, fontSize: typography.title, fontWeight: '900' },
  sectionHint: { color: colors.textMuted, fontSize: typography.caption, lineHeight: 18 },
  formCard: { gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 13, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  field: { gap: spacing.xs },
  fieldLabel: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  label: { color: colors.text, fontSize: typography.label, fontWeight: '800' },
  input: { minHeight: 54, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.background, paddingHorizontal: spacing.md, color: colors.text, fontSize: typography.body },
  inputError: { borderColor: colors.danger },
  fieldError: { color: colors.danger, fontSize: typography.caption, lineHeight: 17 },
  errorCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  errorCopy: { flex: 1, gap: 3 },
  errorTitle: { color: colors.text, fontSize: typography.caption, fontWeight: '900' },
  errorMessage: { color: colors.text, fontSize: typography.caption, lineHeight: 18 },
  listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  listHeadingCopy: { flex: 1, gap: 3 },
  refreshButton: { minHeight: 44, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 4 },
  refreshText: { color: colors.primary, fontSize: typography.caption, fontWeight: '800' },
  actionError: { color: colors.danger, fontSize: typography.caption, lineHeight: 18 },
  emptyCard: { minHeight: 124, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface },
  emptyTitle: { color: colors.text, fontSize: typography.label, fontWeight: '900' },
  emptyBody: { color: colors.textMuted, fontSize: typography.caption, textAlign: 'center' },
  userCard: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface },
  userDetails: { gap: 5 },
  userHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  userName: { flex: 1, color: colors.text, fontSize: typography.label, fontWeight: '900' },
  userEmail: { color: colors.textMuted, fontSize: typography.caption },
  userRole: { color: colors.textMuted, fontSize: typography.caption, fontWeight: '700' },
  statusBadge: { minHeight: 28, paddingHorizontal: 10, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  activeStatus: { backgroundColor: colors.primarySoft },
  inactiveStatus: { backgroundColor: colors.dangerSoft },
  statusText: { fontSize: 11, fontWeight: '900' },
  activeText: { color: colors.primary },
  inactiveText: { color: colors.danger },
  actionButton: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  deactivateButton: { alignSelf: 'flex-start', backgroundColor: colors.dangerSoft },
  deactivateText: { color: colors.danger, fontSize: typography.caption, fontWeight: '900' },
  reactivateButton: { alignSelf: 'flex-start', backgroundColor: colors.primarySoft },
  reactivateText: { color: colors.primary, fontSize: typography.caption, fontWeight: '900' },
  disabledButton: { opacity: 0.45 },
  confirmCard: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.warning, backgroundColor: colors.warningSoft },
  confirmTitle: { color: colors.text, fontSize: typography.caption, fontWeight: '900' },
  confirmMessage: { color: colors.text, fontSize: typography.caption, lineHeight: 18 },
  confirmActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cancelButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline },
  cancelText: { color: colors.text, fontSize: typography.caption, fontWeight: '800' },
});

import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DataState } from '@/src/components/DataState';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/context/AuthContext';
import { diagnostics, FailureRecord, MAX_RECORDS, PERSISTED_RECORDS } from '@/src/observability/diagnostics';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

/**
 * Admin-only window onto the on-device failure records (plan §6.3). Staff read
 * the support code off the cashier's message, look it up here, and can quote
 * the server's own words to the API team without those words ever reaching a
 * cashier's screen.
 */
export default function DiagnosticsScreen() {
  const { isAdmin } = useAuth();
  const [records, setRecords] = useState<FailureRecord[]>(() => diagnostics.list());
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    void diagnostics.hydrate().then(() => {
      if (active) setRecords(diagnostics.list());
    });
    return () => { active = false; };
  }, [isAdmin]);

  if (!isAdmin) return <Redirect href="/(tabs)/pos" />;

  const trimmed = query.trim().toUpperCase();
  const matches = trimmed ? records.filter((record) => record.reference.toUpperCase().includes(trimmed)) : records;
  const selected = trimmed ? matches[0] : undefined;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen title="Diagnostics" subtitle="Look up a support code a cashier read from a message." back>
        <View style={styles.card}>
          <Text style={styles.label}>Support code</Text>
          <TextInput
            testID="diagnostics-code-input"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="PRS-XXXXXX"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Support code"
            style={styles.input}
          />
          <Text style={styles.hint}>The newest {PERSISTED_RECORDS} codes survive an app restart; the phone keeps the newest {MAX_RECORDS}.</Text>
        </View>

        {selected ? (
          <View testID="diagnostics-detail" style={styles.card}>
            <Text style={styles.detailTitle}>{selected.reference}</Text>
            <Detail label="When" value={selected.at} />
            <Detail label="Screen" value={selected.screen} />
            {selected.status === undefined ? null : <Detail label="Status" value={String(selected.status)} />}
            {selected.code === undefined ? null : <Detail label="Code" value={selected.code} />}
            {selected.message === undefined ? null : <Detail label="Server message" value={selected.message} />}
            {selected.details === undefined ? null : <Detail label="Details" value={JSON.stringify(selected.details, null, 2)} />}
          </View>
        ) : null}

        {!selected && trimmed ? (
          <DataState
            kind="no-results"
            title="No record for that code"
            message="Check the code with the cashier, or read the failure directly from the server log."
          />
        ) : null}

        {records.length === 0 ? (
          <DataState kind="no-results" title="No failures recorded yet" message="Failures appear here after a screen reports one." />
        ) : null}

        {records.length > 0 ? (
          <View style={styles.list}>
            <Text style={styles.sectionTitle}>Recent failures</Text>
            {matches.map((record) => (
              <Pressable
                key={record.reference}
                testID={`diagnostics-row-${record.reference}`}
                accessibilityRole="button"
                accessibilityLabel={`Open ${record.reference}`}
                onPress={() => setQuery(record.reference)}
                style={styles.row}
              >
                <Ionicons name="alert-circle-outline" size={20} color={colors.warning} />
                <View style={styles.rowCopy}>
                  <Text style={styles.rowCode}>{record.reference}</Text>
                  <Text style={styles.rowMeta}>{record.at} • {record.screen}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface },
  label: { color: colors.text, fontSize: typography.label, fontWeight: '800' },
  input: { minHeight: 56, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.outline, borderRadius: radius.md, backgroundColor: colors.background, color: colors.text, fontSize: typography.body, letterSpacing: 1 },
  hint: { color: colors.textMuted, fontSize: typography.caption, lineHeight: 18 },
  sectionTitle: { color: colors.text, fontSize: typography.title, fontWeight: '900' },
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowCode: { color: colors.text, fontSize: typography.label, fontWeight: '900', letterSpacing: 0.5 },
  rowMeta: { color: colors.textMuted, fontSize: typography.caption },
  detailTitle: { color: colors.text, fontSize: typography.title, fontWeight: '900', letterSpacing: 0.5 },
  detail: { gap: 2 },
  detailLabel: { color: colors.textMuted, fontSize: typography.caption, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { color: colors.text, fontSize: typography.caption, lineHeight: 18 },
});

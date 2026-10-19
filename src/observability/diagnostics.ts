/**
 * On-device failure records, keyed by the support code shown to the cashier.
 *
 * Newest 25 stay in memory for the admin Diagnostics screen; the newest 5 are
 * persisted across restarts so a code quoted after the app was closed can
 * still be looked up (captain's Q4-R1 answer). No new dependency: the records
 * reuse expo-secure-store, the same native store that holds the session token.
 * Nothing is transmitted, and redaction happens in one place before a record
 * is stored.
 *
 * Plan: data/porsca-mobile-feedback-plain-20261004/report.md, §6.2.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { DescribedFailure, describeFailure, Failure, FailureScreen } from '@/src/domain/userFacingError';

export type FailureRecord = {
  reference: string;
  at: string;
  screen: string;
  status?: number;
  code?: string;
  message?: string;
  details?: unknown;
};

/** Newest-first cap for the in-memory list the Diagnostics screen reads. */
export const MAX_RECORDS = 25;
/** How many records survive an app restart. */
export const PERSISTED_RECORDS = 5;
export const RECORDS_KEY = 'porsca.diagnostics.v1';

const REDACTED = '[redacted]';
const REDACT_KEY_PATTERN = /password|token|secret|authorization/i;
const MAX_STRING_LENGTH = 500;

/** Replaces sensitive keys and truncates long strings before anything is stored. */
export function redactValue(value: unknown, key?: string): unknown {
  if (key !== undefined && REDACT_KEY_PATTERN.test(key)) return REDACTED;
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
  }
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
      result[entryKey] = redactValue(entryValue, entryKey);
    }
    return result;
  }
  return value;
}

export type FailureStore = {
  load: () => Promise<FailureRecord[]>;
  save: (records: FailureRecord[]) => Promise<void>;
};

/** expo-secure-store on native; memory on web, mirroring the token store. */
export function createFailureStore(): FailureStore {
  let webRecords: FailureRecord[] = [];
  return {
    async load() {
      if (Platform.OS === 'web') return webRecords;
      const raw = await SecureStore.getItemAsync(RECORDS_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed as FailureRecord[] : [];
    },
    async save(records) {
      if (Platform.OS === 'web') {
        webRecords = records;
        return;
      }
      await SecureStore.setItemAsync(RECORDS_KEY, JSON.stringify(records), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    },
  };
}

export type Diagnostics = {
  /** Load the persisted records once, best-effort. Safe to call more than once. */
  hydrate: () => Promise<void>;
  record: (record: FailureRecord) => FailureRecord;
  list: () => FailureRecord[];
  find: (reference: string) => FailureRecord | undefined;
  /** Describe a wire failure, record its raw detail, and return the copy. */
  describeAndRecord: (failure: Failure, context: { screen: FailureScreen }) => DescribedFailure;
  /** Resolves once pending persistence work has settled (tests and shutdown). */
  flush: () => Promise<void>;
};

export function createDiagnostics(options: { store?: FailureStore; now?: () => Date; warn?: (message: string) => void } = {}): Diagnostics {
  const store = options.store ?? createFailureStore();
  const now = options.now ?? (() => new Date());
  const warn = options.warn ?? ((line: string) => console.warn('[porsca]', line));
  let records: FailureRecord[] = [];
  let hydrated = false;
  let pending: Promise<void> = Promise.resolve();

  function persist() {
    const snapshot = records.slice(0, PERSISTED_RECORDS);
    pending = pending.then(() => store.save(snapshot)).catch(() => undefined);
    return pending;
  }

  function record(entry: FailureRecord): FailureRecord {
    const redacted: FailureRecord = {
      reference: entry.reference,
      at: entry.at,
      screen: entry.screen,
      ...(entry.status === undefined ? {} : { status: entry.status }),
      ...(entry.code === undefined ? {} : { code: entry.code }),
      ...(entry.message === undefined ? {} : { message: String(redactValue(entry.message)) }),
      ...(entry.details === undefined ? {} : { details: redactValue(entry.details) }),
    };
    records = [redacted, ...records].slice(0, MAX_RECORDS);
    warn(JSON.stringify(redacted));
    void persist();
    return redacted;
  }

  async function hydrate() {
    if (hydrated) return;
    hydrated = true;
    try {
      const persisted = await store.load();
      if (!Array.isArray(persisted) || persisted.length === 0) return;
      const known = new Set(records.map((entry) => entry.reference));
      const restored = persisted.filter((entry) => entry && typeof entry.reference === 'string' && !known.has(entry.reference));
      records = [...records, ...restored].slice(0, MAX_RECORDS);
    } catch {
      // A record list that cannot be read must never block the app.
    }
  }

  function describeAndRecord(failure: Failure, context: { screen: FailureScreen }): DescribedFailure {
    const described = describeFailure(failure, context);
    if (described.reference) {
      record({
        reference: described.reference,
        at: now().toISOString(),
        screen: context.screen,
        ...described.internal,
      });
    }
    return described;
  }

  return {
    hydrate,
    record,
    list: () => [...records],
    find: (reference) => records.find((entry) => entry.reference === reference),
    describeAndRecord,
    flush: () => pending,
  };
}

/** Shared instance used by the app. */
export const diagnostics = createDiagnostics();

/** Shorthand for the one call a screen makes instead of reading `error.message`. */
export function describeAndRecordFailure(failure: Failure, context: { screen: FailureScreen }): DescribedFailure {
  return diagnostics.describeAndRecord(failure, context);
}

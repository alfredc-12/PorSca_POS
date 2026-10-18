/*
 * Regression test for the staging-path setup-hook cold-start gate
 * (`automation/appium/test/cold-start-gate.ts`, used by `smoke.e2e.ts`).
 *
 * End-user-aligned reproduction: a slow staging startup with no visible
 * login or POS screen. Before the fix the hook swallowed that timeout on the
 * staging path (no dev-server reopen configured) and let the case body run,
 * producing misleading per-case failures. The gate must fail fast with the
 * clear startup error instead.
 */

import {
  appUnavailableMsg,
  ensureColdStartVisible,
  type ColdStartGate,
} from '../automation/appium/test/cold-start-gate';

function stagingGate(overrides: Partial<ColdStartGate> = {}): ColdStartGate & {
  reopen: jest.Mock;
  relaunch: jest.Mock;
} {
  const reopen = jest.fn().mockResolvedValue(false);
  const relaunch = jest.fn().mockResolvedValue(undefined);
  return {
    waitForFirstPaint: jest.fn().mockResolvedValue(true),
    reopenDevelopmentApp: reopen,
    waitForRelaunch: relaunch,
    isVisible: jest.fn().mockResolvedValue(true),
    reopen,
    relaunch,
    ...overrides,
  };
}

describe('cold-start gate', () => {
  it('lets the proven fast path through without a reopen attempt', async () => {
    const gate = stagingGate();
    await expect(ensureColdStartVisible(gate)).resolves.toBeUndefined();
    expect(gate.reopen).not.toHaveBeenCalled();
    expect(gate.relaunch).not.toHaveBeenCalled();
  });

  it('fails fast with the clear startup error on slow staging startup with no screen', async () => {
    const gate = stagingGate({
      waitForFirstPaint: jest.fn().mockResolvedValue(false),
      isVisible: jest.fn().mockResolvedValue(false),
    });
    await expect(ensureColdStartVisible(gate)).rejects.toThrow(appUnavailableMsg);
    expect(gate.reopen).toHaveBeenCalledTimes(1);
    expect(gate.relaunch).not.toHaveBeenCalled();
  });

  it('reports the exact startup message so the failure is not mistaken for a case failure', async () => {
    const gate = stagingGate({
      waitForFirstPaint: jest.fn().mockResolvedValue(false),
      isVisible: jest.fn().mockResolvedValue(false),
    });
    const error = await ensureColdStartVisible(gate).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'Neither login nor the signed-in POS became available.',
    );
  });

  it('lets a late-recovering staging launch through instead of failing it', async () => {
    const gate = stagingGate({
      waitForFirstPaint: jest.fn().mockResolvedValue(false),
      isVisible: jest.fn().mockResolvedValue(true),
    });
    await expect(ensureColdStartVisible(gate)).resolves.toBeUndefined();
  });

  it('waits after a dev-server reopen and lets the recovered app through', async () => {
    const relaunch = jest.fn().mockResolvedValue(undefined);
    const gate = stagingGate({
      waitForFirstPaint: jest.fn().mockResolvedValue(false),
      reopenDevelopmentApp: jest.fn().mockResolvedValue(true),
      waitForRelaunch: relaunch,
      isVisible: jest.fn().mockResolvedValue(true),
    });
    await expect(ensureColdStartVisible(gate)).resolves.toBeUndefined();
    expect(relaunch).toHaveBeenCalledTimes(1);
  });

  it('propagates the startup error when the app stays down after a reopen', async () => {
    const gate = stagingGate({
      waitForFirstPaint: jest.fn().mockResolvedValue(false),
      reopenDevelopmentApp: jest.fn().mockResolvedValue(true),
      waitForRelaunch: jest.fn().mockRejectedValue(new Error(appUnavailableMsg)),
      isVisible: jest.fn().mockResolvedValue(false),
    });
    await expect(ensureColdStartVisible(gate)).rejects.toThrow(appUnavailableMsg);
  });
});

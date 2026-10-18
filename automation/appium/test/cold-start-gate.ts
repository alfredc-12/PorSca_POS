/*
 * Cold-start gate for the Appium setup hook (`smoke.e2e.ts` `beforeEach`).
 *
 * This module is intentionally free of WebdriverIO imports so the mobile
 * `jest` suite can regression-test the gating logic without a device.
 *
 * Three things are kept separate here on purpose:
 * - Initiating trigger: a slow app startup (the first-paint wait times out).
 * - Masking condition: timing/environment slowness hiding both the login and
 *   the signed-in POS screens, so neither locator is displayed yet.
 * - Visible symptom (the bug this gate fixes): the hook used to swallow that
 *   timeout on the staging path and let the case body run with no screen up,
 *   producing misleading per-case failures instead of one clear startup error.
 *
 * The dev-server reopen path already failed fast (its post-reopen wait throws),
 * so only the staging path — where no reopen is configured — fell through.
 * The final visibility probe below closes that gap: when neither screen is up
 * after the trigger and masking condition above, the hook fails immediately
 * with the startup error instead of running the case.
 */

export const appUnavailableMsg = 'Neither login nor the signed-in POS became available.';

export type ColdStartGate = {
  /**
   * First-paint wait. Resolves true when login or POS became visible, false
   * when slow startup beat the wait (the initiating trigger).
   */
  waitForFirstPaint: () => Promise<boolean>;
  /**
   * Dev-launcher reopen attempt. Resolves false when unconfigured, which is
   * the standalone/staging path.
   */
  reopenDevelopmentApp: () => Promise<boolean>;
  /**
   * Post-reopen wait. Rejects with the startup error when the screens stay
   * hidden after a reopen.
   */
  waitForRelaunch: () => Promise<void>;
  /** Final visibility probe before any case body runs. */
  isVisible: () => Promise<boolean>;
};

export async function ensureColdStartVisible(gate: ColdStartGate): Promise<void> {
  const appIsUp = await gate.waitForFirstPaint();
  if (!appIsUp && (await gate.reopenDevelopmentApp())) {
    await gate.waitForRelaunch();
  }
  if (!(await gate.isVisible())) {
    throw new Error(appUnavailableMsg);
  }
}

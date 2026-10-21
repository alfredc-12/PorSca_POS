/*
 * Cold-start gate for the Appium setup hook. Kept free of WebdriverIO imports
 * so the mobile Jest suite can regression-test the gating logic without a
 * device.
 */

export const appUnavailableMsg = 'Neither login nor the signed-in POS became available.';

export type ColdStartGate = {
  /** First-paint wait; false means slow startup beat the initial wait. */
  waitForFirstPaint: () => Promise<boolean>;
  /** Returns false when no development server is configured. */
  reopenDevelopmentApp: () => Promise<boolean>;
  /** Wait after a development-server reopen. */
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

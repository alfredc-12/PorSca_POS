import { $$, $, browser, expect } from '@wdio/globals';
import { ensureColdStartVisible, appUnavailableMsg } from './cold-start-gate';
import {
  appPackage,
  appiumEnabled,
  cashReceived,
  devServerLaunchTimeoutMs,
  devServerUrl,
  productSearch,
  productText,
  qrExpectedStatus,
  qrStatusMessages,
} from './fixtures';

export type AppiumTest = (name: string, fn: () => Promise<void>, timeoutMs?: number) => void;
export const appiumTest: AppiumTest = appiumEnabled
  ? (name, fn, timeoutMs) => {
    const test = it(name, fn);
    if (timeoutMs !== undefined) test.timeout(timeoutMs);
  }
  : (name) => {
    console.info(`Skipped ${name}; set APPIUM_RUN=true to run the formal backend smoke seam.`);
  };

type MobileDriver = {
  execute: (script: string, args: unknown) => Promise<unknown>;
  activateApp: (packageName: string) => Promise<unknown>;
  getWindowSize: () => Promise<{ width: number; height: number }>;
  hideKeyboard: () => Promise<boolean>;
  pause: (ms: number) => Promise<unknown>;
  waitUntil: (
    condition: () => Promise<boolean>,
    options: { timeoutMsg: string; timeout?: number },
  ) => Promise<unknown>;
};

export function androidDriver(): MobileDriver {
  return browser as unknown as MobileDriver;
}

export function byId(id: string) {
  // React Native testID is an Android resource-id, not a content-description.
  return $(`android=new UiSelector().resourceId(${JSON.stringify(id)})`);
}

export function byText(value: string) {
  return $(`android=new UiSelector().textContains(${JSON.stringify(value)})`);
}

export function byExactText(value: string) {
  return $(`android=new UiSelector().text(${JSON.stringify(value)})`);
}

export function byDescription(value: string) {
  return $(`android=new UiSelector().descriptionContains(${JSON.stringify(value)})`);
}

export async function tap(id: string) {
  await tapElement(byId(id));
}

export async function tapElement(element: ReturnType<typeof byId>) {
  await (await reveal(element)).click();
}

// UiAutomator exposes only the on-screen part of a scrollable screen, and a
// focused field can hide the target behind the soft keyboard. A form control
// further down may need the keyboard gone and a swipe before it can be tapped.
export async function reveal(element: ReturnType<typeof byId>) {
  if (await element.isDisplayed().catch(() => false)) return element;
  const { width, height } = await androidDriver().getWindowSize();
  const x = Math.round(width / 2);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await closeKeyboard();
    if (await element.isDisplayed().catch(() => false)) return element;
    await androidDriver().execute('mobile: shell', {
      command: 'input',
      args: ['swipe', `${x}`, `${Math.round(height * 0.7)}`, `${x}`, `${Math.round(height * 0.3)}`, '300'],
    });
    await androidDriver().pause(250);
    if (await element.isDisplayed().catch(() => false)) return element;
  }
  // Nothing was revealed: let the caller's own timeout report the failure.
  await element.waitForDisplayed();
  return element;
}

export async function visibleText(element: ReturnType<typeof byId>): Promise<string> {
  return (await reveal(element)).getText();
}

export async function closeKeyboard() {
  await androidDriver().hideKeyboard().catch(() => false);
}

export async function scrollToTop() {
  const { width, height } = await androidDriver().getWindowSize();
  const x = Math.round(width / 2);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await androidDriver().execute('mobile: shell', {
      command: 'input',
      args: ['swipe', `${x}`, `${Math.round(height * 0.3)}`, `${x}`, `${Math.round(height * 0.7)}`, '250'],
    });
    await androidDriver().pause(150);
  }
}

export async function typeCashReceived(amount: string) {
  await byId('cash-received-input').setValue(amount);
  await closeKeyboard();
}

const devClientLayerTexts = ['This is the developer menu', 'Open DevTools'];

async function devClientLayerVisible() {
  for (const text of devClientLayerTexts) {
    if (await byText(text).isDisplayed().catch(() => false)) return true;
  }
  return false;
}

async function reopenDevelopmentApp(mobileDriver: MobileDriver, appIsUp: () => Promise<boolean>) {
  if (!devServerUrl) return false;
  await mobileDriver.execute('mobile: shell', {
    command: 'am',
    args: ['start', '-a', 'android.intent.action.VIEW', '-d',
      `porsca://expo-development-client/?url=${devServerUrl}`],
  });
  await mobileDriver.waitUntil(
    async () => await appIsUp() || await devClientLayerVisible(),
    { timeout: devServerLaunchTimeoutMs, timeoutMsg: appUnavailableMsg },
  );
  if (await devClientLayerVisible()) {
    await mobileDriver.execute('mobile: pressKey', { keycode: 4 });
  }
  return true;
}

async function waitForAppSurface(mobileDriver: MobileDriver) {
  const loginOrPosVisible = async () =>
    await byId('login-email-input').isDisplayed().catch(() => false) ||
    await byId('pos-search-input').isDisplayed().catch(() => false);

  // A reset dev-client build lands on its launcher; the development deep link
  // is used only when APPIUM_DEV_SERVER_URL is configured. Standalone builds
  // keep the same fail-fast startup gate without trying to open Metro.
  await ensureColdStartVisible({
    waitForFirstPaint: () => mobileDriver
      .waitUntil(loginOrPosVisible, { timeoutMsg: appUnavailableMsg })
      .then(() => true, () => false),
    reopenDevelopmentApp: () => reopenDevelopmentApp(mobileDriver, loginOrPosVisible),
    waitForRelaunch: () => mobileDriver.waitUntil(loginOrPosVisible, {
      timeout: devServerLaunchTimeoutMs,
      timeoutMsg: appUnavailableMsg,
    }).then(() => undefined),
    isVisible: loginOrPosVisible,
  });
}

async function signInIfNeeded() {
  if (!(await byId('login-email-input').isDisplayed().catch(() => false))) return;
  const email = process.env.APPIUM_LOGIN_EMAIL;
  const password = process.env.APPIUM_LOGIN_PASSWORD;
  if (!email || !password) throw new Error('Set private APPIUM_LOGIN_EMAIL and APPIUM_LOGIN_PASSWORD for an active account on the backend under test.');
  await byId('login-email-input').setValue(email);
  await byId('login-password-input').setValue(password);
  await tap('login-submit');
  await byId('pos-search-input').waitForDisplayed();
}

export async function prepareAppiumCase() {
  const mobileDriver = androidDriver();
  if (process.env.APPIUM_RESET_APP !== 'false') {
    await mobileDriver.execute('mobile: shell', {
      command: 'pm',
      args: ['clear', appPackage],
    });
  }
  // A data reset also revokes camera permission; grant it as seam setup so a
  // system dialog never blocks the physical-label smoke case.
  await mobileDriver.execute('mobile: shell', {
    command: 'pm',
    args: ['grant', appPackage, 'android.permission.CAMERA'],
  });
  await mobileDriver.activateApp(appPackage);
  await waitForAppSurface(mobileDriver);
  await signInIfNeeded();
}

/** Restart only the Android process; retain secure session and checkout state. */
export async function restartAppPreservingData() {
  const mobileDriver = androidDriver();
  await mobileDriver.execute('mobile: shell', {
    command: 'am',
    args: ['force-stop', appPackage],
  });
  await mobileDriver.activateApp(appPackage);
  await waitForAppSurface(mobileDriver);
  await signInIfNeeded();
}

export async function searchFor(searchTerm: string) {
  const searchInput = byId('pos-search-input');
  await tap('pos-search-input');
  await searchInput.clearValue();
  await searchInput.setValue(searchTerm);
  await byId('search-result').waitForDisplayed();
  await closeKeyboard();
}

export async function searchAndSelect(searchTerm: string) {
  await searchFor(searchTerm);
  await tap('search-result');
}

export async function presentPhysicalBarcodeFixture(barcode: string) {
  await tap('pos-scan-button');
  const allowCamera = byText('Allow Camera');
  if (await allowCamera.isDisplayed().catch(() => false)) {
    await allowCamera.click();
  }
  // Appium cannot synthesize a camera image. A human presents the label while
  // this smoke case waits for the native scanner to add the matching product.
  console.info(`Present barcode fixture ${barcode} to the device camera.`);
  await byText('The product is added to the cart as soon as it is recognized.').waitForDisplayed();
  await byId('pos-search-input').waitForDisplayed();
  await byText(productText).waitForDisplayed();
}

export async function selectTab(testId: 'tab-pos' | 'tab-inventory' | 'tab-transactions') {
  await tap(testId);
}

export async function startCashCheckout(searchTerm = productSearch, amount = cashReceived) {
  await searchAndSelect(searchTerm);
  await tap('proceed-to-payment');
  await typeCashReceived(amount);
}

export async function finishReceipt(method: 'cash' | 'qrph') {
  await byText('Payment completed').waitForDisplayed();
  await byText(method === 'cash'
    ? 'Cash payment and sale are recorded.'
    : qrStatusMessages.paid).waitForDisplayed();
  const receipt = byText('Receipt ');
  await receipt.waitForDisplayed();
  const receiptId = (await receipt.getText()).match(/Receipt ([^\s]+)/)?.[1];
  if (!receiptId) throw new Error('The completed payment has no receipt identity.');
  if (method === 'cash') {
    await byText('Cash received ₱').waitForDisplayed();
    await byText('Change to give ₱').waitForDisplayed();
  }
  await tapElement(byText('Done'));
  await (await reveal(byId(`transaction-${receiptId}`))).waitForDisplayed();
  return receiptId;
}

export function readMoney(value: string): number {
  const match = value.match(/₱\s*([\d,]+\.\d{2})/);
  if (!match) throw new Error(`Could not read a peso amount from visible text: ${value}`);
  return Number(match[1].replace(/,/g, ''));
}

export function readStock(value: string): number {
  const match = value.match(/\((\d+)\)/);
  if (!match) throw new Error(`Could not read a stock quantity from visible text: ${value}`);
  return Number(match[1]);
}

export function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}.`);
}

export { $$, $, browser, expect, productSearch, productText, qrExpectedStatus, qrStatusMessages, appiumEnabled };

export const config = {
  runner: 'local',
  specs: ['./test/**/*.e2e.ts'],
  maxInstances: 1,
  logLevel: 'info',
  framework: 'mocha',
  reporters: ['spec'],
  services: ['appium'],
  port: Number(process.env.APPIUM_PORT ?? 4723),
  capabilities: [{
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': process.env.APPIUM_DEVICE_NAME ?? 'Android Emulator',
    'appium:appPackage': process.env.APPIUM_APP_PACKAGE ?? 'com.porsca.pos',
    'appium:appActivity': process.env.APPIUM_APP_ACTIVITY ?? '.MainActivity',
    'appium:noReset': false,
    'appium:newCommandTimeout': 120,
  }],
  mochaOpts: {
    timeout: Number(process.env.APPIUM_TIMEOUT_MS ?? 120000),
  },
  onComplete: async function () {
    // Evidence is kept in the configured CI/artifact store, not committed here.
  },
};

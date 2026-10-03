/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from '@babel/core';
import type { PluginItem } from '@babel/core';

const { expoInlineEnvVars } = jest.requireActual<{ expoInlineEnvVars: PluginItem }>('babel-preset-expo/build/plugins/inline-env-vars');

describe('production-bundled demo catalog policy', () => {
  const originalFlag = process.env.EXPO_PUBLIC_ALLOW_DEMO_CATALOG;

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_ALLOW_DEMO_CATALOG;
    else process.env.EXPO_PUBLIC_ALLOW_DEMO_CATALOG = originalFlag;
  });

  it.each([
    ['1', true],
    ['0', false],
    ['true', false],
    [undefined, false],
  ])('inlines build-time flag %s without requiring public env variables at runtime', (flag, enabled) => {
    if (flag === undefined) delete process.env.EXPO_PUBLIC_ALLOW_DEMO_CATALOG;
    else process.env.EXPO_PUBLIC_ALLOW_DEMO_CATALOG = flag;
    const filename = `${__dirname}/offline.ts`;
    const caller = { name: 'metro', isDev: false, platform: 'android', bundler: 'metro' };
    const transformed = transformSync(readFileSync(filename, 'utf8'), {
      filename, configFile: false, babelrc: false,
      caller,
      plugins: [expoInlineEnvVars, '@babel/plugin-transform-typescript', '@babel/plugin-transform-modules-commonjs'],
    });
    expect(transformed?.code).toBeTruthy();

    // Production clients have no build-machine public env object. Execute the
    // actual transformed policy module, not a hand-written lookalike.
    const runtime = {
      exports: {} as { isDemoCatalogEnabled: (env?: Record<string, string | undefined>) => boolean },
      process: { env: { NODE_ENV: 'production' } },
    };
    runInNewContext(transformed!.code!, runtime);
    expect(runtime.exports.isDemoCatalogEnabled()).toBe(enabled);
    expect(runtime.exports.isDemoCatalogEnabled({ EXPO_PUBLIC_ALLOW_DEMO_CATALOG: '1' })).toBe(true);
    expect(runtime.exports.isDemoCatalogEnabled({ EXPO_PUBLIC_ALLOW_DEMO_CATALOG: '0' })).toBe(false);
  });
});

import { spawnSync } from 'node:child_process';
import path from 'node:path';

describe('ESLint configuration', () => {
  it('loads without emitting a MODULE_TYPELESS_PACKAGE_JSON warning', () => {
    const loadConfig = [
      "const { ESLint } = require('eslint');",
      '(async () => {',
      '  const eslint = new ESLint();',
      "  await eslint.calculateConfigForFile('package.json');",
      '})().catch(error => {',
      '  console.error(error);',
      '  process.exitCode = 1;',
      '});',
    ].join('\n');
    const result = spawnSync(process.execPath, ['-e', loadConfig], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('[MODULE_TYPELESS_PACKAGE_JSON] Warning:');
  });
});

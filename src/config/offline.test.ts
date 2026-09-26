import { DEMO_CATALOG_ENV_VAR, isDemoCatalogEnabled } from '@/src/config/offline';

describe('offline demo catalog flag', () => {
  it('is off unless the environment opts in explicitly', () => {
    expect(isDemoCatalogEnabled({})).toBe(false);
    expect(isDemoCatalogEnabled({ [DEMO_CATALOG_ENV_VAR]: '' })).toBe(false);
    expect(isDemoCatalogEnabled({ [DEMO_CATALOG_ENV_VAR]: 'true' })).toBe(false);
    expect(isDemoCatalogEnabled({ [DEMO_CATALOG_ENV_VAR]: '0' })).toBe(false);
    expect(isDemoCatalogEnabled({ [DEMO_CATALOG_ENV_VAR]: '1' })).toBe(true);
  });
});

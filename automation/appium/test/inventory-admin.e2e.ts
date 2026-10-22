import { beforeEach } from 'mocha';
import {
  appiumTest,
  assertEqual,
  byDescription,
  byId,
  byText,
  closeKeyboard,
  prepareAppiumCase,
  readStock,
  reveal,
  selectTab,
  tap,
  tapElement,
} from './support/appium';
import { productText } from './support/fixtures';

beforeEach(prepareAppiumCase);

async function openFixtureEditor() {
  await selectTab('tab-inventory');
  await byId('inventory-search-input').waitForDisplayed();
  const inventorySearch = byId('inventory-search-input');
  await inventorySearch.setValue(productText);
  await closeKeyboard();
  await tapElement(byDescription(`Edit ${productText}`));
  await byId('product-name-input').waitForDisplayed();
}

async function saveStock(value: number) {
  const stockInput = await reveal(byId('product-stock-input'));
  await stockInput.setValue(String(value));
  await closeKeyboard();
  await tap('save-product-button');
  await byId('product-stock-input').waitForDisplayed({ reverse: true });
  await byText(`(${value})`).waitForDisplayed();
}

describe('admin inventory controls', () => {
  appiumTest('admin can open product management from inventory', async () => {
    await selectTab('tab-inventory');
    await byText('Manage your products and stock levels').waitForDisplayed();
    await byDescription('Add product').waitForDisplayed();
    await byId('inventory-search-input').setValue(productText);
    await closeKeyboard();
    await tapElement(byDescription(`Edit ${productText}`));
    await byId('product-name-input').waitForDisplayed();
    await byId('product-barcode-input').waitForDisplayed();
    await byId('edit-barcode-button').waitForDisplayed();
    await tapElement(byDescription('Close product editor'));
    await byId('product-name-input').waitForDisplayed({ reverse: true });
  });

  appiumTest('admin stock edits are reflected in inventory and restored to the fixture value', async () => {
    await openFixtureEditor();
    const stockInput = await reveal(byId('product-stock-input'));
    const originalText = await stockInput.getValue();
    const originalStock = readStock(`(${originalText})`);
    const changedStock = originalStock < 999999999 ? originalStock + 1 : originalStock - 1;

    try {
      await saveStock(changedStock);
      await assertEqual(readStock(await byText(`(${changedStock})`).getText()), changedStock, 'Saved inventory stock');
    } finally {
      if (!(await byId('product-stock-input').isDisplayed().catch(() => false))) {
        await openFixtureEditor();
      }
      await saveStock(originalStock);
    }
  });
});

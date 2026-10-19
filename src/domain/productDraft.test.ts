import { makeProductDraft, productInput, productPatch, validateProductDraft } from './productDraft';

const valid = { name: 'Coffee', barcode: '0012345678905', price: '12.99', stock: '3', category: 'Frozen Food' };

it('preserves leading zeros, zero values, and custom category names', () => {
  expect(validateProductDraft({ ...valid, price: '0', stock: '0' })).toEqual({});
  expect(productInput(valid)).toEqual({ name: 'Coffee', barcode: '0012345678905', price: 12.99, stock: 3, category: 'Frozen Food' });
});

it.each([
  ['name', ''], ['name', 'x'.repeat(256)], ['barcode', 'abc'], ['barcode', '1234567'],
  ['price', ''], ['price', '-1'], ['price', '1.234'], ['price', '9'.repeat(400)],
  ['stock', ''], ['stock', '-1'], ['stock', '1.5'], ['stock', '9999999999999999'],
  ['category', ''], ['category', 'x'.repeat(101)],
])('rejects invalid %s without a write', (field, value) => {
  expect(validateProductDraft({ ...valid, [field]: value })).toHaveProperty(field);
});

it('produces a partial patch without unchanged barcode, category, or stock', () => {
  expect(productPatch(valid, { ...valid, name: 'New name', price: '15.50' })).toEqual({ name: 'New name', price: 15.5 });
  expect(productPatch(valid, { ...valid, price: '12.990' })).toEqual({});
});

it('creates an empty new draft with a locked-ready barcode and default category', () => {
  expect(makeProductDraft(undefined, '0012345678905')).toEqual({ name: '', barcode: '0012345678905', price: '', stock: '', category: 'General' });
});

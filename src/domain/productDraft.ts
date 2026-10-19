import { Product } from '@/src/types';

export const DEFAULT_CATEGORIES = ['Beverages', 'Noodles', 'Milk', 'Snacks', 'Personal Care', 'Household', 'General'];
export type ProductDraft = { name: string; barcode: string; price: string; stock: string; category: string };
export type ProductDraftErrors = Partial<Record<keyof ProductDraft, string>>;

export function makeProductDraft(product?: Product, barcode = ''): ProductDraft {
  return {
    name: product?.name ?? '', barcode: product?.barcode ?? barcode,
    price: product ? String(product.price) : '', stock: product ? String(product.stock) : '',
    category: product?.category ?? 'General',
  };
}

export function validateProductDraft(draft: Omit<ProductDraft, 'category'> & { category?: string }): ProductDraftErrors {
  const errors: ProductDraftErrors = {};
  if (!draft.name.trim()) errors.name = 'Enter a product name.';
  else if (draft.name.trim().length > 255) errors.name = 'Use a product name with at most 255 characters.';
  if (!/^\d{8,64}$/.test(draft.barcode.trim())) errors.barcode = 'Enter an 8–64 digit barcode.';
  const price = draft.price.trim();
  const cents = Math.round(Number(price) * 100);
  if (!/^\d+(?:\.\d{1,2})?$/.test(price) || !Number.isSafeInteger(cents) || cents > 4294967295) {
    errors.price = 'Enter a non-negative price with up to 2 decimal places.';
  }
  const stock = draft.stock.trim();
  if (!/^\d+$/.test(stock) || !Number.isSafeInteger(Number(stock)) || Number(stock) > 4294967295) {
    errors.stock = 'Enter a whole-number stock quantity of 0 or more.';
  }
  if (draft.category !== undefined && (!draft.category.trim() || draft.category.trim().length > 100)) {
    errors.category = 'Enter a category with 1–100 characters.';
  }
  return errors;
}

export function productInput(draft: ProductDraft): Omit<Product, 'id'> {
  return { name: draft.name.trim(), barcode: draft.barcode.trim(), price: Number(draft.price), stock: Number(draft.stock), category: draft.category.trim() };
}

export function productPatch(initial: ProductDraft, draft: ProductDraft): Partial<Omit<Product, 'id'>> {
  const before = productInput(initial);
  const after = productInput(draft);
  return Object.fromEntries(Object.entries(after).filter(([key, value]) => before[key as keyof typeof before] !== value));
}

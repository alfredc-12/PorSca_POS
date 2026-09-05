import { Product } from '@/src/types';

export const seedProducts: Product[] = [
  { id: 'prd-001', barcode: '4800010000011', name: 'Coca-Cola 500mL', price: 25, stock: 48, category: 'Beverages' },
  { id: 'prd-002', barcode: '4807770270025', name: 'Lucky Me Pancit Canton', price: 13, stock: 120, category: 'Noodles' },
  { id: 'prd-003', barcode: '4800361000033', name: 'Bear Brand 33g', price: 12, stock: 76, category: 'Milk' },
  { id: 'prd-004', barcode: '4800011122334', name: 'Piattos Cheese 85g', price: 20, stock: 8, category: 'Snacks' },
  { id: 'prd-005', barcode: '4804888100016', name: "Nature's Spring 500mL", price: 10, stock: 34, category: 'Beverages' },
  { id: 'prd-006', barcode: '8850006305076', name: 'Colgate Toothpaste 100g', price: 75, stock: 0, category: 'Personal Care' },
];

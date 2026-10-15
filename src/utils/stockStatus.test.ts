import { stockStatus } from './stockStatus';
import { Product } from '@/src/types';

it('partitions summary counts exactly once using Laravel statuses and reorder levels', () => {
  const products: Product[] = [
    { id: '1', name: 'Empty', barcode: '1', price: 1, stock: 0 },
    { id: '2', name: 'Low', barcode: '2', price: 1, stock: 20, reorderLevel: 25 },
    { id: '3', name: 'Healthy', barcode: '3', price: 1, stock: 5, reorderLevel: 2 },
    { id: '4', name: 'Server classification', barcode: '4', price: 1, stock: 0, stockStatus: 'in_stock' },
  ];
  expect(products.map(stockStatus)).toEqual(['out_of_stock', 'low_stock', 'in_stock', 'in_stock']);
});

it('classifies rows without a Laravel status or reorder level by the default low-stock threshold', () => {
  const products: Product[] = [
    { id: '1', name: 'Demo empty', barcode: '1', price: 1, stock: 0 },
    { id: '2', name: 'Demo low', barcode: '2', price: 1, stock: 8 },
    { id: '3', name: 'Demo boundary', barcode: '3', price: 1, stock: 10 },
    { id: '4', name: 'Demo healthy', barcode: '4', price: 1, stock: 11 },
  ];
  expect(products.map(stockStatus)).toEqual(['out_of_stock', 'low_stock', 'low_stock', 'in_stock']);
});

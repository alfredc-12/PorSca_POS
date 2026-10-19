import { Sale } from '@/src/types';

export function localSaleDate(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function validHistoryDate(value: string): boolean {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && localSaleDate(`${value}T00:00:00`) === value;
}

export function filterHistory(sales: Sale[], query: string, filter: 'all' | 'today' | Sale['paymentMethod'], date: string, now = new Date()): Sale[] {
  const q = query.trim().toLowerCase();
  if (!validHistoryDate(date)) return [];
  return sales.filter(sale => {
    const day = localSaleDate(sale.createdAt);
    return (filter === 'all' || (filter === 'today' ? day === localSaleDate(now.toISOString()) : sale.paymentMethod === filter))
      && (!date || day === date)
      && (!q || sale.id.toLowerCase().includes(q) || sale.total.toFixed(2).includes(q) || sale.items.some(item => item.product.name.toLowerCase().includes(q)));
  });
}

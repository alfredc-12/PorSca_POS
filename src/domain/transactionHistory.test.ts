import { filterHistory, validHistoryDate } from './transactionHistory';
import { Sale } from '@/src/types';

const sales: Sale[] = Array.from({ length: 150 }, (_, index) => ({
  id: `receipt-${index + 1}`, items: [], total: index + 1,
  paymentMethod: index >= 100 ? 'qrph' : 'cash', status: 'paid',
  createdAt: index >= 100 ? '2026-01-02T12:00:00' : '2026-09-01T12:00:00',
}));

describe('complete transaction history search', () => {
  it('finds receipts beyond the first 100 by receipt, date and payment method together', () => {
    expect(filterHistory(sales, ' RECEIPT-150 ', 'qrph', '2026-01-02').map(s => s.id)).toEqual(['receipt-150']);
    expect(filterHistory(sales, '', 'qrph', '2026-01-02')).toHaveLength(50);
    expect(filterHistory(sales, '', 'cash', '2026-01-02')).toHaveLength(0);
  });
  it('can clear filters and select today independently', () => {
    expect(filterHistory(sales, '', 'all', '')).toHaveLength(150);
    expect(filterHistory(sales, '', 'today', '', new Date('2026-01-02T12:00:00'))).toHaveLength(50);
  });
  it.each(['2026-02-30', '2026-13-01', '01/02/2026', '2026-1-2'])('rejects invalid date %s', date => {
    expect(validHistoryDate(date)).toBe(false);
    expect(filterHistory(sales, '', 'all', date)).toEqual([]);
  });
});

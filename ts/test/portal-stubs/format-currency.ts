export type CurrencyType = 'usd';

export function formatCurrency(amount: number, _opts?: { currency: CurrencyType }): string {
  const dollars = (amount / 100).toFixed(2);
  return `$${dollars}`;
}


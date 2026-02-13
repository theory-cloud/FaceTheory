export function parseToInt(value: string): number {
  const digits = String(value ?? '').replaceAll(/[^\d]/g, '');
  return digits ? Number.parseInt(digits, 10) : 0;
}


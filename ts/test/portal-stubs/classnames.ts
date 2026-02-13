export default function classNames(...args: unknown[]): string {
  const out: string[] = [];
  for (const arg of args) {
    if (!arg) continue;
    if (typeof arg === 'string') out.push(arg);
    else if (typeof arg === 'object') {
      for (const [key, value] of Object.entries(arg as Record<string, unknown>)) {
        if (value) out.push(key);
      }
    }
  }
  return out.join(' ');
}


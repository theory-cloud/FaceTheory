export function get(obj: unknown, path: unknown, defaultValue?: unknown): unknown {
  if (!obj || typeof obj !== 'object') return defaultValue;
  if (typeof path !== 'string') return defaultValue;
  const parts = path.split('.').filter(Boolean);
  let cur: any = obj;
  for (const part of parts) {
    if (cur == null) return defaultValue;
    cur = cur[part];
  }
  return cur === undefined ? defaultValue : cur;
}


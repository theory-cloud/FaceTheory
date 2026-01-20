export function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export async function* streamFromString(value: string): AsyncIterable<Uint8Array> {
  yield utf8(value);
}


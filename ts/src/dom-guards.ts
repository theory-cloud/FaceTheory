export function isElement(value: unknown): value is Element {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { tagName?: unknown }).tagName === 'string' &&
    typeof (value as { setAttribute?: unknown }).setAttribute === 'function' &&
    typeof (value as { classList?: unknown }).classList === 'object'
  );
}

export function isHTMLElement(value: unknown): value is HTMLElement {
  return (
    isElement(value) &&
    typeof (value as { hasAttribute?: unknown }).hasAttribute === 'function'
  );
}

export function isElementWithTag(
  value: unknown,
  tagName: string,
): value is Element {
  return isElement(value) && value.tagName.toLowerCase() === tagName;
}

export function isHTMLElementWithTag(
  value: unknown,
  tagName: string,
): value is HTMLElement {
  return isHTMLElement(value) && value.tagName.toLowerCase() === tagName;
}

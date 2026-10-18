/**
 * Browser-safe HTML start-tag and attribute scanning shared by server-side
 * strict-CSP validation and client-side SPA navigation. The scanners follow the
 * attribute states a browser tokenizer reaches, so quoted `>` characters cannot
 * hide attributes that follow them.
 */

export interface HtmlStartTag {
  attrs: string;
  end: number;
  start: number;
  tagName: string;
}

export interface HtmlAttribute {
  name: string;
  value: string | null;
}

/**
 * Finds the `>` that ends a start tag by following the attribute states a
 * browser tokenizer reaches after the tag name. Quoted attribute values are
 * skipped as a unit, so a `>` inside `title="a > b"` cannot hide attributes
 * that follow it, while a quote inside an unquoted value stays value text.
 * An unterminated quoted value falls back to the first `>` boundary so a
 * malformed tag can never stop the scan before later tags.
 */
function findHtmlStartTagEnd(html: string, from: number): number {
  let cursor = from;
  while (cursor < html.length) {
    const code = html.charCodeAt(cursor);
    // Before an attribute name the tokenizer ignores whitespace and solidus.
    if (isHtmlWhitespace(code) || code === 47) {
      cursor += 1;
      continue;
    }
    if (code === 62) return cursor;

    while (
      cursor < html.length &&
      !isHtmlAttributeNameDelimiter(html.charCodeAt(cursor))
    ) {
      cursor += 1;
    }

    cursor = skipHtmlWhitespace(html, cursor);
    if (html.charCodeAt(cursor) !== 61) continue;
    cursor = skipHtmlWhitespace(html, cursor + 1);

    const quoteCode = html.charCodeAt(cursor);
    if (quoteCode === 34 || quoteCode === 39) {
      const closingQuote = html.indexOf(html[cursor] ?? '', cursor + 1);
      if (closingQuote === -1) return html.indexOf('>', from);
      cursor = closingQuote + 1;
      continue;
    }

    // Unquoted values end at whitespace or `>`; quotes are ordinary text.
    while (cursor < html.length) {
      const valueCode = html.charCodeAt(cursor);
      if (valueCode === 62 || isHtmlWhitespace(valueCode)) break;
      cursor += 1;
    }
  }
  return -1;
}

export function* scanHtmlStartTags(html: string): Generator<HtmlStartTag> {
  let cursor = 0;
  while (cursor < html.length) {
    const tagStart = html.indexOf('<', cursor);
    if (tagStart === -1) return;

    const nameStart = tagStart + 1;
    const firstNameChar = html.charCodeAt(nameStart);
    if (!isAsciiAlpha(firstNameChar)) {
      cursor = nameStart;
      continue;
    }

    let nameEnd = nameStart + 1;
    while (
      nameEnd < html.length &&
      isHtmlTagNameChar(html.charCodeAt(nameEnd))
    ) {
      nameEnd += 1;
    }

    const tagEnd = findHtmlStartTagEnd(html, nameEnd);
    if (tagEnd === -1) return;

    yield {
      attrs: html.slice(nameEnd, tagEnd),
      end: tagEnd + 1,
      start: tagStart,
      tagName: html.slice(nameStart, nameEnd),
    };
    cursor = tagEnd + 1;
  }
}

export function hasHtmlAttribute(attrs: string, name: string): boolean {
  const expectedName = name.toLowerCase();
  for (const attributeName of scanHtmlAttributeNames(attrs)) {
    if (attributeName.toLowerCase() === expectedName) return true;
  }
  return false;
}

export function readHtmlAttributeValue(
  attrs: string,
  name: string,
): string | null {
  const expectedName = name.toLowerCase();
  for (const attribute of scanHtmlAttributes(attrs)) {
    if (attribute.name.toLowerCase() === expectedName) {
      return attribute.value ?? '';
    }
  }
  return null;
}

export function findInlineEventAttribute(attrs: string): string | null {
  for (const attributeName of scanHtmlAttributeNames(attrs)) {
    if (/^on[a-z][\w:-]*$/i.test(attributeName)) return attributeName;
  }
  return null;
}

export function* scanHtmlAttributeNames(attrs: string): Generator<string> {
  for (const attribute of scanHtmlAttributes(attrs)) {
    yield attribute.name;
  }
}

export function* scanHtmlAttributes(attrs: string): Generator<HtmlAttribute> {
  let cursor = 0;
  while (cursor < attrs.length) {
    cursor = skipHtmlAttributeDelimiters(attrs, cursor);
    if (cursor >= attrs.length) return;

    const nameStart = cursor;
    while (
      cursor < attrs.length &&
      !isHtmlAttributeNameDelimiter(attrs.charCodeAt(cursor))
    ) {
      cursor += 1;
    }

    const attributeName = attrs.slice(nameStart, cursor);

    cursor = skipHtmlWhitespace(attrs, cursor);
    if (attrs[cursor] !== '=') {
      if (attributeName) yield { name: attributeName, value: null };
      continue;
    }

    cursor = skipHtmlWhitespace(attrs, cursor + 1);
    if (attrs[cursor] === '"' || attrs[cursor] === "'") {
      const quote = attrs[cursor] ?? '';
      cursor += 1;
      const valueStart = cursor;
      while (cursor < attrs.length && attrs[cursor] !== quote) cursor += 1;
      const value = attrs.slice(valueStart, cursor);
      if (cursor < attrs.length) cursor += 1;
      if (attributeName) yield { name: attributeName, value };
      continue;
    }

    const valueStart = cursor;
    while (
      cursor < attrs.length &&
      !isHtmlWhitespace(attrs.charCodeAt(cursor))
    ) {
      cursor += 1;
    }
    const value = attrs.slice(valueStart, cursor);
    if (attributeName) yield { name: attributeName, value };
  }
}

function skipHtmlAttributeDelimiters(value: string, start: number): number {
  let cursor = start;
  while (cursor < value.length) {
    const next = skipHtmlWhitespace(value, cursor);
    // Browser parsers treat an unexpected solidus before an attribute name as
    // a parse error, then continue in the before-attribute-name state. Mirror
    // that boundary so `<button/onclick=...>` is scanned as an onclick attr
    // without making `/` unsafe inside unquoted attribute values.
    if (value[next] !== '/') return next;
    cursor = next + 1;
  }
  return cursor;
}

function skipHtmlWhitespace(value: string, start: number): number {
  let cursor = start;
  while (cursor < value.length && isHtmlWhitespace(value.charCodeAt(cursor))) {
    cursor += 1;
  }
  return cursor;
}

function isAsciiAlpha(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isHtmlTagNameChar(code: number): boolean {
  return (
    isAsciiAlpha(code) ||
    (code >= 48 && code <= 57) ||
    code === 45 ||
    code === 58
  );
}

function isHtmlAttributeNameDelimiter(code: number): boolean {
  return isHtmlWhitespace(code) || code === 47 || code === 61 || code === 62;
}

export function isHtmlWhitespace(code: number): boolean {
  return code === 9 || code === 10 || code === 12 || code === 13 || code === 32;
}

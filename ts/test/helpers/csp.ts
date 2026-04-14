import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';

export function assertDocumentTagNonces(
  html: string,
  nonce: string,
  minimumStyleTags: number,
  minimumScriptTags: number,
): void {
  const dom = new JSDOM(html);

  try {
    const styleTags = Array.from(dom.window.document.querySelectorAll('style'));
    const scriptTags = Array.from(
      dom.window.document.querySelectorAll('script'),
    );

    assert.ok(styleTags.length >= minimumStyleTags);
    assert.ok(scriptTags.length >= minimumScriptTags);

    for (const tag of [...styleTags, ...scriptTags]) {
      assert.equal(
        tag.getAttribute('nonce'),
        nonce,
        `missing nonce on tag: ${tag.outerHTML}`,
      );
    }
  } finally {
    dom.window.close();
  }
}

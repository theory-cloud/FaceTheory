import assert from 'node:assert/strict';
import test from 'node:test';

import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { Button, Layout } from 'antd';
import * as React from 'react';
import { createServer } from 'vite';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import { createAntdEmotionTokenIntegration } from '../../src/react/antd-emotion.js';
import { createAntdIntegration } from '../../src/react/antd.js';
import { createEmotionIntegration } from '../../src/react/emotion.js';

const execFileAsync = promisify(execFile);

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

test('portal reference: SSR + hydration renders real portal components', async (t) => {
  const portalRoot = path.resolve('..', 'reference', 'paytheory-portal');
  const portalSrc = path.resolve(portalRoot, 'src');
  const portalNodeModules = path.resolve(portalRoot, 'node_modules');

  if (!(await exists(portalSrc))) {
    t.skip(`missing portal reference at ${portalSrc}`);
    return;
  }

  const stubsRoot = path.resolve('test/portal-stubs');

  let createdNodeModulesLink = false;
  if (!(await exists(portalNodeModules))) {
    try {
      await symlink(path.resolve('node_modules'), portalNodeModules, 'dir');
      createdNodeModulesLink = true;
    } catch (err) {
      t.skip(`could not create node_modules link at ${portalNodeModules}: ${String(err)}`);
      return;
    }
  }

  let vite: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    vite = await createServer({
      root: portalRoot,
      configFile: false,
      appType: 'custom',
      logLevel: 'error',
      clearScreen: false,
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      esbuild: { jsx: 'automatic', jsxImportSource: '@emotion/react' },
      resolve: {
        alias: [
          { find: '~/hooks/useAnalytics', replacement: path.resolve(stubsRoot, 'useAnalytics.ts') },
          { find: '~/utils/analytics', replacement: path.resolve(stubsRoot, 'useAnalytics.ts') },
          { find: '~/i18n', replacement: path.resolve(stubsRoot, 'i18n.ts') },
          { find: '~/hooks/useTranslation', replacement: path.resolve(stubsRoot, 'useTranslation.ts') },
          { find: '~/providers/Notifications/hook', replacement: path.resolve(stubsRoot, 'notifications-hook.ts') },
          { find: '~/providers/Permissions/hook', replacement: path.resolve(stubsRoot, 'permissions-hook.ts') },
          { find: '~/utils/format-currency', replacement: path.resolve(stubsRoot, 'format-currency.ts') },
          { find: '~/utils/masks/digit', replacement: path.resolve(stubsRoot, 'digit-mask.ts') },
          { find: '~/constants/date-filter', replacement: path.resolve(stubsRoot, 'date-filter.ts') },
          { find: 'react-router', replacement: path.resolve(stubsRoot, 'react-router.ts') },
          { find: 'react-transition-group', replacement: path.resolve(stubsRoot, 'react-transition-group.tsx') },
          { find: '@ant-design/icons', replacement: path.resolve(stubsRoot, 'ant-design-icons.tsx') },
          { find: 'classnames', replacement: path.resolve(stubsRoot, 'classnames.ts') },
          { find: 'dayjs', replacement: path.resolve(stubsRoot, 'dayjs.ts') },
          { find: 'lodash', replacement: path.resolve(stubsRoot, 'lodash.ts') },
          { find: 'i18next', replacement: path.resolve(stubsRoot, 'i18next.ts') },
          { find: '~', replacement: portalSrc },
        ],
      },
      optimizeDeps: { disabled: true },
    });

    const lightThemeRaw = await readFile(path.resolve(portalSrc, 'assets/theme/light.json'), 'utf8');
    const lightTheme = JSON.parse(lightThemeRaw) as unknown;

    const { ScreenHeader } = (await vite.ssrLoadModule('/src/components/layout/ScreenHeader/index.tsx')) as any;
    const { NavigationMenu } = (await vite.ssrLoadModule('/src/components/NavigationMenu/index.tsx')) as any;
    const { FilteredTable } = (await vite.ssrLoadModule('/src/components/FilteredTable/index.tsx')) as any;
    const { Drawer } = (await vite.ssrLoadModule('/src/components/Drawer/index.tsx')) as any;
    const { FilterText } = (await vite.ssrLoadModule('/src/components/FilterText/index.tsx')) as any;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('unexpected fetch during portal reference fixture');
    }) as any;

    try {
      const app = createFaceApp({
        faces: [
          createReactFace({
            route: '/',
            mode: 'ssr',
            render: () =>
              React.createElement(
                'div',
                { id: 'root' },
                React.createElement(
                  Layout,
                  { hasSider: true },
                  React.createElement(
                    Layout.Sider,
                    { width: 260 },
                    React.createElement(NavigationMenu, null),
                  ),
                  React.createElement(
                    Layout.Content,
                    { style: { padding: 16 } },
                    React.createElement(ScreenHeader, {
                      title: 'Dashboard',
                      description: 'Portal header',
                      action: React.createElement(Button, { type: 'primary' }, 'Action'),
                    }),
                    React.createElement(FilterText, {
                      label: 'Search',
                      popoverTitle: 'Search',
                      filter: '',
                      onChangeFilter: () => {},
                    }),
                    React.createElement(FilteredTable, {
                      data: [{ key: '1', name: 'Alice' }],
                      totalRows: 1,
                      columns: [{ title: 'Name', dataIndex: 'name' }],
                    }),
                    React.createElement(Drawer, {
                      open: false,
                      title: 'Drawer',
                      onClose: () => {},
                      children: React.createElement('div', null, 'Drawer body'),
                    }),
                  ),
                ),
              ),
            renderOptions: {
              integrations: [
                createAntdEmotionTokenIntegration(),
                createAntdIntegration({ hashed: false, baseTheme: lightTheme as any }),
                createEmotionIntegration(),
              ],
            },
          }),
        ],
      });

      const resp = await app.handle({ method: 'GET', path: '/', cspNonce: 'nonce-portal-ref' });
      const html = new TextDecoder().decode(resp.body as Uint8Array);

      assert.ok(html.includes('Dashboard'));
      assert.ok(html.includes('Portal header'));
      assert.ok(html.includes('<style'));
      assert.ok(html.includes('data-emotion='));
      assert.ok(html.includes('data-rc-order=') || html.includes('data-rc-priority='));
      assert.ok(html.includes('nonce="nonce-portal-ref"'));

      const tmp = await mkdtemp(path.join(tmpdir(), 'facetheory-portal-ref-'));
      const htmlPath = path.join(tmp, 'ssr.html');
      const hydrateScript = path.resolve('test/helpers/portal-reference-hydrate.js');

      try {
        await writeFile(htmlPath, html);
        await execFileAsync(process.execPath, [hydrateScript, portalRoot, htmlPath, stubsRoot], {
          cwd: process.cwd(),
          maxBuffer: 10 * 1024 * 1024,
        });
      } catch (err: any) {
        const stdout = typeof err?.stdout === 'string' ? err.stdout : '';
        const stderr = typeof err?.stderr === 'string' ? err.stderr : '';
        assert.fail(
          `portal hydration subprocess failed\n${stderr}${stderr ? '\n' : ''}${stdout}`,
        );
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    await vite?.close();
    if (createdNodeModulesLink) {
      await rm(portalNodeModules, { recursive: true, force: true });
    }
  }
});

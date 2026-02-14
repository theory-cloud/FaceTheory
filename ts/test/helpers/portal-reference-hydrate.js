import { readFile, rm, stat, symlink } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { inspect } from 'node:util';

import { JSDOM } from 'jsdom';

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function flushEventLoop() {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r, 0));
}

function installDomGlobals(dom) {
  function setGlobal(name, value) {
    try {
      globalThis[name] = value;
    } catch {
      Object.defineProperty(globalThis, name, {
        value,
        configurable: true,
        writable: true,
      });
    }
  }

  setGlobal('window', dom.window);
  setGlobal('document', dom.window.document);
  setGlobal('navigator', dom.window.navigator);

  setGlobal('HTMLElement', dom.window.HTMLElement);
  setGlobal('SVGElement', dom.window.SVGElement);
  setGlobal('Element', dom.window.Element);
  setGlobal('Node', dom.window.Node);
  setGlobal('MutationObserver', dom.window.MutationObserver);
  setGlobal('CustomEvent', dom.window.CustomEvent);
  setGlobal('Event', dom.window.Event);
  const originalGetComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  dom.window.getComputedStyle = (elt, _pseudoElt) => originalGetComputedStyle(elt);
  setGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));

  dom.window.matchMedia =
    dom.window.matchMedia ??
    (() => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

  globalThis.ResizeObserver =
    globalThis.ResizeObserver ??
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  dom.window.ResizeObserver = globalThis.ResizeObserver;

  dom.window.requestAnimationFrame =
    dom.window.requestAnimationFrame ?? ((cb) => setTimeout(cb, 0));
  dom.window.cancelAnimationFrame =
    dom.window.cancelAnimationFrame ?? ((id) => clearTimeout(id));
}

function formatConsoleArgs(args) {
  return args.map((arg) => inspect(arg, { depth: 5 })).join(' ');
}

async function main() {
  const [portalRootArg, htmlPathArg, stubsRootArg] = process.argv.slice(2);
  if (!portalRootArg || !htmlPathArg || !stubsRootArg) {
    throw new Error(
      'Usage: node portal-reference-hydrate.js <portalRoot> <htmlPath> <stubsRoot>',
    );
  }

  const portalRoot = path.resolve(portalRootArg);
  const portalSrc = path.resolve(portalRoot, 'src');
  const htmlPath = path.resolve(htmlPathArg);
  const stubsRoot = path.resolve(stubsRootArg);
  const portalNodeModules = path.resolve(portalRoot, 'node_modules');

  if (!(await exists(portalSrc))) throw new Error(`missing portal source at ${portalSrc}`);
  if (!(await exists(htmlPath))) throw new Error(`missing HTML file at ${htmlPath}`);
  if (!(await exists(stubsRoot))) throw new Error(`missing stubs at ${stubsRoot}`);

  let createdNodeModulesLink = false;
  if (!(await exists(portalNodeModules))) {
    await symlink(path.resolve('node_modules'), portalNodeModules, 'dir');
    createdNodeModulesLink = true;
  }

  const html = await readFile(htmlPath, 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/' });
  installDomGlobals(dom);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error('unexpected fetch during portal reference hydration');
  }) ;

  const errors = [];
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const originalWindowConsoleError = dom.window.console.error;
  const originalWindowConsoleWarn = dom.window.console.warn;

  console.error = (...args) => errors.push(args);
  console.warn = (...args) => errors.push(args);
  dom.window.console.error = (...args) => errors.push(args);
  dom.window.console.warn = (...args) => errors.push(args);

  let vite;
  let root;
  try {
    const React = await import('react');
    const { hydrateRoot } = await import('react-dom/client');
    const createEmotionCache = (await import('@emotion/cache')).default;
    const { CacheProvider, ThemeProvider: EmotionThemeProvider } = await import('@emotion/react');
    const { createCache, StyleProvider } = await import('@ant-design/cssinjs');
    const { Button, ConfigProvider, Layout, theme: antdTheme } = await import('antd');
    const { createServer } = await import('vite');

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
    const lightTheme = JSON.parse(lightThemeRaw);

    const { ScreenHeader } = await vite.ssrLoadModule('/src/components/layout/ScreenHeader/index.tsx');
    const { NavigationMenu } = await vite.ssrLoadModule('/src/components/NavigationMenu/index.tsx');
    const { FilteredTable } = await vite.ssrLoadModule('/src/components/FilteredTable/index.tsx');
    const { Drawer } = await vite.ssrLoadModule('/src/components/Drawer/index.tsx');
    const { FilterText } = await vite.ssrLoadModule('/src/components/FilterText/index.tsx');

    const container = dom.window.document.getElementById('root');
    if (!container) throw new Error('missing #root container');

    const emotionCache = createEmotionCache({ key: 'css' });
    emotionCache.sheet.container = dom.window.document.head;
    const emotionStyles = dom.window.document.querySelectorAll('style[data-emotion]');
    emotionCache.sheet.hydrate(Array.from(emotionStyles));

    const antdCache = createCache();

    const AntdTokenBridge = ({ children }) => {
      const { token } = antdTheme.useToken();
      return React.createElement(EmotionThemeProvider, { theme: token, children });
    };

    const clientTree = React.createElement(
      CacheProvider,
      { value: emotionCache },
      React.createElement(
        StyleProvider,
        { cache: antdCache },
        React.createElement(
          ConfigProvider,
          { theme: { ...lightTheme, hashed: false } },
          React.createElement(
            AntdTokenBridge,
            null,
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
        ),
      ),
    );

    root = hydrateRoot(container, clientTree);
    await flushEventLoop();

    if (errors.length) {
      throw new Error(
        `hydration emitted ${errors.length} warnings/errors\n` +
          errors
            .slice(0, 10)
            .map((e) => formatConsoleArgs(e))
            .join('\n'),
      );
    }

    root.unmount();
    await flushEventLoop();
  } finally {
    try {
      root?.unmount?.();
    } catch (err) {
      void err;
    }
    await vite?.close?.();
    if (createdNodeModulesLink) await rm(portalNodeModules, { recursive: true, force: true });

    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    dom.window.console.error = originalWindowConsoleError;
    dom.window.console.warn = originalWindowConsoleWarn;
    dom.window.close();
    globalThis.fetch = originalFetch;
  }
}

try {
  await main();
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}

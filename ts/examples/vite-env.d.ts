declare module '*.css' {
  const css: string;
  export default css;
}

declare module '*.svg' {
  const url: string;
  export default url;
}

declare module 'rollup-plugin-svelte' {
  import type { Plugin } from 'rollup';
  import type { CompileOptions } from 'svelte/compiler';

  interface Options {
    emitCss: boolean;
    compilerOptions: CompileOptions;
  }

  function svelte(options?: Partial<Options>): Plugin;
  export = svelte;
}

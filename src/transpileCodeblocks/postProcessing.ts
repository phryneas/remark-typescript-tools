import type { VirtualFiles } from './plugin.js';
import type { Options as PrettierOptions } from 'prettier';
import prettierSync from '@prettier/sync';

export function defaultPostProcessTs(
  files: VirtualFiles,
  parentFile?: string
): VirtualFiles {
  return fromEntries(
    Object.entries(files).map(([name, file]) => {
      const prettyCode = prettify(file.code, name, parentFile || name);

      return [
        name,
        {
          ...file,
          code: prettyCode.trim(),
        },
      ];
    })
  );
}

export function defaultPostProcessTranspiledJs(
  files: VirtualFiles,
  parentFile?: string
): VirtualFiles {
  return fromEntries(
    Object.entries(files).map(([name, file]) => {
      const mangledCode = file.code.replace(
        /(\n\s*|)\/\/ (@ts-ignore|@ts-expect-error).*$/gm,
        ''
      );
      const prettyCode = prettify(mangledCode, name, parentFile || name);

      return [
        name.replace(/.t(sx?)$/, '.j$1'),
        {
          ...file,
          code: prettyCode.trim(),
        },
      ];
    })
  );
}

let lastConfig: PrettierOptions | null;
let lastParentFile: string;

/**
 *
 * @param {string} sourceCode
 * @param {string} fileName
 * @param {string} parentFile
 */
function prettify(sourceCode: string, fileName: string, parentFile: string) {
  if (lastParentFile !== parentFile) {
    lastConfig = prettierSync.resolveConfig(parentFile);
  }
  if (!lastConfig) {
    console.error(
      `no prettier config found for ${parentFile}, skipping prettier step`
    );
    return sourceCode;
  }
  return prettierSync.format(sourceCode, {
    ...lastConfig,
    filepath: fileName,
  });
}

function fromEntries<T>(entries: Array<[string, T]>): Record<string, T> {
  const ret: Record<string, T> = {};
  for (const [key, value] of entries) {
    ret[key] = value;
  }
  return ret;
}

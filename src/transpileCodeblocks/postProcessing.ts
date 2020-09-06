import { VirtualFiles } from './plugin';
import prettier from 'prettier';

export function postProcessTs(
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
          code: prettyCode,
        },
      ];
    })
  );
}

export function postProcessTranspiledJs(
  files: VirtualFiles,
  parentFile?: string
): VirtualFiles {
  return fromEntries(
    Object.entries(files).map(([name, file]) => {
      const mangledCode = file.code
        .replace(/(\n\s*|)\/\/ (@ts-ignore|@ts-expect-error).*$/gm, '')
        .trim();
      const prettyCode = prettify(mangledCode, name, parentFile || name);

      return [
        name,
        {
          ...file,
          code: prettyCode,
        },
      ];
    })
  );
}

let lastConfig: prettier.Options | null;
let lastParentFile: string;

/**
 *
 * @param {string} sourceCode
 * @param {string} fileName
 * @param {string} parentFile
 */
function prettify(sourceCode: string, fileName: string, parentFile: string) {
  if (lastParentFile !== parentFile) {
    lastConfig = prettier.resolveConfig.sync(parentFile);
  }
  if (!lastConfig) {
    console.error(
      `no prettier config found for ${parentFile}, skipping prettier step`
    );
    return sourceCode;
  }
  return prettier.format(sourceCode, {
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

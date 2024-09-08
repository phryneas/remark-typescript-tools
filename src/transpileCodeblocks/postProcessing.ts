import type { VirtualFiles } from './plugin.js';
import prettier from 'prettier';

export async function defaultPostProcessTs(
  files: VirtualFiles,
  parentFile?: string
): Promise<VirtualFiles> {
  return fromEntries(
    await Promise.all(
      Object.entries(files).map(async ([name, file]) => {
        const prettyCode = await prettify(file.code, name, parentFile || name);

        return [
          name,
          {
            ...file,
            code: prettyCode.trim(),
          },
        ];
      })
    )
  );
}

export async function defaultPostProcessTranspiledJs(
  files: VirtualFiles,
  parentFile?: string
): Promise<VirtualFiles> {
  return fromEntries(
    await Promise.all(
      Object.entries(files).map(async ([name, file]) => {
        const mangledCode = file.code.replace(
          /(\n\s*|)\/\/ (@ts-ignore|@ts-expect-error).*$/gm,
          ''
        );
        const prettyCode = await prettify(
          mangledCode,
          name,
          parentFile || name
        );

        return [
          name.replace(/.t(sx?)$/, '.j$1'),
          {
            ...file,
            code: prettyCode.trim(),
          },
        ];
      })
    )
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
async function prettify(
  sourceCode: string,
  fileName: string,
  parentFile: string
) {
  if (lastParentFile !== parentFile) {
    lastConfig = await prettier.resolveConfig(parentFile);
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

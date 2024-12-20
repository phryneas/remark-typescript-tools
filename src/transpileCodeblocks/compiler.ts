import ts from 'typescript';
import { normalize, dirname, join } from 'node:path';

import type { VirtualFiles, VirtualFile } from './plugin.js';

export type Diagnostic =
  | { line: number; character: number; message: string }
  | { line?: undefined; character?: undefined; message: string };

export interface TranspiledFile extends VirtualFile {
  diagnostics: Array<Diagnostic>;
}

export type TranspiledFiles = Record<string, TranspiledFile>;

export interface ExternalResolution {
  resolvedPath: string;
  packageId: ts.PackageId;
}

export interface CompilerSettings {
  tsconfig: string;
  externalResolutions: Record<string, ExternalResolution>;
  /**
   * Allows transforming the virtual filepath for codeblocks.
   * This allows the files to resolve node modules from a different location
   * to their own directory.
   */
  transformVirtualFilepath?: (filepath: string) => string;
}

export class Compiler {
  private service: ts.LanguageService;
  private compilerOptions: ts.CompilerOptions;
  private compilerHost: ReturnType<typeof createCompilerHost>;

  constructor(settings: CompilerSettings) {
    const configFile = ts.readConfigFile(settings.tsconfig, ts.sys.readFile);
    this.compilerOptions = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      './'
    ).options;

    this.compilerHost = createCompilerHost(
      this.compilerOptions,
      settings.externalResolutions
    );
    this.service = ts.createLanguageService(
      this.compilerHost,
      ts.createDocumentRegistry()
    );
  }

  public compile(files: VirtualFiles) {
    this.compilerHost.setScriptFileNames([]);
    for (let [fileName, { code }] of Object.entries(files)) {
      code = code.replace(/^$/gm, '//__NEWLINE__');
      this.compilerHost.writeFile(fileName, code);
    }
    const filenames = Object.keys(files);
    this.compilerHost.setScriptFileNames(filenames);

    const returnFiles: TranspiledFiles = {};

    for (const [fileName] of Object.entries(files)) {
      const emitResult = this.service.getEmitOutput(fileName);
      const emittedFile = emitResult.outputFiles.find(
        ({ name }) => name.endsWith('.js') || name.endsWith('.jsx')
      );
      const transpiledCode = emittedFile
        ? emittedFile.text.replace(/\/\/__NEWLINE__/g, '')
        : '';

      const allDiagnostics = this.service
        .getCompilerOptionsDiagnostics()
        .concat(this.service.getSyntacticDiagnostics(fileName))
        .concat(this.service.getSemanticDiagnostics(fileName));

      const diagnostics = allDiagnostics.map((diagnostic) => {
        const message = ts.flattenDiagnosticMessageText(
          diagnostic.messageText,
          '\n'
        );
        if (diagnostic.file && diagnostic.start) {
          const { line, character } =
            diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
          return { line, character, message };
        }
        return { message };
      });
      returnFiles[fileName] = {
        ...files[fileName],
        code: transpiledCode,
        diagnostics,
      };
    }

    return returnFiles;
  }
}

type ModifiedCompilerHost = ts.LanguageServiceHost &
  ts.ModuleResolutionHost &
  Required<Pick<ts.LanguageServiceHost, 'writeFile'>> & {
    setScriptFileNames(files: string[]): void;
  };

function createCompilerHost(
  compilerOptions: ts.CompilerOptions,
  externalResolutions: CompilerSettings['externalResolutions']
): ModifiedCompilerHost {
  const virtualFiles: Record<string, { contents: string; version: number }> =
    {};
  let scriptFileNames: string[] = [];

  let resolvedModules: Record<string, ts.ResolvedModuleFull | undefined> = {};

  let cachedFiles: Record<string, string | undefined> = {};

  const host: ModifiedCompilerHost = {
    ...ts.createCompilerHost(compilerOptions),
    getCompilationSettings() {
      return compilerOptions;
    },
    fileExists(fileName) {
      const result =
        !!virtualFiles[normalize(fileName)] || ts.sys.fileExists(fileName);
      return result;
    },
    readFile(fileName: string) {
      const normalized = normalize(fileName);
      const virtual = virtualFiles[normalized];

      if (virtual) {
        return virtual.contents;
      }

      if (normalized in cachedFiles) {
        const cacheResult = cachedFiles[fileName];

        if (cacheResult) {
          return cacheResult;
        }
      }

      const contents = ts.sys.readFile(fileName);

      if (contents) {
        cachedFiles[normalized] = contents;
      }

      return contents;
    },
    writeFile(fileName, contents) {
      fileName = normalize(fileName);
      let version = virtualFiles[fileName] ? virtualFiles[fileName].version : 1;
      if (
        virtualFiles[fileName] &&
        virtualFiles[fileName].contents !== contents
      ) {
        version++;
      }
      virtualFiles[fileName] = { contents, version };
    },
    directoryExists(dirName) {
      const normalized = normalize(dirName + '/');
      return (
        scriptFileNames.some((fileName) => fileName.startsWith(normalized)) ||
        ts.sys.directoryExists(dirName)
      );
    },
    setScriptFileNames(files) {
      scriptFileNames = files.map(normalize);
    },
    getScriptFileNames() {
      return scriptFileNames;
    },
    getScriptSnapshot(fileName) {
      const contents = this.readFile(fileName);
      return contents ? ts.ScriptSnapshot.fromString(contents) : undefined;
    },
    getScriptVersion(fileName) {
      const virtual = virtualFiles[normalize(fileName)];
      return virtual
        ? virtual.version.toString()
        : String(
            (ts.sys.getModifiedTime && ts.sys.getModifiedTime(fileName)) ||
              'unknown, will not update without restart'
          );
    },
    resolveModuleNames(moduleNames, containingFile) {
      const mappedModules = moduleNames.map((moduleName) => {
        if (moduleName in externalResolutions) {
          const resolved = externalResolutions[moduleName];

          const resolvedModule = ts.resolveModuleName(
            resolved.resolvedPath,
            containingFile,
            compilerOptions,
            this
          ).resolvedModule;
          if (!resolvedModule) {
            throw new Error(`external resolution ${moduleName} not found`);
          }
          return {
            ...resolvedModule,
            packageId: resolved.packageId,
          };
        }

        // Files that are local to the code block, like './api', should be resolved
        // more directly rather than triggering a full module resolution search.
        if (
          moduleName.startsWith('.') &&
          containingFile.includes('codeBlock')
        ) {
          const containingDir = dirname(containingFile);
          const newModuleName = join(containingDir, moduleName);
          const resolvedModule = ts.resolveModuleName(
            newModuleName,
            containingFile,
            compilerOptions,
            this
          ).resolvedModule;

          return resolvedModule;
        }

        const key = `${containingFile}|${moduleName}`;

        if (key in resolvedModules) {
          return resolvedModules[key];
        }

        const resolved = ts.resolveModuleName(
          moduleName,
          containingFile,
          compilerOptions,
          this
        ).resolvedModule;

        resolvedModules[key] = resolved;

        return resolved;
      });

      return mappedModules;
    },
  };

  return host;
}

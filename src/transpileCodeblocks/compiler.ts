import ts from 'typescript';
import path from 'path';

import { VirtualFiles, VirtualFile } from './plugin';

export type Diagnostic =
  | { line: number; character: number; message: string }
  | { line?: undefined; character?: undefined; message: string };

export interface TranspiledFile extends VirtualFile {
  diagnostics: Array<Diagnostic>;
}

export type TranspiledFiles = Record<string, TranspiledFile>;

export interface CompilerSettings {
  tsconfig: string;
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

    this.compilerHost = createCompilerHost(this.compilerOptions);
    this.service = ts.createLanguageService(
      this.compilerHost,
      ts.createDocumentRegistry()
    );
  }

  public compile(files: VirtualFiles) {
    // console.log(compilerOptions)

    this.compilerHost.setScriptFileNames([]);
    for (let [fileName, { code }] of Object.entries(files)) {
      code = code.replace(/^$/gm, '//__NEWLINE__');
      this.compilerHost.writeFile(fileName, code);
    }
    this.compilerHost.setScriptFileNames(Object.keys(files));

    let returnFiles: TranspiledFiles = {};

    for (const [fileName] of Object.entries(files)) {
      let emitResult = this.service.getEmitOutput(fileName);
      let transpiledCode = emitResult.outputFiles[0]
        ? emitResult.outputFiles[0].text.replace(/\/\/__NEWLINE__/g, '')
        : '';

      let allDiagnostics = this.service
        .getCompilerOptionsDiagnostics()
        .concat(this.service.getSyntacticDiagnostics(fileName))
        .concat(this.service.getSemanticDiagnostics(fileName));

      const diagnostics = allDiagnostics.map((diagnostic) => {
        let message = ts.flattenDiagnosticMessageText(
          diagnostic.messageText,
          '\n'
        );
        if (diagnostic.file && diagnostic.start) {
          let {
            line,
            character,
          } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
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

function createCompilerHost(
  compilerOptions: ts.CompilerOptions
): ts.LanguageServiceHost &
  ts.ModuleResolutionHost &
  Required<Pick<ts.LanguageServiceHost, 'writeFile'>> & {
    setScriptFileNames(files: string[]): void;
  } {
  const virtualFiles: Record<
    string,
    { contents: string; version: number }
  > = {};
  let scriptFileNames: string[] = [];

  return {
    ...ts.createCompilerHost(compilerOptions),
    getCompilationSettings() {
      return compilerOptions;
    },
    fileExists(fileName) {
      // console.log('fileExists', fileName)
      return !!virtualFiles[fileName] || ts.sys.fileExists(fileName);
    },
    readFile(fileName: string) {
      // console.log('readFile', fileName)
      return virtualFiles[fileName]
        ? virtualFiles[fileName].contents
        : ts.sys.readFile(fileName);
    },
    writeFile(fileName, contents) {
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
      return (
        scriptFileNames.some((fileName) =>
          fileName.startsWith(dirName + '/')
        ) || ts.sys.directoryExists(dirName)
      );
    },
    setScriptFileNames(files) {
      // console.log({ virtualFiles, files })
      scriptFileNames = files;
    },
    getScriptFileNames() {
      return scriptFileNames;
    },
    getScriptSnapshot(fileName) {
      const contents = this.readFile(fileName);
      return contents ? ts.ScriptSnapshot.fromString(contents) : undefined;
    },
    getScriptVersion(fileName) {
      return virtualFiles[fileName]
        ? virtualFiles[fileName].version.toString()
        : String(
            (ts.sys.getModifiedTime && ts.sys.getModifiedTime(fileName)) ||
              'unknown, will not update without restart'
          );
    },
    resolveModuleNames(moduleNames, containingFile) {
      return moduleNames.map((moduleName) => {
        if (moduleName === '@reduxjs/toolkit') {
          moduleName = path.resolve(__dirname, '../../../src');

          const resolvedModule = ts.resolveModuleName(
            moduleName,
            containingFile,
            compilerOptions,
            this
          ).resolvedModule;
          if (!resolvedModule) {
            throw new Error('RTK source code not found!');
          }
          return {
            ...resolvedModule,
            packageId: {
              name: '@reduxjs/toolkit',
              subModuleName: 'dist/typings.d.ts',
              version: '99.0.0',
            },
          };
        }

        return ts.resolveModuleName(
          moduleName,
          containingFile,
          compilerOptions,
          this
        ).resolvedModule;
      });
    },
  };
}

import ts from 'typescript';
import { normalize } from 'path';

import { VirtualFiles, VirtualFile } from './plugin';

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
    // console.log(compilerOptions)

    this.compilerHost.setScriptFileNames([]);
    for (let [fileName, { code }] of Object.entries(files)) {
      code = code.replace(/^$/gm, '//__NEWLINE__');
      this.compilerHost.writeFile(fileName, code);
    }
    this.compilerHost.setScriptFileNames(Object.keys(files));

    const returnFiles: TranspiledFiles = {};

    for (const [fileName] of Object.entries(files)) {
      const emitResult = this.service.getEmitOutput(fileName);
      const emittedFile = emitResult.outputFiles.find(
        ({ name }) => !name.endsWith('.js.map') && name.endsWith('.js')
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
          const {
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
  compilerOptions: ts.CompilerOptions,
  externalResolutions: CompilerSettings['externalResolutions']
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
      return !!virtualFiles[normalize(fileName)] || ts.sys.fileExists(fileName);
    },
    readFile(fileName: string) {
      // console.log('readFile', fileName)
      const virtual = virtualFiles[normalize(fileName)];
      return virtual ? virtual.contents : ts.sys.readFile(fileName);
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
      // console.log({ virtualFiles, scriptFileNames })
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
      return moduleNames.map((moduleName) => {
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

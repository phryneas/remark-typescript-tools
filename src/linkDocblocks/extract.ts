import ts from 'typescript';
import path from 'path';
import * as tsdoc from '@microsoft/tsdoc';

import { getJSDocCommentRanges } from './utils';

export interface ExtractorSettings {
  tsconfig: string;
  basedir: string;
  rootFiles: string[];
}

export class Extractor {
  program: ts.Program;
  basedir: string;

  constructor({ tsconfig, rootFiles, basedir }: ExtractorSettings) {
    this.basedir = basedir;

    const configFile = ts.readConfigFile(tsconfig, ts.sys.readFile);
    const compilerOptions = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      './'
    ).options;

    const compilerHost = ts.createCompilerHost(compilerOptions);

    this.program = ts.createProgram(
      rootFiles.map((file) => path.resolve(basedir, file)),
      compilerOptions,
      compilerHost
    );
  }

  findTokens(token: string, node: ts.Node) {
    const [lookFor, ...tail] = token.split('.');
    const found: ts.Node[] = [];
    node.forEachChild((child: ts.Node & { name?: ts.Node }) => {
      if (ts.isVariableStatement(child)) {
        found.push(...this.findTokens(token, child.declarationList));
        if (child.declarationList.declarations.length === 1) {
          const name = child.declarationList.declarations[0].name;
          if (name && ts.isIdentifier(name) && name.escapedText === lookFor) {
            // push the whole declarationList if it contains only one declaration, for "outside style"
            found.push(child);
          }
        }
        return;
      }

      const name = child.name;
      if (name && ts.isIdentifier(name) && name.escapedText === lookFor) {
        if (lookFor === token) {
          if (ts.isVariableDeclaration(child) && child.initializer) {
            // push the initializer for "inside" style
            found.push(child.initializer);
          }
          found.push(child);
        } else {
          found.push(...this.findTokens(tail.join('.'), child));
        }
      }
    });
    return found;
  }

  getComment(token: string, fileName = 'index.ts', overload = 0) {
    const inputFileName = path.resolve(this.basedir, fileName);
    const sourceFile = this.program.getSourceFile(inputFileName);
    if (!sourceFile) {
      throw new Error(
        `Error retrieving source file ${sourceFile} (looked for ${fileName} in ${this.basedir})`
      );
    }

    const foundComments = [];

    const buffer = sourceFile.getFullText();

    for (const node of this.findTokens(token, sourceFile)) {
      const comments = getJSDocCommentRanges(node, buffer);

      if (comments.length > 0) {
        for (const comment of comments) {
          foundComments.push({
            compilerNode: node,
            textRange: tsdoc.TextRange.fromStringRange(
              buffer,
              comment.pos,
              comment.end
            ),
          });
        }
      }
    }

    const customConfiguration = new tsdoc.TSDocConfiguration();

    customConfiguration.addTagDefinition(
      new tsdoc.TSDocTagDefinition({
        tagName: '@overloadSummary',
        syntaxKind: tsdoc.TSDocTagSyntaxKind.BlockTag,
      })
    );

    customConfiguration.addTagDefinition(
      new tsdoc.TSDocTagDefinition({
        tagName: '@overloadRemarks',
        syntaxKind: tsdoc.TSDocTagSyntaxKind.BlockTag,
      })
    );

    const tsdocParser = new tsdoc.TSDocParser(customConfiguration);

    const selectedOverload = foundComments[overload];
    if (!selectedOverload) {
      console.warn(
        `could not find overload ${overload} for ${token} in ${fileName}`
      );
      return null;
    }

    const parserContext = tsdocParser.parseRange(selectedOverload.textRange);
    const docComment = parserContext.docComment;
    return Object.assign(docComment, {
      parserContext,
      buffer: selectedOverload.textRange.buffer,
      overloadSummary: docComment.customBlocks.find(
        this.byTagName('@overloadSummary')
      ),
      overloadRemarks: docComment.customBlocks.find(
        this.byTagName('@overloadRemarks')
      ),
      examples: docComment.customBlocks.filter(this.byTagName('@example')),
    });
  }

  byTagName(name: string) {
    return (block: tsdoc.DocBlock) => block.blockTag.tagName === name;
  }
}

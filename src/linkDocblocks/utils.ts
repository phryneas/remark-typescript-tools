import ts from 'typescript';
import * as tsdoc from '@microsoft/tsdoc';

/**
 * Retrieves the JSDoc-style comments associated with a specific AST node.
 *
 * Based on ts.getJSDocCommentRanges() from the compiler.
 * https://github.com/Microsoft/TypeScript/blob/v3.0.3/src/compiler/utilities.ts#L924
 */
export function getJSDocCommentRanges(node: ts.Node, text: string) {
  /** @type {import('typescript').CommentRange[]} */
  const commentRanges: ts.CommentRange[] = [];

  switch (node.kind) {
    case ts.SyntaxKind.Parameter:
    case ts.SyntaxKind.TypeParameter:
    case ts.SyntaxKind.FunctionExpression:
    case ts.SyntaxKind.ArrowFunction:
    case ts.SyntaxKind.ParenthesizedExpression:
      commentRanges.push(
        ...(ts.getTrailingCommentRanges(text, node.pos) || [])
      );
      break;
  }
  commentRanges.push(...(ts.getLeadingCommentRanges(text, node.pos) || []));

  // True if the comment starts with '/**' but not if it is '/**/'
  return commentRanges.filter(
    (comment) =>
      text.charCodeAt(comment.pos + 1) ===
        0x2a /* ts.CharacterCodes.asterisk */ &&
      text.charCodeAt(comment.pos + 2) ===
        0x2a /* ts.CharacterCodes.asterisk */ &&
      text.charCodeAt(comment.pos + 3) !== 0x2f /* ts.CharacterCodes.slash */
  );
}

export function renderDocNode(
  docNode?: tsdoc.DocNode | tsdoc.DocNode[]
): string {
  if (!docNode) {
    return '';
  }
  if (Array.isArray(docNode)) {
    return docNode.map((node) => renderDocNode(node)).join('');
  }

  let result = '';
  if (docNode) {
    if (docNode instanceof tsdoc.DocFencedCode) {
      return (
        '```' + docNode.language + '\n' + docNode.code.toString() + '\n```'
      );
    }
    if (docNode instanceof tsdoc.DocExcerpt) {
      result += docNode.content.toString();
    }

    for (const childNode of docNode.getChildNodes()) {
      result += renderDocNode(childNode);
    }
  }
  return result;
}

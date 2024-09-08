import {unified} from 'unified';
import remarkParser from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { linkDocblocks, LinkDocblocksSettings } from '../src';
import { resolve } from 'path';
import {test} from 'node:test';

/**
 * Interface Test!
 * @remarks
 * Some more infos.
 */
export interface Test {
  /**
     * This is a function
     * @remarks
     * And it is nested!
     * @overloadSummary
     * Also, this is a special overload
     * @overloadRemarks
     * With some more description
     * @param foo - some info about the first parameter
     * @example
```ts
console.log("test")
```
     */
  nestedFunction(foo: string): void;
  /**
     * This is a function
     * @remarks
     * And it is nested!
     * @overloadSummary
     * Also, this is a special overload that takes a second parameter
     * @overloadRemarks
     * With some more extra description
     * @param foo - some info about the first parameter
     * @param bar - and some info about the second parameter
     * @example
```ts
console.log("test")
```
     */
  nestedFunction(foo: string, bar: number): void;
}

/**
 * This is an arrow function - outside comment style
 * @remarks
 * It's very pointy, but also fat!
 */
export const arrowFunction1 = () => {};

export const /**
   * This is an arrow function - medium comment style
   * @remarks
   * It's very pointy, but also fat!
   */ arrowFunction2 = () => {};

export const arrowFunction3 = /**
 * This is an arrow function - inside comment style
 * @remarks
 * It's very pointy, but also fat!
 */ () => {};

/**
 * This is an arrow function - outside comment style
 * @remarks
 * This feels less important
 */
export const /**
   * This is an arrow function - medium comment style
   * @remarks
   * This feels less important
   */ arrowFunction4 = /**
   * This is an arrow function - inside comment style
   * @remarks
   * This should take precedence
   */ () => {};

const defaultSettings: LinkDocblocksSettings = {
  extractorSettings: {
    tsconfig: resolve(import.meta.dirname, '..', 'tsconfig.json'),
    basedir: resolve(import.meta.dirname, '..'),
    rootFiles: ['test/linkDocblocks.test.ts'],
  },
};

function getParser(settings = defaultSettings) {
  return unified()
    .use(remarkParser)
    .use(linkDocblocks, settings)
    .use(remarkStringify);
}

test('parsing single sections of an interface docblock', async (t) => {
  const result = await getParser().process(
`
# Infos about Test
[summary](docblock://test/linkDocblocks.test.ts?token=Test)

## Some more remarks
[remarks](docblock://test/linkDocblocks.test.ts?token=Test)
`);

  t.assert.equal(result.value, `# Infos about Test

Interface Test!

## Some more remarks

Some more infos.
`);
});

test('parsing multiple sections of an interface docblock', async (t) => {
  const result = await getParser().process(`
# Infos about Test
[summary,remarks](docblock://test/linkDocblocks.test.ts?token=Test)
`);

  t.assert.equal(result.value, 
`# Infos about Test

Interface Test!

Some more infos.
`);
});

test('parsing multiple sections of a docblock at a nested position', async (t) => {
  const result = await getParser().process(`
# Infos about Test
[summary,remarks](docblock://test/linkDocblocks.test.ts?token=Test.nestedFunction)
`);

  t.assert.equal(result.value, 
`# Infos about Test

This is a function

And it is nested!
`);
});

test('parsing multiple sections of a docblock at a nested position', async (t) => {
  const result = await getParser().process(`
# Infos about Test.nestedFunction
[summary,remarks](docblock://test/linkDocblocks.test.ts?token=Test.nestedFunction)

# Overload 0
[overloadSummary,params,overloadRemarks,examples](docblock://test/linkDocblocks.test.ts?token=Test.nestedFunction&overload=0)

# Overload 1
[overloadSummary,params,overloadRemarks,examples](docblock://test/linkDocblocks.test.ts?token=Test.nestedFunction&overload=1)

`);
  t.assert.equal(result.value, 
`# Infos about Test.nestedFunction

This is a function

And it is nested!

# Overload 0

Also, this is a special overload

* **foo** some info about the first parameter

With some more description

\`\`\`ts
console.log("test")
\`\`\`

# Overload 1

Also, this is a special overload that takes a second parameter

* **foo** some info about the first parameter
* **bar** and some info about the second parameter

With some more extra description

\`\`\`ts
console.log("test")
\`\`\`
`);
});

test('const arrow function docblock1', async (t) => {
  const result = await getParser().process(`
# Infos about Test
[summary,remarks](docblock://test/linkDocblocks.test.ts?token=arrowFunction1)
`);

  t.assert.equal(result.value, 
`# Infos about Test

This is an arrow function - outside comment style

It's very pointy, but also fat!
`);
});

test('const arrow function docblock2', async (t) => {
  const result = await getParser().process(`
# Infos about Test
[summary,remarks](docblock://test/linkDocblocks.test.ts?token=arrowFunction2)
`);

  t.assert.equal(result.value, 
`# Infos about Test

This is an arrow function - medium comment style

It's very pointy, but also fat!
`);
});

test('const arrow function docblock3', async (t) => {
  const result = await getParser().process(`
# Infos about Test
[summary,remarks](docblock://test/linkDocblocks.test.ts?token=arrowFunction3)
`);

  t.assert.equal(result.value, 
`# Infos about Test

This is an arrow function - inside comment style

It's very pointy, but also fat!
`);
});

test('const arrow function docblock4', async (t) => {
  const result = await getParser().process(`
# Infos about Test
[summary,remarks](docblock://test/linkDocblocks.test.ts?token=arrowFunction4)
`);

  t.assert.equal(result.value, 
`# Infos about Test

This is an arrow function - inside comment style

This should take precedence
`);
});

/**
 * @example
 * ```ts
 * // codeblock-meta title=Foo
 * foo
 * ```
 *
 * ```ts
 * lalala
 * // codeblock-meta title=Bar
 * // codeblock-meta {1,2,3}
 * foo
 * ```
 */
export function exampleWithDocBlockMeta() {}

test('codeblock-meta comments are removed and added to meta', async (t) => {
  const result = await getParser().process(`
[examples](docblock://test/linkDocblocks.test.ts?token=exampleWithDocBlockMeta)
`);

  t.assert.equal(result.value, 
`\`\`\`ts title=Foo
foo
\`\`\`

\`\`\`ts title=Bar {1,2,3}
lalala
foo
\`\`\`
`);
});

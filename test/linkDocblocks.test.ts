import unified from 'unified';
import remarkParser from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { linkDocblocks, LinkDocblocksSettings } from '../src';
import { resolve } from 'path';

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

const defaultSettings: LinkDocblocksSettings = {
  extractorSettings: {
    tsconfig: resolve(__dirname, '..', 'tsconfig.json'),
    basedir: resolve(__dirname, '..'),
    rootFiles: ['test/linkDocblocks.test.ts'],
  },
};

function getParser(settings = defaultSettings) {
  return unified()
    .use(remarkParser)
    .use(linkDocblocks, settings)
    .use(remarkStringify);
}

test('parsing single sections of an interface docblock', async () => {
  const result = await getParser().process(`
# Infos about Test
[summary](docblock://test/linkDocblocks.test.ts?token=Test)

## Some more remarks
[remarks](docblock://test/linkDocblocks.test.ts?token=Test)
`);

  expect(result.contents).toMatchInlineSnapshot(`
    "# Infos about Test

    Interface Test!

    ## Some more remarks

    Some more infos.
    "
  `);
});

test('parsing multiple sections of an interface docblock', async () => {
  const result = await getParser().process(`
# Infos about Test
[summary,remarks](docblock://test/linkDocblocks.test.ts?token=Test)
`);

  expect(result.contents).toMatchInlineSnapshot(`
    "# Infos about Test

    Interface Test!

    Some more infos.
    "
  `);
});

test('parsing multiple sections of a docblock at a nested position', async () => {
  const result = await getParser().process(`
# Infos about Test
[summary,remarks](docblock://test/linkDocblocks.test.ts?token=Test.nestedFunction)
`);

  expect(result.contents).toMatchInlineSnapshot(`
    "# Infos about Test

    This is a function

    And it is nested!
    "
  `);
});

test('parsing multiple sections of a docblock at a nested position', async () => {
  const result = await getParser().process(`
# Infos about Test.nestedFunction
[summary,remarks](docblock://test/linkDocblocks.test.ts?token=Test.nestedFunction)

# Overload 0
[overloadSummary,params,overloadRemarks,examples](docblock://test/linkDocblocks.test.ts?token=Test.nestedFunction&overload=0)

# Overload 1
[overloadSummary,params,overloadRemarks,examples](docblock://test/linkDocblocks.test.ts?token=Test.nestedFunction&overload=1)

`);
  expect(result.contents).toMatchInlineSnapshot(`
    "# Infos about Test.nestedFunction

    This is a function

    And it is nested!

    # Overload 0

    Also, this is a special overload

    -   **foo** some info about the first parameter

    With some more description

    \`\`\`ts
    console.log(\\"test\\")

    \`\`\`

    # Overload 1

    Also, this is a special overload that takes a second parameter

    -   **foo** some info about the first parameter
    -   **bar** and some info about the second parameter

    With some more extra description

    \`\`\`ts
    console.log(\\"test\\")

    \`\`\`
    "
  `);
});

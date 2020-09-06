# remark-typescript-tools

## What is it?

`remark-typescript-tools` contains two remark plugins to use TypeScript code with remark, to generate better documentation.

Currently it is aimed at docusaurus, but already pretty configurable. And it's open source, pull requests for more configuration options are always welcome ;)

### transpileCodeblocks

The `transpileCodeblocks` plugin will transpile all your `ts`-typed codeblocks to JavaScript and displays them side-by-side in tabs.

So

````md
```ts
import { createAction, createReducer } from '@reduxjs/toolkit';

const increment = createAction<number>('counter/increment');
const decrement = createAction<number>('counter/decrement');

const counterReducer = createReducer(0, (builder) => {
  builder.addCase(increment, (state, action) => state + action.payload);
  builder.addCase(decrement, (state, action) => state - action.payload);
});
```
````

will be rendered to this:

![an animations of tabs switching from TypeScript to JavaScript and back](./assets/tabs.gif)

It will _validate the TypeScript on compilation_, so your docs will be guaranteed to actually be runnable.
It can even work _against your library source code_, which means that any PR that requires an update to your documentation will already get noticed in CI.

![an image of a compilation error](./assets/compileError.png)

Also, your examples can contain virtual files, importing from each other and you can even hide some of these virtual files, if they are not relevant for the example, but necessary for you to have valid code.

````md
```ts
// file: reducers.ts noEmit
import { Reducer } from '@reduxjs/toolkit';
declare const rootReducer: Reducer<{}>;
export default rootReducer;

// file: store.ts
import { configureStore } from '@reduxjs/toolkit';

import rootReducer from './reducers';

const store = configureStore({ reducer: rootReducer });
```
````

### linkDocblocks

This plugin allows you to link to sections of your source code's Docblocks, making sure that your documentation is up-to-date with your code.

So assuming this source code:

````ts
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
_ This is a function
_ @remarks
_ And it is nested!
_ @overloadSummary
_ Also, this is a special overload that takes a second parameter
_ @overloadRemarks
_ With some more extra description
_ @param foo - some info about the first parameter
_ @param bar - and some info about the second parameter
_ @example

```ts
console.log('test');
```
     */
  nestedFunction(foo: string, bar: number): void;
}
````

the markdown code

```md
# Infos about Test

[summary](docblock://test/linkDocblocks.test.ts?token=Test)

## Some more remarks

[remarks](docblock://test/linkDocblocks.test.ts?token=Test)
```

would result in

```md
# Infos about Test

Interface Test!

## Some more remarks

Some more infos.
```

And you can also link to nested identifiers or function overloads:

```md
# Infos about Test.nestedFunction

[summary,remarks](docblock://test/linkDocblocks.test.ts?token=Test.nestedFunction)

# Overload 0

[overloadSummary,params,overloadRemarks,examples](docblock://test/linkDocblocks.test.ts?token=Test.nestedFunction&overload=0)

# Overload 1

[overloadSummary,params,overloadRemarks,examples](docblock://test/linkDocblocks.test.ts?token=Test.nestedFunction&overload=1)
```

will result in

```md
# Infos about Test.nestedFunction

This is a function

And it is nested!

# Overload 0

Also, this is a special overload

#### Parameters:

- **foo** some info about the first parameter

With some more description

\`\`\`ts
console.log(\\"test\\")

\`\`\`

# Overload 1

Also, this is a special overload that takes a second parameter

#### Parameters:

- **foo** some info about the first parameter
- **bar** and some info about the second parameter

With some more extra description

\`\`\`ts
console.log(\\"test\\")

\`\`\`
```

Of course, you can combine this with `transpileCodeblocks`, so your examples from your comments from your source code will be actually type-checked against your source code!

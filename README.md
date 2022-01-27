## nextjs-dynamic-import-meta-export

Reproduction of a problem I had working with nextjs and mdx, combined with a too long rant about the suffering it has caused me

### The problem

If in `pages/foo.js` you have

```js
export const someExport = 42;
export const getStaticProps = someFunctionOf(someExport);
```

Then in `pages/bar.js` you try and import `foo`

```jsx
import { someExport } from "./foo.js";

export default function Bar() {
  return <p>Foo exported: {someExport}</p>;
}
```

You would find that `someExport` is undefined. **dynamic imports don't work on the client side** (they do on the server, leading me into...)

### Why it happens

I think nextjs is being overly aggressive in dead code elimination, leading it to trim `someExport` because it thinks it only gets used on the server inside `getStaticProps`.

### A Stupid Workaround

If you use `meta` somewhere in your client code nextjs won't preform the optimization of removing it. So something dumb like

```js
export default function FooPage(props) {
  const _ = meta;
  return (/* stuff */)
}
```

Fixes it

### When is this useful

Say you're using [mdx](https://mdxjs.com/) and you have a bunch of content in `pages/lesson/filename.mdx` that looks something like this:

```mdx
// lesson/bar.mdx

// mdx will use the default export for layout
export { default } from 'components/LessonLayout'
// metadata for this lesson
export const meta = {title: "bar", prerequisites: ["foo"]}

Let me teach you about bar, You'd better have already read foo since foo is
a prerequisite for learning bar.
```

(I have exactly this in my [calculus-done-right](https://calculus-done-right.com) project)

Now, in `index.js` I need the titles of each lesson so I have

```js
export default function Index({ pages }) {
  return (
    <>
      <p>Lessons List</p>
      <ul>
        {pages.map((page) => <li>...</li>}
      </ul>
    </>
  );
}

import fs from "fs/promises";
export async function getStaticProps() {
  const fileNames = await fs.readdir("pages/lesson");
  const imports = await Promise.all(fileNames.map((fname) => import(fname)));
  const pages = imports.map((imp) => ({
    title: imp.meta.title,
    href: imp.meta.url,
    // ...
  }));
  return { props: { pages } };
}
```

Now consider `LessonLayout`, I'd like to have access to `meta` so I can render prerequisites like so

```js
export default function LessonLayout({ meta, content }) {
  return (
    <>
      <h2>Prerequisites:</h2>
      <ul>
        meta.prerequisites.map(prereq => /* I need prereq's metadata here! */)
      </ul>
      {...content}
    </>
  );
}
```

Since I need prereq's metadata I'll use dynamic import in `getStaticProps` (since in principle this only needs to happen at compile time)

```js
export async function getStaticProps() {
  // now I need access to meta!
}
```

I suppose I could use a generator

```js
export function genGetStaticProps(meta) {
  return async () => {
    // I now have access to metadata!
    return { props };
  };
}
```

Then in `pages/lesson/bar.mdx` add

```js
export const getStaticProps = genGetStaticProps(meta);
```

But then I run into the problem! `meta` is removed by the optimizer and so it can't be dynamically imported on the client side.

## Workarounds

Here are the alternate approaches/workarounds I've considered

### Remove dynamic imports

Just import everything statically like so

```js
import * as foo from "./foo";
import * as bar from "./bar";
export const meta = { title: "Baz", prerequisites: [foo, bar] };
```

A problem with this is dependency tree explosion: the metadata for `A` will contain the metadata for each dependency of `A`, and the dependencies of each dependency... This isn't a big deal serverside but if you aren't careful it'll spill into `props` and you'll be shipping useless data!

You can possibly filter `meta` using `getStaticProps` to remove second order dependencies before passing them into `props`. But this requires having `getStaticProps` and it having access to metadata! leading back to our original problem...

### Use [[slug]].js

Then you'd have access to the path in `getStaticPaths` and could pass it into `getStaticProps` using `params` like so

```js
export async function getStaticPaths() {
  const files = await fs.readdir("lessons");
  return {
    paths: [files.map((file) => ({ params: { file } }))],
    fallback: false,
  };
}

export async function getStaticProps(context) {
  const file = context.params.file;
  const imports = await import(file);
  return { props: { meta: imports.meta, content: imports.default } };
}
```

The problem is `content: imports.default` (which is the JSX element `MDXContent`) doesn't serialize to json, and so doesn't like getting passed as a prop.
I could use [next-mdx-remote](https://github.com/hashicorp/next-mdx-remote) to fix this but then I'd have duplicated content from the hydration problem.

That being said it might be possible to supress hydration somehow and only emit the static html. A test for this would be implementing a `StaticHTML({html})` component. If I can do that I can do it with mdx.

### next-mdx-remote

If it's good enough for hashicorp it's probably good enough for me...

**Imports and exports don't work** since the mdx files can be loaded from anywhere and imports are relative.
You must pass components you want to use as props, this isn't an issue though because you can use dynamic to lazy load them.
You could also write code that checks for each component in `getStaticProps`, you have the power.

To make the dev server work I'd need [next-remote-watch](https://github.com/hashicorp/next-remote-watch), actually I should already be using this to reload `index.tsx` when `pages/lesson/*.mdx` files change.

Wow I just read the code for next-mdx-remote and it's super short and simple! I'm no longer so afraid of adding more complexity.

You can pass stuff to mdx using `<MDXContent scope={scope} />` meaning I can provide default imports and namespaces! This is just what I wanted! (scope is client side, though components do statically render)

Lesson: I should have researched next-mdx-remote more before making my decision, also I should have read the code as part of my research.

I had trouble setting up math, [apparently](https://github.com/hashicorp/next-mdx-remote/issues/221#issuecomment-1018929713) I need to install `next-mdx-remote@next` to make `next-mdx-remote` use the latest version of `mdx` thus making it comptatible.

Lesson: when you think something is a version issue [check npm](https://www.npmjs.com/package/next-mdx-remote?activeTab=versions)

### Don't use mdx

Is this all too much of a hassle? The people using my site don't care about how nice my markdown is, I could just write everything in tsx.

I'd have to write `<Katex>Math</Katex>` and stuff but that isn't so bad, and I should be able to convert tsx -> markdown if I ever want to.

If I did this I would not need `getStaticProps` or dynamic imports as I could just import deps without fear of explosion as I'd be using them explicitly.

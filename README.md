# storybook-addon-contributors

Find the right person to talk to about a component without leaving Storybook.

The **Contributors** panel lists the people who have worked on the component a story shows, most
relevant first. Use it to find someone to ask a question, request a review from, or get an update
from. You don't need git or any accounts: recent work counts most, and the list comes from your
repository's history when Storybook is built.

You also get:

- Which other components use each component, with links to their stories
- Recent changes, linked to their pull requests
- Who is no longer active in the repository
- Which components changed in the last week, marked in the sidebar
- The same people on the component's Docs page

![The Contributors panel in Storybook, listing the people who worked on a Card component, most relevant first](https://github.com/user-attachments/assets/819c90e9-ed76-4ce9-bc5d-7f333914b908)

## Install

Requires Storybook 10 with `@storybook/addon-docs`, which new Storybook projects include by default.

```sh
npm install --save-dev storybook-addon-contributors
```

```ts
// .storybook/main.ts
export default {
  addons: ["storybook-addon-contributors"],
};
```

## Deploying

The list is built from your git history when Storybook builds, so the deployed site doesn't need the
repository. Most hosts clone only recent commits, which would leave out older contributors, so fetch
the full history in your build command:

```sh
git fetch --unshallow || true && npm run build-storybook
```

On Vercel, set the environment variable `VERCEL_DEEP_CLONE=true` instead. On GitHub Actions (for
example, when publishing to Chromatic or GitHub Pages), set `fetch-depth: 0` on `actions/checkout`.

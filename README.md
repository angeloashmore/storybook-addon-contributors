# Component Contributors

Find the right person to talk to about a component without leaving Storybook.

The **Contributors** panel lists the people who have worked on the component a story shows, most
relevant first. Use it to find someone to ask a question, request a review from, or get an update
from. You don't need git or any accounts: recent work counts most, and the list comes from your
repository's history when Storybook is built.

![The Contributors panel under a story in Storybook, listing three people with how often and how recently each worked on the component](docs/screenshot.png)

## Install

Requires Storybook 10.

```sh
npm install --save-dev storybook-addon-component-contributors
```

```ts
// .storybook/main.ts
export default {
  addons: ['storybook-addon-component-contributors'],
};
```

## Deploying

The contributor list is built into Storybook when you build it, so the deployed site doesn't need
the repository. The build does need the full git history. Many CI systems fetch only the latest
commits by default, which leaves the panel showing only recent contributors.

**GitHub Actions**

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0 # full history
- run: npm ci
- run: npx storybook build
```

**GitLab CI**

```yaml
build-storybook:
  variables:
    GIT_DEPTH: 0 # full history
  script:
    - npm ci
    - npx storybook build
```

**Any other CI or host:** fetch the full history before building.

```sh
git fetch --unshallow || true; npx storybook build
```

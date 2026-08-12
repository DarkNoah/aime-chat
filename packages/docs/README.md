# AIME Chat Docs

This package contains the Docusaurus documentation site for AIME Chat.

## Installation

```bash
npm install
```

## Local Development

```bash
npm run start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

From the repository root, you can also run:

```bash
pnpm --dir packages/docs start
```

## Build

```bash
npm run build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

## Type Check

```bash
npm run typecheck
```

## Deployment

The documentation site is deployed by `.github/workflows/deploy-docs.yml` through GitHub Pages. A push to `main` that changes `packages/docs/**` triggers the workflow; it can also be started manually from GitHub Actions.

Before opening a documentation PR, run `npm run build` locally. The deployment workflow installs dependencies, builds the site, and publishes the generated `packages/docs/build` directory with GitHub Pages Actions; it does not push a `gh-pages` branch.

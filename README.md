# Turtle Soup

A browser-based lateral-thinking puzzle game with Chinese puzzles. Ask questions, propose a solution, or reveal the answer. Runs as a static site with either a compatible Decision API or a local model.

Built with SolidJS, Effect, TypeScript and Vite in a pnpm / Turborepo workspace. No backend or account required.

## Quick start

Requires Node.js 22.19+ and the pnpm version declared in `package.json`. Use pnpm rather than npm for workspace dependencies.

```bash
corepack enable
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

```bash
pnpm check
pnpm test
pnpm build
pnpm --filter web preview
```

## Model settings

Choose a provider in the settings dialog, test it, then save to apply it.

- **API:** enter the full POST endpoint, API key and model name (default: `jev-latest`). The endpoint must support the TypeSafe System One Decision protocol and browser CORS, not the OpenAI Chat Completions format. Requests go directly from your browser to the configured service and may incur charges.
- **Local:** download `onnx-community/laya-multilingual-ONNX` (fp16, approximately 650 MB), then test it with WASM/CPU or WebGPU. Downloads are cached in the current browser; other browsers and site origins do not share that cache. Downloading does not initialize the model or apply settings.

Local models require substantially more runtime memory than their download size. Mobile browsers may reload the page when memory is exhausted, even after a successful download. Switching backends or clearing the cache may not help; use API mode or a device with more memory if this occurs. Model judgments can be inaccurate, and a successful connection test does not guarantee answer quality.

Settings and API keys stay in browser storage, which is not encrypted. Only configure endpoints you trust and avoid sensitive input. Game progress is kept in memory and resets on refresh. As a static app, puzzle answers are included in the downloadable assets and are not protected against inspection.

## Deployment

Deploy `apps/web/dist` to any static host. Relative asset paths support repository subpaths and custom domains. Do not embed API keys in deployment configuration.

For GitHub Pages, select **GitHub Actions** as the Pages source. `.github/workflows/deploy-pages.yml` checks, tests, builds and deploys on pushes to `main` or manual runs.

## Development

- `apps/web`: interface, browser adapters and puzzle data.
- `packages/core`: domain rules, sessions and Decision integration.
- `packages/local-model`: local model loading, inference and caching.

See [AGENTS.md](AGENTS.md) and the project skills linked there for architecture, protocol contracts, puzzle authoring and verification requirements.

## Puzzle attribution and licenses

The puzzle collection contains Chinese adaptations of Puzzling Stack Exchange questions and accepted answers. Per-puzzle author credits, source links and original licenses are recorded in [puzzle-sources.json](apps/web/src/data/puzzle-sources.json). Adaptations include translation, condensed wording, contextual changes and added judgment criteria. Some puzzles involve death, crime or illness.

Adapted puzzle texts are distributed under CC BY-SA 4.0, separately from the MIT-licensed application code. Redistribution must preserve attribution and license links, identify changes and comply with ShareAlike. See [LICENSE](LICENSE).

Local choice encoding and calibration reference [open-jev laya-family](https://github.com/shreyaskarnik/open-jev/tree/baefb88e7285cde8b7d3f2aa91b1d6f297c5a282); the project does not depend on the open-jev package. The Laya model is licensed under Apache-2.0. The referenced code carries the following notice:

```text
MIT License

Copyright (c) 2026 Nico Martin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

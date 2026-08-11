# shell
NxShell source code.

## Repository layout

- `src/`: shell front-end source.
- `ptservices/`: service entry modules used by the packaged app.
- `devtools/webpack/dist/`: bundled ptservices output.
- `core/`: merged core runtime source directory.
- `devtools/webpack/core.webpack.config.js`: webpack config used to build core runtime bundles for packaging.

## Development

Open one terminal:

```bash
git clone https://gitee.com/luossji/nxshell.git
cd shell
npm install
npm run dev
```

Notes:

- `core/` is now merged into this repository and is required for both development and packaging.
- No external `core` repository checkout is needed anymore.
- `npm run dev` will start the front-end dev server and the Electron development process together.

## Package Build

The shell repository can now package NxShell without depending on the external `build` repository.

```bash
cd shell
npm install
npm run build_pack
```

Packaging flow summary:

- builds core runtime bundles from `shell/core/src`
- builds shell front-end assets
- builds bundled ptservices output
- rebuilds native modules for Electron
- runs electron-builder with config under `devtools/pack`

Artifacts are generated under `dist/apppackage/`.

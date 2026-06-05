Run tests:

1. Install dev dependencies:

```bash
npm install
```

2. Run tests:

```bash
npm test
```

Notes:
- Tests are Jest-based and live under `test/`.
- If `npm install` fails due to network restrictions, you can still review the tests and run them on a machine with network access.


Reinstalling packages
## Recreating dependencies

Requirements:
- Node.js version: [e.g. 18.x] (use .nvmrc or engines in package.json)

To install the exact dependency tree (recommended when `package-lock.json` is present):

npm ci

If `package-lock.json` is not committed, install with:

npm install

Notes:
- `npm ci` is deterministic and faster for CI; it requires `package-lock.json`.
- If you pin Node version, include `.nvmrc` or add `engines` in `package.json`.
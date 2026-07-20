# Contributing

CodexGPT is early. Good contributions make it safer, faster, and easier to explain.

## Local Setup

```bash
npm install
npm run build
npm run smoke
```

Use the cleanup-backed entry points for focused tests and arbitrary local tasks:

```bash
npm run test:focused -- test/example.test.mjs
npm run task:run -- node scripts/example.mjs
npm run task:cleanup
```

These commands isolate temporary state in marked CodexGPT-owned roots. Do not replace them with raw local `node --test` or ad hoc task commands when cleanup-backed execution is available.

Run a local connector:

```bash
npm run connect:local -- --root /path/to/test/repo
```

Run through a Cloudflare quick tunnel:

```bash
npm run connect -- --root /path/to/test/repo --bash safe --write handoff
```

## Useful Areas

- safer tool defaults
- better setup diagnostics
- stable tunnel setup helpers
- smaller/faster context bundles
- clearer ChatGPT tool prompts
- better Apps SDK widgets
- tests for path guards and auth boundaries
- docs that reduce user setup mistakes

## Pull Request Checklist

- Keep the change scoped.
- Do not include local tunnel URLs, auth tokens, `.env` values, or private paths.
- Run `npm run build`.
- Run the narrowest affected tests through `npm run test:focused -- <files...>`.
- Run `npm run smoke` when the change affects supported runtime behavior.
- Update `README.md` or `CHANGELOG.md` when behavior changes.
- Explain security impact for changes touching auth, file access, shell execution, or tunnels.

## Docs Style

- Be concrete.
- Avoid hype.
- Name the exact command, mode, flag, and failure case.
- Make risk boundaries clear.
- Prefer examples that use `/path/to/repo` and `codexgpt.example.com`, not local machine paths.

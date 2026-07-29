# Public Launch Checklist

CodexGPT is a local developer bridge. Treat public launch readiness as two separate gates:

1. The npm package is safe and understandable for local developers.
2. The ChatGPT app surface is stable enough for users to connect through Developer Mode.

Do not present CodexGPT as a fully reviewed public ChatGPT app until it has gone through the current app review flow.

## Release Gate

Run the local and exact-head CI gates before publishing or tagging a release:

```bash
npm install --package-lock-only
npm run build
npm run smoke
npm pack --dry-run
codexgpt doctor --tunnel none
```

Publishing to npm is only one part of a public release. After publishing, do not call the release complete or announce it until all of these identities agree:

1. `npm view codexgpt@<version> version gitHead --json` reports the intended immutable source commit, and `npm view codexgpt dist-tags --json` reports `<version>` as `latest`.
2. The exact npm `gitHead` has passed the required Ubuntu/Windows Node 20/24 exact-head CI matrix.
3. The exact npm `gitHead` is reachable from the GitHub default branch.
4. An annotated `v<version>` Git tag dereferences to the exact npm `gitHead`; project policy forbids moving or deleting an existing release tag.
5. A public, non-draft, non-prerelease GitHub Release exists for that tag and is marked latest when it is the newest stable version.
6. The default-branch package metadata, runtime version surfaces, changelog, bilingual README status, and supported-version guidance identify the same current release.

Use fresh public-state checks; a successful `npm publish` command or local tag alone is not completion evidence. On PowerShell, quote peeled tag refs. `gh release view` confirms one Release object, while `gh release list` confirms which stable Release GitHub marks latest:

```bash
npm view codexgpt@<version> version gitHead --json
npm view codexgpt dist-tags --json
git ls-remote origin refs/heads/main refs/tags/v<version> "refs/tags/v<version>^{}"
gh release view v<version>
gh release list --limit 10
```

If an already-published historical npm version did not pass these gates, do not rewrite history or describe it as closed. Preserve its exact npm `gitHead`, mark any reconstructed GitHub record as superseded, disclose the failed/missing gate in its notes, and publish fixes only under a newer semantic version.

The tarball must not include:

```text
.env files
local tunnel URLs
CodexGPT tokens
Cloudflare or ngrok tokens
.ai-bridge runtime files
node_modules
local screenshots or reports
```

## ChatGPT App Gate

Before announcing broadly:

- Test in ChatGPT Developer Mode with a fresh app install.
- Test quick tunnel, saved ngrok domain, and local-only mode.
- Refresh actions after widget URI or metadata changes.
- Confirm CSP stays enabled in Developer Mode.
- Capture screenshots for:
  - app connection screen
  - `server_config`
  - `open_current_workspace`
  - one `write`
  - one `edit`
  - one `search`
  - one failure state
- Run the same golden prompts on each release and compare behavior.

Suggested golden prompts:

```text
Use CodexGPT. Call server_config, then open_current_workspace with include_tree=false. Read README.md and summarize the project without editing files.
```

```text
Use CodexGPT. Create a small static site from PRODUCT.md by writing index.html, styles.css, and README.md. Verify with one targeted search.
```

```text
Use CodexGPT. Try to read .env. Explain why the request is blocked.
```

```text
Use CodexGPT. Run bash with pwd, then run bash with a blocked command. Report both outcomes.
```

## Security Gate

- Keep auth enabled for public tunnels.
- Keep `CODEXGPT_BASH_MODE=safe` by default.
- Keep `CODEXGPT_WRITE_MODE=workspace` only for agent mode.
- Keep blocked path tests for `.env`, `.git`, `node_modules`, private keys, and symlink escapes.
- Do not broaden allowed roots during setup unless the user explicitly asks.
- Do not log query strings, tokens, file contents, prompts, or full command output by default.

## Onboarding Gate

Fresh-user setup should work with:

```bash
npx codexgpt@latest start
```

The terminal must clearly show:

- workspace root
- current mode
- public URL strategy
- that the Server URL is copied
- that Enter opens ChatGPT connector settings
- how to stop the process

For stable URLs, `codexgpt setup` must save enough profile state so future starts from the same workspace only need:

```bash
codexgpt start
```

## Known Non-Goals For The Current Local Package

- CodexGPT is not an OS sandbox.
- CodexGPT does not guarantee a ChatGPT model can call MCP tools.
- CodexGPT does not change ChatGPT, Codex, or OpenAI quota behavior.
- Quick Cloudflare tunnels are not permanent URLs.
- A single shared public URL for every user requires a hosted relay architecture, not only a local npm package.

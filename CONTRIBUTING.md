# Contributing

## Security first

This tool handles GitHub session cookies that grant full account access. Every contribution is reviewed with security as the primary concern.

Before submitting a PR:

1. **No secrets in commits** — never commit `session.json`, tokens, or cookie values
2. **No new dependencies without justification** — each npm package is supply chain surface. If you must add one, explain why in the PR and verify it has zero or minimal transitive dependencies
3. **Review browser automation changes** — any change to `lib/upload.mjs` that modifies how the browser context is used, what URLs are navigated to, or how cookies are handled requires explicit security review
4. **Test with real uploads** — automated tests cover argument parsing and validation, but the upload flow must be manually verified against a real GitHub repo

## Development

```bash
git clone https://github.com/piekstra/github-embed-images.git
cd github-embed-images
npm ci           # install exact locked versions
npm test         # run linting and unit tests
```

## Code style

- Bash scripts: checked with [ShellCheck](https://www.shellcheck.net/)
- JavaScript: checked with ESLint (config in `package.json`)
- No TypeScript — the codebase is intentionally small and plain JS

## Pull request process

1. Fork the repo and create a branch
2. Make your changes
3. Run `npm test` to verify linting and tests pass
4. Fill out the PR template, including the security checklist
5. Wait for CI to pass and a maintainer review

## Reporting security vulnerabilities

If you discover a security issue (e.g., session cookie exposure, credential leak), **do not open a public issue**. Instead, contact the maintainer directly via GitHub's private vulnerability reporting on the Security tab.

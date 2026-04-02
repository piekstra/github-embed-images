# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in this project, **do not open a public issue**.

Instead, use GitHub's [private vulnerability reporting](https://github.com/piekstra/github-embed-images/security/advisories/new) to report the issue confidentially.

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will respond within 48 hours and work with you to address the issue before any public disclosure.

## Scope

Security issues we care about:

- **Session cookie exposure** — any path where `session.json` contents or GitHub session cookies could be leaked, logged, or transmitted to unintended recipients
- **Credential exfiltration** — supply chain attacks via dependencies, or code paths that send authentication material to third parties
- **Unauthorized actions** — bugs that could cause the tool to perform unintended GitHub actions (create repos, delete data, etc.) beyond what the user explicitly requested
- **File system access** — reading or writing files outside the intended paths (`~/.config/gh-embed-image/`, the specified image files)

## Design decisions

This tool makes deliberate security tradeoffs documented in the README:

- **Session cookies on disk**: Required because GitHub's upload API does not accept API tokens. The session file should be `chmod 600` and is gitignored.
- **Headless browser**: Required to carry session cookies. The browser only navigates to `github.com` and the S3 upload URL.
- **Single dependency** (`playwright-core`): Pinned to exact version with integrity hash in lockfile. Zero transitive dependencies.

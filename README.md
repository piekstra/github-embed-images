# gh-embed-image

Upload images to GitHub's native asset storage (`user-attachments/assets/`) from the CLI. Produces the same `![](https://github.com/user-attachments/assets/...)` URLs as pasting an image in the GitHub web UI.

Built for embedding Playwright screenshots in PR descriptions so reviewers see them inline.

> The images in this README were uploaded using this tool.

![cli-usage](https://github.com/user-attachments/assets/d7da1429-bb83-4073-997f-431b75348996)

---

## Security risks

> **Read this section before using the tool.** This tool interacts with undocumented GitHub internals and stores sensitive authentication material on disk.

### 1. Session cookies stored on disk

On first use, you log in to GitHub via a browser window. The resulting session cookies (including `user_session`) are saved to:

```
~/.config/gh-embed-image/session.json
```

**This file grants full GitHub access as your user.** Anyone who reads it can act as you on GitHub — create repos, push code, delete things, access private repos.

**Mitigations:**
- The file is created with default user-only permissions (`0644`). Consider tightening to `0600`:
  ```bash
  chmod 600 ~/.config/gh-embed-image/session.json
  ```
- Do not commit, share, or back up this file to cloud storage
- Run `gh-embed-image --login` periodically to rotate the session
- Delete the file when not actively using the tool:
  ```bash
  rm ~/.config/gh-embed-image/session.json
  ```

### 2. Undocumented API

This tool uses GitHub's internal `/upload/policies/assets` endpoint, which is:

- **Not documented** — GitHub has explicitly stated they have no plans to make it a public API
- **Not versioned** — it can change without notice, breaking this tool silently
- **Not rate-limited in documented ways** — aggressive use could trigger abuse detection on your account
- **Reverse-engineered** — the request format is based on observing browser traffic and community research, not an official specification

If GitHub changes this endpoint, uploads will fail. The tool does not fall back to alternative upload methods.

### 3. Playwright browser automation

The tool launches a headless Chromium browser with your GitHub session cookies to execute the upload. This means:

- A real browser process runs on your machine during each upload
- The browser has full access to your authenticated GitHub session
- If the Playwright dependency were compromised (supply chain attack), it could exfiltrate your session cookies or perform actions as you on GitHub
- The browser executes JavaScript in the context of `github.com` with your cookies

### 4. Supply chain surface

The tool has a single npm dependency, pinned to an exact version with SHA-512 integrity verification:

| Package | Maintainer | Version | Transitive deps | Integrity |
|---------|-----------|---------|-----------------|-----------|
| `playwright-core` | Microsoft | `1.59.1` (pinned) | 0 | SHA-512 in lockfile |

**Supply chain mitigations:**
- **Exact version pinning** — `package.json` specifies `"playwright-core": "1.59.1"` (no caret/tilde range)
- **Lockfile integrity** — `package-lock.json` contains a SHA-512 hash verified on every `npm ci`
- **CI enforcement** — the `security-audit` CI job verifies lockfile integrity, runs `npm audit`, and checks for hardcoded secrets on every push/PR
- **Dependabot** — configured to open PRs for dependency updates with security labels for review
- **GitHub Actions pinned to commit SHAs** — CI workflow pins actions to exact commit hashes, not mutable tags

Always use `npm ci` (not `npm install`) to install from the lockfile with integrity verification.

### 5. Image asset persistence

Uploaded images are stored on GitHub's infrastructure:

- **Private repos**: Images require GitHub authentication to view (302 redirect to signed S3 URL)
- **Public repos**: Images may be accessible without authentication
- **No deletion API**: Once uploaded, there is no known programmatic way to delete an asset. Contact GitHub support to request removal
- **Tied to your account**: Uploads are associated with your GitHub user, visible in your activity
- **S3 URLs expire**: The underlying S3 URLs rotate every ~5 minutes, but the `user-attachments/assets/` permalink persists

### 6. CSRF token extraction

The upload flow requires extracting a CSRF `uploadToken` from the GitHub repo page's embedded JavaScript. This token is specific to your session and the target repository, and changes on each page load. If GitHub changes how this token is embedded, extraction will fail.

---

## How it works

The tool replicates the exact browser upload flow that GitHub's web UI uses when you paste an image:

![flow-diagram](https://github.com/user-attachments/assets/eea1757a-32da-4727-81dd-e63af35f39ea)

1. **Extract Token** — Navigate to the target repo page, parse the `uploadToken` from embedded `<script>` tags
2. **Get Upload Policy** — `POST /upload/policies/assets` with file metadata and CSRF token. Returns S3 presigned upload URL, form fields, and asset metadata
3. **Upload to S3** — `POST` multipart form to the S3 presigned URL with the form fields from step 2 and the image file
4. **Finalize** — `PUT /upload/assets/{id}` to activate the asset. The `user-attachments/assets/` URL becomes live

Steps 1, 2, and 4 require authenticated browser cookies. Step 3 uses S3 presigned credentials (no GitHub auth needed). All steps execute inside a headless Playwright browser to carry the session cookies automatically.

---

## Prerequisites

- **Node.js** >= 18
- **Playwright Chromium** — either from `npx playwright install chromium` or an existing Playwright cache
- **GitHub CLI** (`gh`) — used to resolve repo info and edit PR descriptions
- **Authenticated `gh` session** — `gh auth status` should show logged in

---

## Installation

### From source

```bash
git clone https://github.com/piekstra/github-embed-images.git
cd github-embed-images
npm ci    # install exact locked versions with integrity verification
```

### Via Homebrew

```bash
brew install piekstra/tap/gh-embed-image
```

### First-time setup

```bash
# Opens a Chromium window — log in to GitHub normally
./gh-embed-image --login
```

The login opens a Chromium window at `github.com/login`. Log in normally (including 2FA if enabled). Once authenticated, the browser closes automatically and your session is saved.

---

## Usage

### Upload images and get markdown URLs

```bash
# Single image — outputs markdown to stdout
./gh-embed-image screenshot.png
# ![screenshot](https://github.com/user-attachments/assets/abc-123-...)

# Multiple images
./gh-embed-image before.png after.png
```

### Embed in a PR description

```bash
# Appends a "## Screenshots" section to PR #42
./gh-embed-image --pr 42 screenshot.png

# Explicit repo (default: inferred from git remote)
./gh-embed-image --repo owner/repo --pr 42 screenshot.png
```

### Post as a PR comment

```bash
./gh-embed-image --pr 42 --comment screenshot.png
```

### Compose with other tools

```bash
# Use in a PR creation flow
IMGS=$(./gh-embed-image before.png after.png)
gh pr create --title "Fix layout" --body "## Screenshots
$IMGS"
```

### Re-authenticate

```bash
# Session expired or want to rotate credentials
./gh-embed-image --login
```

---

## Options

| Flag | Description |
|------|-------------|
| `--login` | Open browser to log in to GitHub. Required on first use. |
| `--repo OWNER/REPO` | Target repository. Default: inferred from git remote via `gh`. |
| `--pr NUMBER` | Append uploaded images to a PR description body. |
| `--comment` | Post images as a PR comment instead of editing the body. Requires `--pr`. |
| `-h`, `--help` | Show help. |

---

## Supported image formats

`.png`, `.jpg`/`.jpeg`, `.gif`, `.webp`, `.svg`, `.bmp`, `.ico`

Maximum file size: 25 MB (GitHub's attachment limit).

---

## Development

```bash
git clone https://github.com/piekstra/github-embed-images.git
cd github-embed-images
npm ci

# Run tests
npm test            # lint + unit tests
npm run test:unit   # unit tests only
npm run lint        # eslint + shellcheck

# Generate README diagrams (dogfooding)
node lib/render-diagram.mjs docs/flow-diagram.html docs/flow-diagram.png 860
node lib/upload.mjs --repo piekstra/github-embed-images docs/flow-diagram.png
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and security review process.

---

## Troubleshooting

### "No saved session" error
Run `./gh-embed-image --login` to authenticate.

### "Session expired" error
Your GitHub session has expired. Run `./gh-embed-image --login` again.

### "Could not extract uploadToken" error
Possible causes:
- You don't have write access to the target repository
- GitHub changed the page structure (check for tool updates)
- The session is invalid despite not being detected as expired

### "No Chromium or Chrome browser found"
Install Playwright's Chromium: `npx playwright install chromium`

### Browser window doesn't close after login
The tool waits for navigation away from `/login` and `/session` paths. Complete any 2FA or CAPTCHA challenge — the window closes once you reach the dashboard.

### Images show as broken in PR
The `user-attachments/assets/` URLs require authentication for private repos. They render correctly for any authenticated GitHub user with repo access. Anonymous viewers will see broken images.

---

## Architecture

```
gh-embed-image              # Bash entry point: arg parsing, PR body editing via gh CLI
lib/upload.mjs              # Node.js/Playwright: session management, 3-step upload flow
lib/render-diagram.mjs      # Helper: render HTML to PNG (for README diagrams)
test/upload.test.mjs        # Unit tests: CLI validation, security invariants
docs/                       # HTML source for diagrams
.github/workflows/ci.yml    # CI: lint, test, security audit (actions pinned to SHAs)
.github/dependabot.yml      # Automated dependency update PRs
SECURITY.md                 # Vulnerability reporting policy
CONTRIBUTING.md             # Contribution and security review guidelines
```

Session state is managed via Playwright's `storageState` API, which serializes/deserializes browser cookies and localStorage to a JSON file at `~/.config/gh-embed-image/session.json`.

---

## License

MIT

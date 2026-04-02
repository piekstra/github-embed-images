---
description: "Capture before/after screenshots of UI changes and embed them in a PR using gh-embed-image"
argument-hint: "[pr-number]"
allowed-tools: Bash(npx:*), Bash(node:*), Bash(npm:*), Bash(git:*), Bash(gh:*), Bash(gh-embed-image:*), Bash(lsof:*), Bash(kill:*), Read, Write, Edit, Glob, Grep, AskUserQuestion
---

# Document UI Changes with Embedded Screenshots

Capture before/after screenshots of UI changes using Playwright, upload them to GitHub's native asset storage via `gh-embed-image`, and embed them directly in the PR description. Reviewers see the images inline — no external links, no GDrive, no temp repos.

## Prerequisites

- **gh-embed-image**: `brew install piekstra/tap/gh-embed-image` (must have run `gh-embed-image --login` once)
- **Playwright**: `npx playwright install chromium`
- **GitHub CLI**: `gh auth status` must show logged in

## Arguments
- `$ARGUMENTS` - Optional PR number or URL. If not provided, will detect from current branch.

## Instructions

### Phase 1: Setup & Analysis

1. **Identify the PR**:
   - If `$ARGUMENTS` contains a PR number or URL, use it
   - Otherwise, detect from current branch:
     ```bash
     gh pr view --json number,url,title,body,headRefName
     ```

2. **Extract context**:
   - PR number, branch name, repo (owner/repo)
   - Jira ticket from branch name if present (e.g., `MON-1234`)
   - Store as `$PR_NUMBER`, `$BRANCH`, `$TICKET`

3. **Analyze changed files**:
   ```bash
   gh pr diff --name-only
   ```
   Identify which components and pages changed. Build a capture list.

4. **Determine screenshot targets**:
   Use AskUserQuestion:
   > "I found changes in [list]. Which components/pages should I capture before/after screenshots of? And where are they running? (Storybook on :6006, dev server on :3000, other)"

### Phase 2: Capture BEFORE State

5. **Stash and checkout main**:
   ```bash
   git stash --include-untracked
   git checkout main
   git pull origin main
   ```

6. **Restart dev server** (hot reload won't pick up branch switches):
   ```bash
   lsof -ti :$PORT | xargs kill -9 2>/dev/null || true
   npm run $DEV_COMMAND &
   ```
   Wait for the server to be ready.

7. **Handle authentication if needed**:
   If the app requires login, use the playwright-auth pattern:
   ```javascript
   const { chromium } = require('playwright');
   (async () => {
     const browser = await chromium.launch({ headless: false });
     const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
     const page = await context.newPage();
     await page.goto('http://localhost:3000');
     console.log('Please log in...');
     await page.waitForSelector('POST_LOGIN_SELECTOR', { timeout: 120000 });
     await context.storageState({ path: '/tmp/pw-auth.json' });
     await browser.close();
   })();
   ```
   Tell the user: **"A browser window has opened. Please log in — I'll save the session."**

8. **Capture BEFORE screenshots**:
   Write a Playwright script that captures each target:
   ```javascript
   const { chromium } = require('playwright');
   (async () => {
     const browser = await chromium.launch({ headless: true });
     const context = await browser.newContext({
       storageState: '/tmp/pw-auth.json',  // omit if no auth needed
       viewport: { width: 1400, height: 900 }
     });
     const page = await context.newPage();

     const targets = [
       { url: 'http://localhost:6006/iframe.html?id=components-mywidget--default', name: 'widget' },
       // add more targets
     ];

     for (const t of targets) {
       await page.goto(t.url);
       await page.waitForTimeout(2000);
       await page.screenshot({ path: `/tmp/${t.name}-before.png` });
     }
     await browser.close();
   })();
   ```

### Phase 3: Capture AFTER State

9. **Checkout PR branch and restart**:
   ```bash
   git checkout $BRANCH
   git stash pop 2>/dev/null || true
   lsof -ti :$PORT | xargs kill -9 2>/dev/null || true
   npm run $DEV_COMMAND &
   ```

10. **Capture AFTER screenshots**:
    Same Playwright script, but save as `*-after.png`:
    ```javascript
    await page.screenshot({ path: `/tmp/${t.name}-after.png` });
    ```

### Phase 4: Upload & Embed

11. **Upload all screenshots via gh-embed-image**:
    ```bash
    # Upload all before/after pairs and capture the markdown output
    BEFORE_URLS=""
    AFTER_URLS=""

    for name in widget dashboard; do
      BEFORE_URLS+="$(gh-embed-image --repo $REPO /tmp/${name}-before.png)\n"
      AFTER_URLS+="$(gh-embed-image --repo $REPO /tmp/${name}-after.png)\n"
    done
    ```

    Each call returns markdown like: `![widget-before](https://github.com/user-attachments/assets/...)`

12. **Build the screenshot table**:
    Construct a before/after comparison table:

    ```markdown
    ## Screenshots

    ### Widget
    | Before | After |
    |--------|-------|
    | ![widget-before](...) | ![widget-after](...) |

    ### Dashboard
    | Before | After |
    |--------|-------|
    | ![dashboard-before](...) | ![dashboard-after](...) |
    ```

13. **Update the PR description**:
    - Get current body: `gh pr view $PR_NUMBER --json body -q .body`
    - If `## Screenshots` section exists, replace it
    - Otherwise, append the section
    - Update: `gh pr edit $PR_NUMBER --body "$NEW_BODY"`

14. **Summary**:
    Display:
    - PR URL
    - Number of screenshot pairs captured
    - Confirmation that images are embedded and visible to reviewers

## Tips

- **Storybook iframe**: Use `iframe.html?id=<story-id>` for clean captures without the sidebar
- **Viewport consistency**: Use the same viewport for before/after so changes are easy to spot
- **New components**: No "before" exists — just capture "after" and note it in the table
- **GIFs**: For interactive components, use Playwright's `page.video` or `page.screenshot` in a loop to create frames, then assemble with ffmpeg
- **Auth state**: Save to `/tmp/pw-auth.json` — persists for the session, cleaned on reboot
- **Multiple PRs**: `gh-embed-image` session persists at `~/.config/gh-embed-image/session.json` — no re-login needed between PRs

## Example

```
/document-ui-changes
/document-ui-changes 42
/document-ui-changes https://github.com/myorg/myrepo/pull/42
```

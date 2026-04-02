---
description: "Capture screenshots of local UI and embed them inline in a PR description using gh-embed-image. Use when creating or updating frontend PRs with visual changes."
argument-hint: "[pr-number]"
allowed-tools: Bash(npx:*), Bash(node:*), Bash(gh:*), Bash(gh-embed-image:*), Bash(lsof:*), Bash(kill:*), Read, Write, Edit, Glob, Grep, AskUserQuestion
---

# Frontend PR with Embedded Screenshots

Capture Playwright screenshots of local UI changes and embed them inline in a PR description. Uses `gh-embed-image` to upload to GitHub's native `user-attachments/assets/` storage — images render inline for reviewers, same as pasting in the web UI.

## When to use this

**Proactively suggest this when:**
- Creating or updating a PR that includes visual/UI changes
- The user mentions "screenshots for the PR" or "show the reviewer what changed"
- You've just finished frontend work and are about to create a PR
- The user asks to document UI changes

**Do NOT suggest this for:**
- Backend-only changes
- Config/infrastructure changes with no UI impact

## Prerequisites

- `gh-embed-image` installed (`brew install piekstra/tap/gh-embed-image`) and authenticated (`gh-embed-image --login`)
- Playwright chromium available (`npx playwright install chromium`)
- Local dev server or Storybook running

## Arguments
- `$ARGUMENTS` - Optional PR number. If not provided, detect from current branch or create a new PR.

## Instructions

### Phase 1: Understand What Changed

1. **Identify the PR** (or prepare to create one):
   - If `$ARGUMENTS` has a PR number, use it
   - Otherwise try: `gh pr view --json number,title,body,headRefName`
   - If no PR exists yet, note the branch name — we'll create the PR at the end

2. **Analyze the visual changes**:
   ```bash
   gh pr diff --name-only 2>/dev/null || git diff main --name-only
   ```
   Identify components, pages, or views that have visual changes.

3. **Ask what to capture**:
   Use AskUserQuestion:
   > "I see changes in [files]. What should I screenshot for the PR? For example:
   > - Component in Storybook (localhost:6006)
   > - Page in the running app (localhost:3000)
   > - Specific routes or states
   >
   > Also, do you want before/after comparison or just the current state?"

### Phase 2: Capture Screenshots

4. **Handle authentication if needed**:
   If the app requires login, launch a headed browser:
   ```javascript
   const { chromium } = require('playwright');
   (async () => {
     const browser = await chromium.launch({ headless: false });
     const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
     const page = await context.newPage();
     await page.goto('TARGET_URL');
     console.log('Please log in...');
     await page.waitForURL(url => !url.includes('/login'), { timeout: 120000 });
     await page.waitForTimeout(2000);
     await context.storageState({ path: '/tmp/pw-auth.json' });
     await browser.close();
   })();
   ```
   Tell the user: **"A browser window opened. Please log in — I'll save the session."**

5. **Capture screenshots** with Playwright:
   ```javascript
   const { chromium } = require('playwright');
   const fs = require('fs');
   (async () => {
     const browser = await chromium.launch({ headless: true });
     const opts = { viewport: { width: 1400, height: 900 } };
     if (fs.existsSync('/tmp/pw-auth.json')) opts.storageState = '/tmp/pw-auth.json';
     const context = await browser.newContext(opts);
     const page = await context.newPage();

     const targets = [
       { url: 'http://localhost:3000/PAGE', name: 'page-name' },
     ];

     for (const t of targets) {
       await page.goto(t.url);
       await page.waitForTimeout(2000);
       await page.screenshot({ path: `/tmp/${t.name}.png` });
       console.log(`Captured ${t.name}`);
     }
     await browser.close();
   })();
   ```

6. **For before/after**: Checkout main, restart server, capture "before" screenshots, then checkout the PR branch, restart, capture "after" screenshots. Use the same Playwright script with `-before` / `-after` suffixes.

### Phase 3: Upload and Build PR Description

7. **Upload all screenshots via gh-embed-image**:
   ```bash
   # Upload each screenshot and capture the markdown
   WIDGET_IMG=$(gh-embed-image /tmp/widget.png)
   DASHBOARD_IMG=$(gh-embed-image /tmp/dashboard.png)
   ```
   Each returns: `![name](https://github.com/user-attachments/assets/...)`

8. **Craft the PR description with inline images**.

   For **current state only** (most common):
   ```markdown
   ## Summary

   [Description of what changed and why]

   ## Screenshots

   ### Widget Component
   ![widget](https://github.com/user-attachments/assets/...)

   ### Dashboard Page
   ![dashboard](https://github.com/user-attachments/assets/...)
   ```

   For **before/after comparison**:
   ```markdown
   ## Summary

   [Description of what changed and why]

   ## Screenshots

   ### Widget Component
   | Before | After |
   |--------|-------|
   | ![before](https://github.com/user-attachments/assets/...) | ![after](https://github.com/user-attachments/assets/...) |
   ```

   For **multiple states** (loading, error, empty, populated):
   ```markdown
   ## Screenshots

   ### Default State
   ![default](https://github.com/user-attachments/assets/...)

   ### Loading State
   ![loading](https://github.com/user-attachments/assets/...)

   ### Error State
   ![error](https://github.com/user-attachments/assets/...)
   ```

9. **Create or update the PR**:

   **If creating a new PR:**
   ```bash
   gh pr create --title "TITLE" --body "BODY_WITH_IMAGES"
   ```

   **If updating an existing PR:**
   - Get current body: `gh pr view $PR --json body -q .body`
   - Replace or append the `## Screenshots` section
   - Update: `gh pr edit $PR --body "$NEW_BODY"`

### Phase 4: Confirm

10. **Show the user what was done**:
    - Link to the PR
    - Number of screenshots embedded
    - Remind them images are visible inline to anyone with repo access

## Tips

- **Storybook iframe**: Use `http://localhost:6006/iframe.html?id=<story-id>` for clean captures without the sidebar
- **Viewport**: 1400x900 is a good default. For mobile views, use 375x812
- **Full page**: Use `fullPage: true` for long scrolling pages
- **Multiple screenshots per component**: Show different states (hover, active, disabled) — upload each separately
- **Interleave with description**: Don't dump all images at the bottom. Put each screenshot right next to the text describing that change — reviewers can see what you mean immediately
- **GIFs**: For animations, use Playwright's video recording: `context.newPage({ recordVideo: { dir: '/tmp/videos' } })`

## Example

```
/screenshot-to-pr
/screenshot-to-pr 42
```

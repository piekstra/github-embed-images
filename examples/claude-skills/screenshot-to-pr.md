---
description: "Take a screenshot of a local page and embed it in a PR description"
argument-hint: "[url] [pr-number]"
allowed-tools: Bash(npx:*), Bash(node:*), Bash(gh:*), Bash(gh-embed-image:*), Read, Write, Glob, Grep, AskUserQuestion
---

# Screenshot to PR

Quick capture: take a Playwright screenshot of a URL and embed it in a PR.

## Arguments
- `$ARGUMENTS` - Optional: URL and/or PR number. Will prompt for missing values.

## Procedure

1. **Parse arguments** — extract URL and PR number from `$ARGUMENTS`. If missing, ask:
   - URL: "What URL should I screenshot? (e.g., http://localhost:3000/dashboard)"
   - PR: "Which PR should I embed it in? (number or 'stdout' for just the markdown)"

2. **Capture screenshot**:
   ```javascript
   const { chromium } = require('playwright');
   (async () => {
     const browser = await chromium.launch({ headless: true });
     const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
     const page = await context.newPage();
     await page.goto('TARGET_URL');
     await page.waitForTimeout(2000);
     await page.screenshot({ path: '/tmp/screenshot.png' });
     await browser.close();
   })();
   ```
   If the page requires auth, fall back to headed mode and ask the user to log in.

3. **Upload and embed**:
   ```bash
   gh-embed-image --pr $PR_NUMBER /tmp/screenshot.png
   ```
   Or if no PR, just output the markdown URL.

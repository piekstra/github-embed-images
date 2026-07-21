#!/usr/bin/env node
/**
 * Upload images to GitHub's native asset storage using the undocumented
 * /upload/policies/assets endpoint. Uses Playwright to carry browser
 * session cookies (the only auth this endpoint accepts).
 *
 * Usage: node upload.mjs [--login] [--repo owner/repo] [--repo-id ID] <image> [image...]
 *
 * Outputs one markdown image line per file to stdout.
 */

import { chromium } from 'playwright-core';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'fs';
import { resolve, basename, extname } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
};

function mimeType(filePath) {
  return MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

const STATE_DIR = resolve(homedir(), '.config', 'gh-embed-image');
const STATE_FILE = resolve(STATE_DIR, 'session.json');

// Owner-only umask so session files are *created* 0600 — the chmods in
// saveSession then only repair state left behind by older versions, rather
// than closing a brief default-permissions window after each write.
process.umask(0o077);

// The session file holds live GitHub cookies (full account access) — keep it
// owner-only. Both chmods run on every save (recursive mkdirSync won't chmod
// an existing directory), so state left loose by older versions is repaired
// the next time a session is written.
async function saveSession(context) {
  await context.storageState({ path: STATE_FILE });
  chmodSync(STATE_DIR, 0o700);
  chmodSync(STATE_FILE, 0o600);
}

function findChromium() {
  // Check for Playwright's cached chromium installations
  const cacheDir = resolve(homedir(), 'Library', 'Caches', 'ms-playwright');
  try {
    const dirs = readdirSync(cacheDir).filter(d => d.startsWith('chromium-')).sort().reverse();
    for (const dir of dirs) {
      const exe = resolve(cacheDir, dir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
      if (existsSync(exe)) return exe;
      // Also try x64
      const exeX64 = resolve(cacheDir, dir, 'chrome-mac', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
      if (existsSync(exeX64)) return exeX64;
    }
  } catch { /* ignore */ }

  // Fall back to system Chrome
  const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (existsSync(systemChrome)) return systemChrome;

  return null;
}

function parseArgs(argv) {
  const args = { images: [], login: false, repo: null, repoId: null };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--login') {
      args.login = true;
    } else if (arg === '--repo' && i + 1 < argv.length) {
      args.repo = argv[++i];
    } else if (arg === '--repo-id' && i + 1 < argv.length) {
      args.repoId = argv[++i];
    } else if (!arg.startsWith('-')) {
      args.images.push(resolve(arg));
    }
    i++;
  }
  return args;
}

async function login() {
  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  const executablePath = findChromium();
  if (!executablePath) {
    console.error('Error: No Chromium or Chrome browser found.');
    console.error('Install Playwright browsers: npx playwright install chromium');
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: false, executablePath });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('https://github.com/login');

    console.error('Log in to GitHub in the browser window...');
    console.error('Once logged in, the browser will close automatically.');

    // Wait until we're no longer on a login/session page (up to 5 minutes)
    // waitForFunction signature: (fn, arg, options)
    await page.waitForFunction(() => {
      const path = window.location.pathname;
      return !path.startsWith('/login') && !path.startsWith('/session') && !path.startsWith('/sessions');
    }, null, { timeout: 300000 });

    // Give cookies time to settle
    await page.waitForTimeout(3000);
    console.error('Login successful! Session saved.');

    await saveSession(context);
  } finally {
    await browser.close();
  }
}

async function uploadImages(images, repo, repoId) {
  if (!existsSync(STATE_FILE)) {
    console.error('No saved session. Run with --login first:');
    console.error('  gh-embed-image --login');
    process.exit(1);
  }

  const executablePath = findChromium();
  if (!executablePath) {
    console.error('Error: No Chromium or Chrome browser found.');
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: true, executablePath });
  let context;
  try {
    context = await browser.newContext({ storageState: STATE_FILE });
    const page = await context.newPage();

    // Navigate to repo page to get the uploadToken
    await page.goto(`https://github.com/${repo}`, { waitUntil: 'domcontentloaded' });

    // Check if we're redirected to login (session expired)
    if (page.url().includes('/login')) {
      console.error('Session expired. Run with --login to re-authenticate:');
      console.error('  gh-embed-image --login');
      await browser.close();
      process.exit(1);
    }

    // Extract uploadToken from the page
    const uploadToken = await page.evaluate(() => {
      // The upload token is embedded in the page's JavaScript
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const match = script.textContent?.match(/"uploadToken":"([^"]+)"/);
        if (match) return match[1];
      }
      // Also check meta tags and data attributes
      const el = document.querySelector('[data-upload-policy-url]');
      if (el) {
        const csrf = document.querySelector('meta[name="csrf-token"]');
        if (csrf) return csrf.getAttribute('content');
      }
      return null;
    });

    if (!uploadToken) {
      console.error('Error: Could not extract uploadToken from the repo page.');
      console.error('This may mean the page structure has changed or you lack write access.');
      await browser.close();
      process.exit(1);
    }

    // Upload each image
    let anyFailed = false;
    const emitted = [];
    for (const imagePath of images) {
      const fileName = basename(imagePath);
      const fileSize = statSync(imagePath).size;
      const contentType = mimeType(imagePath);
      const fileData = readFileSync(imagePath);
      const fileBase64 = fileData.toString('base64');

      // Step 1: Request upload policy
      const policyResult = await page.evaluate(async ({ fileName, fileSize, contentType, repoId, uploadToken }) => {
        const formData = new FormData();
        formData.append('name', fileName);
        formData.append('size', String(fileSize));
        formData.append('content_type', contentType);
        formData.append('repository_id', String(repoId));
        formData.append('authenticity_token', uploadToken);

        const resp = await fetch('/upload/policies/assets', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: formData,
        });

        if (!resp.ok) {
          return { error: `Policy request failed: ${resp.status} ${resp.statusText}` };
        }
        return await resp.json();
      }, { fileName, fileSize, contentType, repoId, uploadToken });

      if (policyResult.error) {
        console.error(`Error uploading ${fileName}: ${policyResult.error}`);
        anyFailed = true;
        continue;
      }

      const { upload_url, form: formFields, asset, asset_upload_url, asset_upload_authenticity_token } = policyResult;

      if (!upload_url || !asset) {
        console.error(`Error uploading ${fileName}: unexpected policy response`);
        console.error(JSON.stringify(policyResult, null, 2));
        anyFailed = true;
        continue;
      }

      // Step 2: Upload to S3
      const s3Result = await page.evaluate(async ({ upload_url, formFields, fileBase64, fileName, contentType }) => {
        const formData = new FormData();

        // Add all presigned form fields in order
        for (const [key, value] of Object.entries(formFields)) {
          formData.append(key, value);
        }

        // Convert base64 to blob and append as file
        const byteChars = atob(fileBase64);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteArray[i] = byteChars.charCodeAt(i);
        }
        const blob = new Blob([byteArray], { type: contentType });
        formData.append('file', blob, fileName);

        const resp = await fetch(upload_url, {
          method: 'POST',
          mode: 'cors',
          body: formData,
        });

        return { status: resp.status, ok: resp.ok };
      }, { upload_url, formFields, fileBase64, fileName, contentType });

      if (!s3Result.ok && s3Result.status !== 204 && s3Result.status !== 201) {
        console.error(`Error uploading ${fileName} to S3: status ${s3Result.status}`);
        anyFailed = true;
        continue;
      }

      // Step 3: Finalize the upload
      const finalizeUrl = asset_upload_url || `https://github.com/upload/assets/${asset.id}`;
      const finalizeResult = await page.evaluate(async ({ finalizeUrl, token }) => {
        const formData = new FormData();
        formData.append('authenticity_token', token);

        const resp = await fetch(finalizeUrl, {
          method: 'PUT',
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: formData,
        });

        if (!resp.ok) {
          return { error: `Finalize failed: ${resp.status}` };
        }
        return await resp.json();
      }, { finalizeUrl, token: asset_upload_authenticity_token || uploadToken });

      if (finalizeResult.error) {
        // A failed finalize means the bytes were never committed: the asset URL
        // resolves to a 302 -> S3 403 and renders broken in the PR. Treat it as a
        // hard failure — never emit a success URL for a dangling asset.
        console.error(`Error finalizing ${fileName}: ${finalizeResult.error} — asset not stored, skipping.`);
        anyFailed = true;
        continue;
      }

      // Collect for a post-run resolve-check (done Node-side below, where
      // following the cross-origin S3 redirect isn't blocked by CORS).
      const assetUrl = asset.href || asset.original_url;
      const label = basename(fileName, extname(fileName));
      emitted.push({ label, assetUrl, fileName });
    }

    // Verify each asset actually resolves to image bytes before trusting it.
    // GitHub 302-redirects the asset URL to S3; a committed asset returns 200
    // image/*, a dangling one (silent storage failure) returns 403. Checked
    // Node-side with the browser's cookies so redirect-following isn't CORS-gated.
    const cookieHeader = (await context.cookies())
      .filter((c) => (c.domain || '').includes('github.com'))
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
    for (const { label, assetUrl, fileName } of emitted) {
      let ok = false;
      try {
        const resp = await fetch(assetUrl, { headers: { Cookie: cookieHeader }, redirect: 'follow' });
        ok = resp.ok && (resp.headers.get('content-type') || '').startsWith('image/');
        if (!ok) console.error(`Error: ${fileName} did not resolve to an image (status ${resp.status}).`);
      } catch (e) {
        console.error(`Error verifying ${fileName}: ${String(e)}`);
      }
      if (ok) {
        console.log(`![${label}](${assetUrl})`);
      } else {
        console.error("The session may be stale — run 'gh-embed-image --login' and retry.");
        anyFailed = true;
      }
    }

    // Save refreshed session state
    await saveSession(context);

    // Fail loudly if any image did not produce a verified, resolvable asset.
    if (anyFailed) {
      console.error('One or more images failed to upload — no usable URL was emitted for them.');
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.login) {
    await login();
    if (args.images.length === 0) process.exit(0);
  }

  if (args.images.length === 0) {
    console.error('Usage: gh-embed-image [--login] [--repo owner/repo] [--repo-id ID] <image> [image...]');
    process.exit(1);
  }

  // Resolve repo info if not provided
  if (!args.repo) {
    try {
      args.repo = execSync('gh repo view --json nameWithOwner -q .nameWithOwner', { encoding: 'utf-8' }).trim();
    } catch {
      console.error('Error: Could not determine repo. Use --repo owner/repo or run from a git repo.');
      process.exit(1);
    }
  }

  if (!args.repoId) {
    try {
      args.repoId = execSync(`gh api repos/${args.repo} --jq .id`, { encoding: 'utf-8' }).trim();
    } catch {
      console.error(`Error: Could not get repo ID for ${args.repo}. Check gh auth status.`);
      process.exit(1);
    }
  }

  // Validate image files exist
  for (const img of args.images) {
    if (!existsSync(img)) {
      console.error(`Error: File not found: ${img}`);
      process.exit(1);
    }
    const size = statSync(img).size;
    if (size > 25 * 1024 * 1024) {
      console.error(`Error: File too large (${(size / 1024 / 1024).toFixed(1)}MB): ${img}`);
      console.error('GitHub attachment limit is 25MB.');
      process.exit(1);
    }
  }

  await uploadImages(args.images, args.repo, args.repoId);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});

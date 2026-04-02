#!/usr/bin/env node
/**
 * Renders an HTML file to a PNG screenshot using Playwright.
 * Used to generate flow diagrams for the README.
 *
 * Usage: node lib/render-diagram.mjs <html-file> <output.png> [width]
 */

import { chromium } from 'playwright-core';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

function findChromium() {
  const cacheDir = resolve(homedir(), 'Library', 'Caches', 'ms-playwright');
  try {
    const dirs = readdirSync(cacheDir).filter(d => d.startsWith('chromium-')).sort().reverse();
    for (const dir of dirs) {
      const exe = resolve(cacheDir, dir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
      if (existsSync(exe)) return exe;
    }
  } catch { /* ignore */ }
  const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (existsSync(systemChrome)) return systemChrome;
  return null;
}

const [htmlFile, outputFile, widthStr] = process.argv.slice(2);
if (!htmlFile || !outputFile) {
  console.error('Usage: node render-diagram.mjs <input.html> <output.png> [width]');
  process.exit(1);
}

const width = parseInt(widthStr || '800', 10);
const html = readFileSync(htmlFile, 'utf-8');
const executablePath = findChromium();
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width, height: 600 } });
await page.setContent(html, { waitUntil: 'networkidle' });

const body = await page.$('body');
await body.screenshot({ path: outputFile });
await browser.close();
console.log(`Rendered ${outputFile}`);

/**
 * Shared Playwright helpers: start a Vite server (preview of dist/, or the dev server), launch the locally
 * installed Chrome, collect console errors and warnings.
 */
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, preview, type PreviewServer, type ViteDevServer } from 'vite';

export interface Session {
  url: string;
  browser: Browser;
  close(): Promise<void>;
  newPage(width: number, height: number): Promise<{ page: Page; messages: string[] }>;
}

const CHROME_ARGS = [
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--use-angle=d3d11',
  '--enable-unsafe-swiftshader',
];

export async function startSession(
  mode: 'preview' | 'dev' = 'preview',
  headless = true,
  extraArgs: string[] = [],
): Promise<Session> {
  let server: PreviewServer | ViteDevServer;
  let url: string;
  if (mode === 'preview') {
    const s = await preview({ preview: { port: 4173, strictPort: false, open: false }, logLevel: 'error' });
    server = s;
    url = s.resolvedUrls?.local[0] ?? 'http://localhost:4173/';
  } else {
    const s = await createServer({
      server: { port: 5199, strictPort: false, open: false },
      logLevel: 'error',
    });
    await s.listen();
    server = s;
    url = s.resolvedUrls?.local[0] ?? 'http://localhost:5199/';
  }
  const browser = await chromium.launch({
    channel: 'chrome',
    headless,
    args: [...CHROME_ARGS, ...extraArgs],
  });
  return {
    url,
    browser,
    async close() {
      await browser.close();
      await server.close();
    },
    async newPage(width: number, height: number) {
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const messages: string[] = [];
      page.on('console', (msg) => {
        const t = msg.type();
        if (t === 'error' || t === 'warning') messages.push(`[${t}] ${msg.text()}`);
      });
      page.on('pageerror', (e) => messages.push(`[pageerror] ${e.message}`));
      return { page, messages };
    },
  };
}

/** Navigate to a query and wait until the game reports ready, then let a few frames pass. */
export async function openScene(page: Page, base: string, query: string, settleFrames = 20): Promise<void> {
  await page.goto(base + '?' + query, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__exodus?.ready() === true, undefined, { timeout: 60_000 });
  await page.waitForFunction(
    (n) => (window.__exodus?.frames() ?? 0) > n,
    (await page.evaluate(() => window.__exodus?.frames() ?? 0)) + settleFrames,
    { timeout: 60_000 },
  );
}

export async function saveDataUrl(dataUrl: string, path: string): Promise<void> {
  const { writeFile } = await import('node:fs/promises');
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  await writeFile(path, Buffer.from(b64, 'base64'));
}

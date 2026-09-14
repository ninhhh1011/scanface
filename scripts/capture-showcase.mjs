import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

const credentials = JSON.parse(readFileSync('.local/credentials.json', 'utf8'));
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true
});

mkdirSync('artifacts/verification/screenshots', { recursive: true });

const viewports = [
  { width: 1440, height: 900, name: '1440' },
  { width: 1024, height: 768, name: '1024' },
  { width: 768, height: 1024, name: '768' },
  { width: 390, height: 844, name: '390' }
];

try {
  // 1. Capture Login at different viewports
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:3000/login');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `artifacts/verification/screenshots/login-${vp.name}.png`, fullPage: true });
    await context.close();
  }

  // 2. Login as admin and capture internal pages
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:3000/login');
    await page.getByLabel('Email công việc', { exact: true }).fill('admin@abc.example');
    await page.getByLabel('Mật khẩu', { exact: true }).fill(credentials['admin@abc.example']);
    await page.getByRole('button', { name: 'Đăng nhập →', exact: true }).click();
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).waitFor({ timeout: 45000 });

    const pages = [
      { path: '/dashboard', name: 'dashboard' },
      { path: '/attendance/scan', name: 'attendance-scan' },
      { path: '/assistant', name: 'assistant' },
      { path: '/knowledge-base', name: 'knowledge-base' }
    ];

    for (const p of pages) {
      await page.goto(`http://127.0.0.1:3000${p.path}`);
      await page.waitForTimeout(600);
      await page.screenshot({ path: `artifacts/verification/screenshots/${p.name}-${vp.name}.png`, fullPage: false });
    }

    await context.close();
  }

  console.log(JSON.stringify({ status: 'SUCCESS', count: viewports.length * 5 }));
} finally {
  await browser.close();
}

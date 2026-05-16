// @ts-ignore -- Playwright lives in dev-environment/ rather than the root product manifest.
import playwrightTest from './dev-environment/node_modules/@playwright/test/index.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const { defineConfig, devices } = playwrightTest;
const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEV_SERVER_URL = 'http://127.0.0.1:22302';

export default defineConfig({
    testDir: path.join(APP_ROOT, 'e2e'),
    outputDir: path.join(APP_ROOT, 'test-results'),
    timeout: 30_000,
    expect: {
        timeout: 10_000,
    },
    fullyParallel: false,
    use: {
        baseURL: DEV_SERVER_URL,
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'npm run dev -- --host 127.0.0.1 --port 22302',
        cwd: APP_ROOT,
        url: DEV_SERVER_URL,
        reuseExistingServer: true,
        timeout: 120_000,
    },
});
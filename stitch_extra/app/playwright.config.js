import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/specs',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5300',
    trace: 'off',
    colorScheme: 'light',
    viewport: { width: 1174, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx vite --port 5300 --host 127.0.0.1',
    url: 'http://127.0.0.1:5300/e2e.html',
    reuseExistingServer: true,
    timeout: 60000,
  },
})

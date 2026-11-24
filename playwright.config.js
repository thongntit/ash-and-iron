import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    browserName: 'chromium',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'npm run preview -- --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
  },
});

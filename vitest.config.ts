import react from '@vitejs/plugin-react-swc'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

/**
 * Separate projects because logic, visual baselines and pointer interactions
 * need different environments:
 *
 * - `unit`   — pure logic (dial geometry, time formatting) in node.
 * - `visual` — the real components in a real browser, so CSS Modules and SVG
 *              rendering are actually exercised, with screenshot assertions.
 * - `interaction` — real pointer checks shared by Chromium and Firefox.
 *
 * `npm test` runs `unit`; `npm run test:visual` runs the browser project.
 */
export default defineConfig({
    test: {
        projects: [
            {
                plugins: [react()],
                test: {
                    name: 'interaction',
                    include: ['src/**/*.interaction.test.tsx'],
                    browser: {
                        enabled: true,
                        headless: true,
                        provider: playwright(),
                        instances: [{ browser: 'chromium' }, { browser: 'firefox' }],
                        screenshotFailures: false,
                    },
                },
            },
            {
                test: {
                    name: 'unit',
                    environment: 'node',
                    include: ['src/**/*.test.ts'],
                },
            },
            {
                plugins: [react()],
                test: {
                    name: 'visual',
                    include: ['src/**/*.visual.test.tsx'],
                    browser: {
                        enabled: true,
                        headless: true,
                        provider: playwright(),
                        instances: [{ browser: 'chromium' }],
                        screenshotFailures: false,
                    },
                },
            },
        ],
    },
})

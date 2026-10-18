import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react-swc'
import { defineConfig, type Plugin } from 'vite'
import { renderAlertIcons, renderIcons } from './scripts/icons/render'
import { firefoxManifest } from './scripts/manifest/firefox'
import baseManifest from './src/manifest.json'
import { alertIconPathFor, iconPathFor, iconSizeFromPath, type IconSize } from './src/shared/icons'

const ROOT = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(ROOT, 'src')

/**
 * Files Chrome needs verbatim next to the manifest. Vite only knows about
 * imports, so anything referenced by `manifest.json` is copied by hand.
 */
const STATIC_ASSETS = ['images'] as const

function copyAsset(relativePath: string, dist: string): void {
    const from = resolve(SRC, relativePath)
    if (!existsSync(from)) {
        console.warn('[extension-assets] missing:', relativePath)
        return
    }
    const to = resolve(dist, relativePath)
    mkdirSync(dirname(to), { recursive: true })
    cpSync(from, to, { recursive: true })
}

function extensionAssets(dist: string, manifest: IconBearingManifest) {
    return {
        name: 'extension-assets',
        writeBundle() {
            for (const asset of STATIC_ASSETS) copyAsset(asset, dist)
            writeFileSync(resolve(dist, 'manifest.json'), JSON.stringify(manifest, null, 4) + '\n')
        },
    }
}

interface IconBearingManifest {
    icons?: Record<string, string>
    action?: { default_icon?: Record<string, string> }
}

/**
 * The manifest names the icons Chrome loads, so every path it lists has to exist
 * in the build. Checking the two against each other turns a silently missing
 * icon into a failed build, and catches the likelier mistake too: a size key
 * that disagrees with the file it points at.
 */
function checkManifestIcons(produced: Map<IconSize, Buffer>, manifest: IconBearingManifest): void {
    const declared = { ...manifest.icons, ...manifest.action?.default_icon }
    const problems: string[] = []

    for (const [size, path] of Object.entries(declared)) {
        const named = iconSizeFromPath(path)
        if (named === null) problems.push(`"${size}": "${path}" is not an icon the build renders`)
        else if (named !== Number(size)) problems.push(`"${size}": "${path}" points at the ${named}px icon`)
        else if (!produced.has(named)) problems.push(`"${size}": "${path}" was not rendered`)
    }

    if (problems.length > 0) {
        throw new Error(
            `[icon-assets] manifest.json names icons the build does not produce:\n  ${problems.join('\n  ')}`,
        )
    }
}

/**
 * Chrome's icons are rasterised from one committed SVG, so the sizes can never
 * drift from the art. `dist/` is the only place they are written; the dev server
 * answers the same URLs from memory, because `src/` is the web root there and the
 * browser asks for a favicon no matter what has been built.
 */
function iconAssets(dist: string, manifest: IconBearingManifest): Plugin {
    return {
        name: 'icon-assets',
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                const { pathname } = new URL(request.url ?? '/', 'http://localhost')
                const size = iconSizeFromPath(pathname)
                if (size === null) return next()
                response.setHeader('Content-Type', 'image/png')
                response.setHeader('Cache-Control', 'no-cache')
                response.end(renderIcons().get(size))
            })
        },
        writeBundle() {
            const icons = renderIcons()
            checkManifestIcons(icons, manifest)
            for (const [size, png] of icons) {
                const file = resolve(dist, iconPathFor(size))
                mkdirSync(dirname(file), { recursive: true })
                writeFileSync(file, png)
            }
            // The toolbar alert icon is swapped in at runtime, not named in the
            // manifest, so it is written without the manifest check above.
            for (const [size, png] of renderAlertIcons()) {
                const file = resolve(dist, alertIconPathFor(size))
                mkdirSync(dirname(file), { recursive: true })
                writeFileSync(file, png)
            }
        },
    }
}

export default defineConfig(({ mode }) => {
    const firefox = mode === 'firefox'
    const dist = resolve(ROOT, firefox ? 'dist-firefox' : 'dist')
    const manifest = firefox ? firefoxManifest(baseManifest) : baseManifest
    return {
        // Serving `src/` as the root keeps the dev URLs identical to the built
        // extension (`/popup.html`, `/fullscreen.html`) — that is what makes the
        // design loop a plain `npm run dev`.
        root: SRC,
        // Absolute asset URLs, so moving an HTML entry never breaks its references.
        base: '/',
        plugins: [react(), extensionAssets(dist, manifest), iconAssets(dist, manifest)],
        server: {
            open: '/popup.html',
        },
        build: {
            outDir: dist,
            emptyOutDir: true,
            // Readable output: this bundle is a locally loaded extension, not a website.
            minify: false,
            rollupOptions: {
                input: {
                    popup: resolve(SRC, 'popup.html'),
                    fullscreen: resolve(SRC, 'fullscreen.html'),
                    settings: resolve(SRC, 'settings.html'),
                    ...(!firefox ? { offscreen: resolve(SRC, 'offscreen.html') } : {}),
                    background: resolve(SRC, 'background/index.ts'),
                },
                output: {
                    entryFileNames: 'js/[name].js',
                    chunkFileNames: 'js/[name].js',
                    assetFileNames: 'assets/[name][extname]',
                },
            },
        },
    }
})

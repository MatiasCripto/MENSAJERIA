import { execSync } from 'child_process'
import { existsSync, renameSync, cpSync, rmSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const src = (p) => join(ROOT, 'src', p)
const bak = (p) => join(ROOT, 'src', `__bak_${p.replace(/[/\\]/g, '_')}`)
const bakRoot = (p) => join(ROOT, `__bak_${p.replace(/[/\\]/g, '_')}`)

const moves = [
  { from: src('app/api'), to: bak('api') },
  { from: src('middleware.ts'), to: bakRoot('middleware.ts') },
  { from: src('app/seguimiento'), to: bak('seguimiento') },
]

function saveAndRemove() {
  for (const m of moves) {
    if (existsSync(m.from)) {
      renameSync(m.from, m.to)
      console.log(`  → Saved: ${m.from} → ${m.to}`)
    }
  }
}

function restore() {
  for (const m of moves) {
    if (existsSync(m.to)) {
      renameSync(m.to, m.from)
      console.log(`  → Restored: ${m.to} → ${m.from}`)
    }
  }
}

function main() {
  console.log('=== Capacitor build ===')
  console.log('')

  // 1. Clean cached types
  const nextDir = join(ROOT, '.next')
  if (existsSync(nextDir)) {
    console.log('Cleaning cached build types...')
    rmSync(nextDir, { recursive: true })
    console.log('  → Removed .next/')
  }

  // 2. Save conflicting routes
  console.log('Saving non-exportable routes...')
  saveAndRemove()

  // 3. Build
  console.log('')
  console.log('Building Next.js for static export...')
  try {
    execSync('npx next build', {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, CAPACITOR_BUILD: 'true' },
    })
    console.log('')
    console.log('Build successful!')
  } catch (err) {
    console.error('')
    console.error('Build failed:', err.message)
    console.log('Restoring routes...')
    restore()
    process.exit(1)
  }

  // 3. Sync Capacitor
  console.log('')
  console.log('Syncing Capacitor...')
  try {
    execSync('npx cap copy android', { cwd: ROOT, stdio: 'inherit' })
    execSync('npx cap sync android', { cwd: ROOT, stdio: 'inherit' })
    console.log('')
    console.log('Capacitor sync complete!')
  } catch (err) {
    console.error('')
    console.error('Capacitor sync failed:', err.message)
  }

  // 4. Restore routes
  console.log('')
  console.log('Restoring routes...')
  restore()

  // 5. Add background location permission to AndroidManifest
  const manifestPath = join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml')
  if (existsSync(manifestPath)) {
    console.log('')
    console.log('Adding background location permission to AndroidManifest.xml...')
    let manifest = readFileSync(manifestPath, 'utf-8')
    if (!manifest.includes('ACCESS_BACKGROUND_LOCATION')) {
      manifest = manifest.replace(
        '</manifest>',
        '    <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />\n</manifest>'
      )
      writeFileSync(manifestPath, manifest, 'utf-8')
      console.log('  → Added ACCESS_BACKGROUND_LOCATION permission')
    } else {
      console.log('  → Already present, skipping')
    }
  }

  console.log('')
  console.log('=== Done! Open android/ in Android Studio with: npx cap open android ===')
}

main()

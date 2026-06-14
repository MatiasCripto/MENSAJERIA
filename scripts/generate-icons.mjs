import sharp from 'sharp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const src = join(ROOT, 'public', 'iconapk.png')

async function main() {
  const sizes = [192, 512]
  for (const size of sizes) {
    await sharp(src)
      .resize(size, size)
      .png()
      .toFile(join(ROOT, 'public', `icon-${size}.png`))
    console.log(`Generated icon-${size}.png`)
  }
}
main().catch(console.error)

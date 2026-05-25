import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const svg = readFileSync('build/icon-source.svg')
mkdirSync('resources', { recursive: true })

await sharp(svg).resize(512, 512).png().toFile('resources/icon.png')
await sharp(svg).resize(512, 512).png().toFile('build/icon.png')

const sizes = [16, 24, 32, 48, 64, 128, 256]
const pngs = await Promise.all(sizes.map((s) => sharp(svg).resize(s, s).png().toBuffer()))
writeFileSync('build/icon.ico', await pngToIco(pngs))

console.log('icons generated: resources/icon.png, build/icon.png, build/icon.ico')

import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] || 'src')
const sourceExtensions = new Set(['.jsx', '.css'])

function gray(red, green, blue) {
  return Math.round((red * 0.2126) + (green * 0.7152) + (blue * 0.0722))
}

function toMonoColor(source) {
  return source
    .replace(/#([0-9a-f]{3,8})\b/gi, (match, hex) => {
      const full = hex.length === 3 || hex.length === 4
        ? hex.slice(0, 3).split('').map(value => value + value).join('') + (hex.length === 4 ? hex[3] + hex[3] : '')
        : hex
      const alpha = full.length === 8 ? full.slice(6) : ''
      const base = full.slice(0, 6)
      const mono = gray(parseInt(base.slice(0, 2), 16), parseInt(base.slice(2, 4), 16), parseInt(base.slice(4, 6), 16)).toString(16).padStart(2, '0')
      return `#${mono}${mono}${mono}${alpha}`
    })
    .replace(/rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(,\s*[^)]+)?\)/gi, (match, red, green, blue, alpha = '') => {
      const value = gray(Number(red), Number(green), Number(blue))
      return `rgb${alpha ? 'a' : ''}(${value},${value},${value}${alpha})`
    })
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes:true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(absolute)
    else if (sourceExtensions.has(path.extname(entry.name))) {
      const original = fs.readFileSync(absolute, 'utf8')
      const revised = toMonoColor(original)
      if (revised !== original) fs.writeFileSync(absolute, revised)
    }
  }
}

walk(root)

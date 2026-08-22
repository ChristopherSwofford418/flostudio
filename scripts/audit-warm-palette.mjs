import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] || 'src')
const files = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    if (entry.isFile() && /\.(jsx|js|css)$/.test(entry.name)) files.push(full)
  }
}

function hexToRgb(hex) {
  const value = hex.slice(1)
  const expanded = value.length === 3 ? value.split('').map(char => char + char).join('') : value
  return [0, 2, 4].map(index => Number.parseInt(expanded.slice(index, index + 2), 16))
}

function isGreenDominant([red, green, blue]) {
  return green > red + 18 && green > blue + 12 && green > 70
}

walk(root)
const findings = []

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/#[0-9a-fA-F]{3,6}\b/g)) {
      const rgb = hexToRgb(match[0])
      if (isGreenDominant(rgb)) findings.push({ file:path.relative(process.cwd(), file), line:index + 1, token:match[0], rgb })
    }
    for (const match of line.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
      const rgb = match.slice(1, 4).map(Number)
      if (isGreenDominant(rgb)) findings.push({ file:path.relative(process.cwd(), file), line:index + 1, token:match[0], rgb })
    }
  })
}

console.log(JSON.stringify(findings, null, 2))

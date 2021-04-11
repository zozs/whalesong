import fs from 'fs/promises'
import os from 'os'
import path from 'path'

export async function baseDir (makeDir = true) {
  const baseDir = process.env.WHALESONG_DATA ?? path.join(
    os.homedir(),
    '.whalesong'
  )
  if (makeDir) {
    await fs.mkdir(baseDir, { recursive: true })
  }
  return baseDir
}

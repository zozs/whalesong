import fs from 'fs/promises'
import os from 'os'
import path from 'path'

export async function baseDir () {
  const baseDir = path.join(
    os.homedir(),
    '.whalesong'
  )
  await fs.mkdir(baseDir, { recursive: true })
  return baseDir
}
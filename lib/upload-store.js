import fs from 'fs/promises'
import fsCb from 'fs'
import path from 'path'
import Debug from 'debug'
import { pipeline } from 'stream/promises'
import { baseDir } from './utils.js'
import { v4 as uuidv4 } from 'uuid'

const debug = Debug('whalesong:uploads')

class UploadStore {
  async init () {
    this.uploadDir = path.join(await baseDir(), 'uploads')
    await fs.mkdir(this.uploadDir, { recursive: true })

    // TODO: Check if there are any old uploads that should be pruned periodically.
  }

  async appendUpload (uuid, stream) {
    const filename = await this.uploadPath(uuid)
    await pipeline(
      stream,
      fsCb.createWriteStream(filename, { flags: 'a' })
    )
    const stat = await fs.stat(filename)
    debug(`appended new data to upload uuid ${uuid}, new size ${stat.size}`)
    return stat.size
  }

  async finishUpload (uuid) {
    const filename = await this.uploadPath(uuid)
    debug(`now removing finished upload with uuid ${uuid}`)
    await fs.unlink(filename)
  }

  /** Returns the data of the upload as a stream. */
  async getUpload (uuid) {
    const filename = await this.uploadPath(uuid)
    return fsCb.createReadStream(filename)
  }

  async newUpload () {
    const uuid = uuidv4()
    debug(`created new upload with uuid ${uuid}`)
    return uuid
  }

  async uploadPath (uuid) {
    return path.join(this.uploadDir, uuid)
  }
}

export default UploadStore

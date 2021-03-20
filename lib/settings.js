import Debug from 'debug'

const debug = Debug('whalesong:settings')

class Settings {
  constructor (settingsBee) {
    this.bee = settingsBee
    debug(`created settings object from bee with key ${this.bee.feed.key.toString('hex')}`)
  }

  async addSubscribedFeed (pubKey) {
    // adds a pubKey to the list of feeds we subscribe to. we store the hex values.
    if (Buffer.isBuffer(pubKey)) {
      pubKey = pubKey.toString('hex')
    }

    await this.bee.sub('feeds').put(pubKey, {})
    debug(`stored feed ${pubKey} in subscribe list.`)
  }

  async getSubscribedFeeds () {
    // returns a list of all feeds I have subscribed to.
    const keys = []
    for await (const { key } of this.bee.sub('feeds', { valueEncoding: 'binary' }).createReadStream()) {
      keys.push(key)
    }
    return keys
  }

  async removeSubscribedFeed (pubKey) {
    // removes a feed from the list of feeds we're subscribed to.
    if (Buffer.isBuffer(pubKey)) {
      pubKey = pubKey.toString('hex')
    }

    await this.bee.sub('feeds', { valueEncoding: 'binary' }).del(pubKey)
    debug(`removed feed ${pubKey} from subscribe list.`)
  }
}

export default Settings

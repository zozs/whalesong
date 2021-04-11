#!/usr/bin/env node

import path from 'path'
import hypercore from 'hypercore'
import Hyperbee from 'hyperbee'
import { baseDir } from '../lib/utils.js'

const myArgs = process.argv.slice(2)

if (myArgs.length !== 1) {
  console.error('usage: hyperbee-dump.js <feedid>')
  process.exit(1)
}

main(myArgs[0]).catch(e => console.error(`top-level exception: ${e}`))

async function main (feed) {
  const corePath = path.join(await baseDir(), 'hypercores', feed)

  const core = hypercore(corePath, { createIfMissing: false })

  const bee = new Hyperbee(core, {
    keyEncoding: 'utf-8',
    valueEncoding: 'binary'
  })
  await bee.ready()

  for await (const { key, value } of bee.createReadStream()) {
    console.log(`${key} ==> ${value}`)
  }
}

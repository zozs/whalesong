# Troubleshooting

## Debugging

To see a (verbose) debug log use:

`DEBUG=* node index.js`

## Docker returns "Not Found" or hangs when pulling an image

Either the sync is slow because you are not yet a part of the network, try waiting a minute or two, and then try to pull the image again.

You may also have a firewall problem. If the pull just seems to hang, this is most probably due to IPFS failing to connect to other peers.

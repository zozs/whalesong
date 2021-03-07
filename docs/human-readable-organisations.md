# Human-readable organisations/pubkeys

When using `localhost:5005/efb166fd6a9cb83bdc3d58f362f5a7052c730924b614989b0fbd730cd77a6c2c/hello:latest` as the URL for whalesong, you rely solely on hypercores and IPFS. However, the long public key of the hypercore (`efb166fd6a9cb83bdc3d58f362f5a7052c730924b614989b0fbd730cd77a6c2c`) is not very friendly for humans. Therefore, whalesong also supports human-readable organisation names, by using [dat-dns](https://github.com/datprotocol/dat-dns).

In short, this means that the URL above can also be written as:

`localhost:5005/whalesong.club/hello:latest`

The works by adding a `/.well-known/whalesong` file to the webserver on `whalesong.club`.

The `/.well-known/whalesong` file has the contents
```
whalesong://efb166fd6a9cb83bdc3d58f362f5a7052c730924b614989b0fbd730cd77a6c2c
ttl=3600
```

which points to the desired public key.

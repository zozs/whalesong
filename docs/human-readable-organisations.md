# Human-readable organisations/pubkeys

When using `localhost:5005/8361c37efa52cb2809f459fcf2559966dd384787f7ea6f0475c168ac069a31fb/hello:latest` as the URL for whalesong, you rely solely on hypercores and IPFS. However, the long public key of the hypercore (`8361c37efa52cb2809f459fcf2559966dd384787f7ea6f0475c168ac069a31fb`) is not very friendly for humans. Therefore, whalesong also supports human-readable organisation names, by using [dat-dns](https://github.com/datprotocol/dat-dns).

In short, this means that the URL above can also be written as:

`localhost:5005/whalesong.club/hello:latest`

The works by adding a `/.well-known/whalesong` file to the webserver on `whalesong.club`.

The `/.well-known/whalesong` file has the contents
```
whalesong://8361c37efa52cb2809f459fcf2559966dd384787f7ea6f0475c168ac069a31fb
ttl=3600
```

which points to the desired public key.

# Human-readable organisations/pubkeys

When using `localhost:5005/6d724d1a58ad3e11c8e892be07d099f949de01903b1a71edd52431ad9a017c06/hello:latest` as the URL for whalesong, you rely solely on hypercores and IPFS. However, the long public key of the hypercore (`6d724d1a58ad3e11c8e892be07d099f949de01903b1a71edd52431ad9a017c06`) is not very friendly for humans. Therefore, whalesong also supports human-readable organisation names, by using [dat-dns](https://github.com/datprotocol/dat-dns).

In short, this means that the URL above can also be written as:

`localhost:5005/whalesong.club/hello:latest`

The works by adding a `/.well-known/whalesong` file to the webserver on `whalesong.club`.

The `/.well-known/whalesong` file has the contents
```
whalesong://6d724d1a58ad3e11c8e892be07d099f949de01903b1a71edd52431ad9a017c06
ttl=3600
```

which points to the desired public key.

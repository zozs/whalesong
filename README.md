# whalesong

Distributed container registry built on hypercores and IPFS

## Installation

Requirements:

* Node 14 or later

Clone this repository, and install dependencies.

```
git clone https://github.com/zozs/whalesong
cd whalesong
npm install
```

## Usage

Launch the daemon by running

`node index.js`

inside the directory above. When the deamon is up, you now have a container registry listening on port 5005. You can then try to push and pull to the distributed registry.

To see a (verbose) debug log use:

`DEBUG=* node index.js`

### Example

After launching the daemon above, open a new shell, and try to pull and run the following test image, which will print a small greeting on your screen.

```
$ docker run localhost:5005/efb166fd6a9cb83bdc3d58f362f5a7052c730924b614989b0fbd730cd77a6c2c/hello:latest
A distributed greeting to you, my friend :)
```

Alternatively, you can use the following commands to pull the same image, but using a human-readable name (see [Human-readable organisations/pubkeys](#human-readable-organisationspubkeys) below for an explanation on how this works).

```
$ docker run localhost:5005/whalesong.club/hello
A distributed greeting to you, my friend :)
```

If the example doesn't seem to work, or Docker returns `"Not Found"`, you may have to wait a minute or two if the sync is slow.

### Pull an image

A container image can be pulled using docker with

`docker pull <url of image>`

where the url will be of the following form for whalesong:

`localhost:5005/efb166fd6a9cb83bdc3d58f362f5a7052c730924b614989b0fbd730cd77a6c2c/hello:latest`

The url consists of the following parts:

* `localhost:5005`: The url of the registry that is running on your local machine. You will always use this url for both pulling from and pushing to the distributed registry.
* `efb166fd6a9cb83bdc3d58f362f5a7052c730924b614989b0fbd730cd77a6c2c`: A long hexadecimal string, which is the encoded public key of the organisation/person whose image you want to pull or push. You can only push to public keys you own, but can pull from any public key you know of.
* `hello:latest`: The image name (`hello`) and tag (`latest`) for the given image you want to pull. An organization or person may have multiple images and tags.

### Push an image

A container image can be pushed using docker with

`docker push <url of image>`

where the url must contain the url of the localhost registry,as well as your own public key, and the name you want to give your image. Your own public key is printed when you launch the daemon.

For example, assuming you have the public key `abcd1234`, and a Dockerfile in the current directory, build and push the image using:

```
docker build -t localhost:5005/abcd1234/myownimage:latest .
docker push localhost:5005/abcd1234/myownimage:latest
```

Anyone else running `whalesong` can now pull your image using the url `localhost:5005/abcd1234/myownimage:latest` and run it on their own computer.

### Human-readable organisations/pubkeys

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

### Other facts

The data is stored in the `~/.whalesong` directory in your home.

## Todo

* Make container registry pass conformance tests (see below).
* Increase performance and reduce memory usage by not caching layers in memory when passing them between IPFS and the registry.
* Support more registry operations, such as content discovery and content management.
* Support multiple writable feeds from a single host.
* Cleanup of unused blobs.
* General reliability improvements.
* Automatically prune old and failed/aborted uploads.
* Add tests.

## Conformance

The current implementation of the container registry does _not_ fully conform to the [Open Container Initiative Distribution Specification](https://github.com/opencontainers/distribution-spec/blob/master/spec.md). It seems to work well enough with Docker anyway, but it would be nice to make the conformance tests pass.

## License

Whalesong is licensed under GNU AGPL v3 or later, see the `LICENSE` file for the full license.

```
whalesong - distributed container registry
Copyright (c) 2020, 2021, Linus Karlsson

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
```

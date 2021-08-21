# whalesong

Distributed container registry built on hypercores and IPFS

## Installation

Requirements:

* Node 15 or later

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

### Example

After launching the daemon above, open a new shell, and try to pull and run the following test image, which will print a small greeting on your screen.

```
$ docker run localhost:5005/8361c37efa52cb2809f459fcf2559966dd384787f7ea6f0475c168ac069a31fb/hello:latest
A distributed greeting to you, my friend :)
```

Alternatively, you can use the following commands to pull the same image, but using a human-readable name (see [Human-readable organisations/pubkeys](docs/human-readable-organisations.md) in `docs/` for an explanation on how this works).

```
$ docker run localhost:5005/whalesong.club/hello
A distributed greeting to you, my friend :)
```

If the example doesn't seem to work, or Docker returns `"Not Found"`, you may have to wait a minute or two if the sync is slow.

### Pull an image

A container image can be pulled using docker with

`docker pull <url of image>`

where the url will be of the following form for whalesong:

`localhost:5005/8361c37efa52cb2809f459fcf2559966dd384787f7ea6f0475c168ac069a31fb/hello:latest`

The url consists of the following parts:

* `localhost:5005`: The url of the registry that is running on your local machine. You will always use this url for both pulling from and pushing to the distributed registry.
* `8361c37efa52cb2809f459fcf2559966dd384787f7ea6f0475c168ac069a31fb`: A long hexadecimal string, which is the encoded public key of the organisation/person whose image you want to pull or push. You can only push to public keys you own, but can pull from any public key you know of.
* `hello:latest`: The image name (`hello`) and tag (`latest`) for the given image you want to pull. An organization or person may have multiple images and tags.

### Push an image

A container image can be pushed using docker with

`docker push <url of image>`

where the url must contain the url of the localhost registry,as well as your own public key, and the name you want to give your image. **Your own public key is printed when you launch the daemon.**

For example, assuming you have the public key `abcd1234`, and a Dockerfile in the current directory, build and push the image using:

```
docker build -t localhost:5005/abcd1234/myownimage:latest .
docker push localhost:5005/abcd1234/myownimage:latest
```

Anyone else running `whalesong` can now pull your image using the url `localhost:5005/abcd1234/myownimage:latest` and run it on their own computer.

### Other facts

The data is stored in the `~/.whalesong` directory in your home.
If you want to get a fresh start, you can delete it, but _your private keys will disappear_ so don't do this unless you know what you're doing.

## Todo

* Make container registry pass conformance tests (see [docs/conformance.md](docs/conformance.md)).
* Support more registry operations, such as content discovery and content management.
* Support multiple writable feeds from a single host.
* Cleanup of unused blobs.
* General reliability improvements.
* Automatically prune old and failed/aborted uploads.
* Extend tests.
* Provide service files to launch whalesong on boot.
* Build and push with kaniko in addition to current push/pull tests.
* Multi-writer so that multiple hosts can write to a single feed.

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

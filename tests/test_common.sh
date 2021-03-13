#!/usr/bin/env bash

TEST_IMAGE="python:3.9-slim"
FULL_TEST_IMAGE="docker.io/library/$TEST_IMAGE"

whalesong_image() {
	# Get our own whalesong url, wait for up to 25 sec if whalesong isn't initialized yet.
	tries=0
	max_tries=6
	set +e
	while [ $tries -le $max_tries ]; do
		WHALESONG_BASE=$(curl -sS http://localhost:5005/whalesong/url)
		if [ $? -eq 0 ]; then
			break
		fi
		sleep 5
		tries=$(( $tries + 1))
	done
	if [ $tries -ge $max_tries ]; then
		>&2 echo "Failed to get whalesong base url"
		exit 1
	fi
	set -e
	WHALESONG_IMAGE="${WHALESONG_BASE}/${TEST_IMAGE}"
	echo "$WHALESONG_IMAGE"
	>&2 echo "Got base url $WHALESONG_BASE"
}

echo "Getting base url for whalesong"
WHALESONG_IMAGE=$(whalesong_image)
set -x

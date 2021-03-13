#!/usr/bin/env bash
set -e

# sets test image and gets base url variables used in tests.
source test_common.sh

# Test pushing with docker, and pulling with containerd
docker pull "$TEST_IMAGE"
docker tag "$TEST_IMAGE" "$WHALESONG_IMAGE"

# Push using docker
docker push "$WHALESONG_IMAGE"

# Pull using containerd
ctr image pull --plain-http "$WHALESONG_IMAGE"

# Run image using containerd
OUTPUT=$(ctr run --rm "$WHALESONG_IMAGE" testcontainer python -c 'print("hi from ci")')

if [[ $OUTPUT == "hi from ci" ]]; then
	echo "Pull/push test successful!"
else
	echo "Pull/push test failed!"
	exit 1
fi

# Optional in CI: cleanup
set +e
docker rmi "$TEST_IMAGE" "$WHALESONG_IMAGE" || true
ctr image rm "$WHALESONG_IMAGE" || true


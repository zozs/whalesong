#!/usr/bin/env bash
set -e

# sets test image and gets base url variables used in tests.
source test_common.sh

# Test pushing with containerd, and pulling with docker
ctr image pull "$FULL_TEST_IMAGE"
ctr image tag "$FULL_TEST_IMAGE" "$WHALESONG_IMAGE"

# Push using containerd
ctr image push --platform amd64 --plain-http "$WHALESONG_IMAGE"

# Pull using docker
docker pull "$WHALESONG_IMAGE"

# Run image using docker
OUTPUT=$(docker run --rm "$WHALESONG_IMAGE" python -c 'print("hi from ci")')

if [[ $OUTPUT == "hi from ci" ]]; then
	echo "Pull/push test successful!"
else
	echo "Pull/push test failed!"
	exit 1
fi

# Optional in CI: cleanup
set +e
ctr image rm "$FULL_TEST_IMAGE" "$WHALESONG_IMAGE" || true
docker rmi "$WHALESONG_IMAGE" || true


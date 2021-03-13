#!/usr/bin/env bash
set -e

# sets test image and gets base url variables used in tests.
source test_common.sh

# Test pushing with docker, and pulling with docker again.
docker pull "$TEST_IMAGE"
docker tag "$TEST_IMAGE" "$WHALESONG_IMAGE"

# Push using docker
docker push "$WHALESONG_IMAGE"

# Clear docker before pulling again.
docker rmi "$TEST_IMAGE" "$WHALESONG_IMAGE"

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
docker rmi "$WHALESONG_IMAGE" || true

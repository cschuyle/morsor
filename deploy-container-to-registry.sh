set -e

usage() {
  echo "Usage: $0 [-h|--help] [-f|--force]
    --force allow uncommitted changes to be deployed" >&2
}

force=false
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    -f|--force) force=true ;;
    *) usage; exit 1 ;;
  esac
  shift
done

if [ "$force" != true ] && [ -n "$(git status --porcelain)" ]; then
  echo "Error: there are uncommitted changes. Commit or stash them before deploying, or use -f to force." >&2
  exit 1
fi

# Default image coordinates
: "${MOOCHO_REGISTRY:=namespace/morsor}"

# Derive unified version string if not already provided
if [ -z "${MOOCHO_VERSION:-}" ]; then
  GIT_SHA_SHORT="$(git rev-parse --short=7 HEAD)"
  BUILD_DATE="$(date +%Y%m%d)"
  # 24-hour HHMM timestamp
  BUILD_TIME_HHMM="$(date +%H%M)"
  MOOCHO_VERSION="${BUILD_DATE}-${BUILD_TIME_HHMM}-${GIT_SHA_SHORT}"
fi

echo "Using MOOCHO_VERSION=${MOOCHO_VERSION}"

# Note: MOOCHO_ARCHITECTURE for cloud is probably linux/amd64
if [ -n "${MOOCHO_ARCHITECTURE}" ]; then
  echo "Building for architecture: ${MOOCHO_ARCHITECTURE}"
  (set -x && docker build --platform "${MOOCHO_ARCHITECTURE}" \
    --build-arg MOOCHO_VERSION="${MOOCHO_VERSION}" \
    -t morsor \
    -t "${MOOCHO_REGISTRY}:${MOOCHO_VERSION}" \
    -t "${MOOCHO_REGISTRY}:latest" \
    .)
else
  echo "Building for host architecture"
  (set -x && docker build \
    --build-arg MOOCHO_VERSION="${MOOCHO_VERSION}" \
    -t morsor \
    -t "${MOOCHO_REGISTRY}:${MOOCHO_VERSION}" \
    -t "${MOOCHO_REGISTRY}:latest" \
    .)
fi
docker push "${MOOCHO_REGISTRY}:${MOOCHO_VERSION}"
docker push "${MOOCHO_REGISTRY}:latest"

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

moocho_registry_default="namespace/morsor"

# Default image coordinates
: "${MOOCHO_REGISTRY:=$moocho_registry_default }"

# Derive unified version string if not already provided
if [ -z "${MOOCHO_VERSION:-}" ]; then
  GIT_SHA_SHORT="$(git rev-parse --short=7 HEAD)"
  BUILD_DATE="$(date +%Y%m%d)"
  # 24-hour HHMM timestamp, zero-padded to 4 digits (e.g. 0016, 1430)
  BUILD_TIME_HHMM="$(date +%H%M)"
  BUILD_TIME_HHMM="$(printf '%04d' $((10#${BUILD_TIME_HHMM})))"
  MOOCHO_VERSION="${BUILD_DATE}-${BUILD_TIME_HHMM}-${GIT_SHA_SHORT}"
fi

if [[ "$MOOCHO_REGISTRY" == "$moocho_registry_default" ]]
then
  echo "
*** WARNING *** Using the default Docker registy name '$MOOCHO_REGISTRY'. 
You should change it. See envrc=template for more information.
"
fi

echo "Using Docker registry coordinates '$MOOCHO_REGISTRY:$MOOCHO_VERSION'"

# Verify we can actually push to the target registry before doing the (slow) build.
# Only handles Docker Hub (docker.io); other registries get a best-effort reminder instead.
check_docker_hub_push_access() {
  local target="$1"
  local host repo first_segment

  case "$target" in
    */*)
      first_segment="${target%%/*}"
      if [[ "$first_segment" == *.* || "$first_segment" == *:* || "$first_segment" == "localhost" ]]; then
        host="$first_segment"
        repo="${target#*/}"
      else
        host="docker.io"
        repo="$target"
      fi
      ;;
    *)
      host="docker.io"
      repo="$target"
      ;;
  esac

  if [ "$host" != "docker.io" ]; then
    echo "Registry host '$host' is not Docker Hub; skipping automated push-access check." >&2
    echo "If 'docker push' later fails with an auth error, run: docker login $host" >&2
    return 0
  fi

  if ! command -v jq >/dev/null 2>&1; then
    echo "Warning: 'jq' not found, skipping automated Docker Hub auth check." >&2
    return 0
  fi

  local hub_repo="$repo"
  case "$hub_repo" in */*) ;; *) hub_repo="library/$hub_repo" ;; esac

  local server_key="https://index.docker.io/v1/"
  local creds_store cred_json username secret

  creds_store="$(jq -r '.credsStore // empty' "$HOME/.docker/config.json" 2>/dev/null)"
  if [ -n "$creds_store" ] && command -v "docker-credential-$creds_store" >/dev/null 2>&1; then
    cred_json="$(printf '%s' "$server_key" | "docker-credential-$creds_store" get 2>/dev/null)"
    username="$(printf '%s' "$cred_json" | jq -r '.Username // empty' 2>/dev/null)"
    secret="$(printf '%s' "$cred_json" | jq -r '.Secret // empty' 2>/dev/null)"
  fi

  if [ -z "$username" ] || [ -z "$secret" ]; then
    local auth_b64 decoded
    auth_b64="$(jq -r --arg s "$server_key" '.auths[$s].auth // empty' "$HOME/.docker/config.json" 2>/dev/null)"
    if [ -n "$auth_b64" ]; then
      decoded="$(printf '%s' "$auth_b64" | base64 -d 2>/dev/null)"
      username="${decoded%%:*}"
      secret="${decoded#*:}"
    fi
  fi

  if [ -z "$username" ] || [ -z "$secret" ]; then
    echo "Error: Docker is not logged in to Docker Hub." >&2
    echo "Recover with: docker login" >&2
    echo "Then re-run this script." >&2
    return 1
  fi

  local token
  token="$(curl -fsS -u "${username}:${secret}" \
    "https://auth.docker.io/token?service=registry.docker.io&scope=repository:${hub_repo}:push,pull" 2>/dev/null \
    | jq -r '.token // empty')"

  if [ -z "$token" ]; then
    echo "Error: Could not authenticate to Docker Hub as '${username}'." >&2
    echo "Your saved credentials may be stale or expired." >&2
    echo "Recover with: docker login" >&2
    echo "Then re-run this script." >&2
    return 1
  fi

  local payload granted
  payload="$(printf '%s' "$token" | cut -d. -f2 | tr '_-' '/+')"
  case $(( ${#payload} % 4 )) in
    2) payload="${payload}==" ;;
    3) payload="${payload}=" ;;
  esac
  granted="$(printf '%s' "$payload" | base64 -d 2>/dev/null | jq -r '[.access[]?.actions[]?] | join(",")' 2>/dev/null)"

  case ",$granted," in
    *,push,*)
      echo "Docker Hub auth OK: '${username}' has push access to '${hub_repo}'."
      return 0
      ;;
    *)
      echo "Error: logged in to Docker Hub as '${username}', but that account lacks push access to '${hub_repo}'." >&2
      echo "Recover by either:" >&2
      echo "  - running 'docker login' as an account with write access to ${hub_repo}, or" >&2
      echo "  - setting MOOCHO_REGISTRY to a repo '${username}' can push to." >&2
      return 1
      ;;
  esac
}

check_docker_hub_push_access "$MOOCHO_REGISTRY" || exit 1

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

# Tag this commit with the deployed version and push the tag
tag="release-v${MOOCHO_VERSION}"
set +x
git tag -a "$tag" -m "Deploy moocho version ${MOOCHO_VERSION} to ${MOOCHO_REGISTRY}"
git push origin "$tag"

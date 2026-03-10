const envVersion = import.meta.env.VITE_APP_VERSION

// In real builds, VITE_APP_VERSION is provided by the deploy script via Docker build args.
// For local dev without that env, fall back to a simple dev marker.
export const APP_VERSION = envVersion && envVersion !== '' ? envVersion : 'dev'


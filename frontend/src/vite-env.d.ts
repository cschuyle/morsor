/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean
  readonly VITE_DEV_API_TOKEN?: string
  readonly VITE_APP_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

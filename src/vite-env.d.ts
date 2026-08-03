/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SKIP_LOGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

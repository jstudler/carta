/// <reference types="vite/client" />

declare const __COMMIT_HASH__: string;

declare module 'virtual:content-index' {
  import type { ContentIndex } from '../shared/contentTypes';
  const index: ContentIndex;
  export default index;
}

/// <reference types="vite/client" />

declare module '*.css' {
  const styles: Record<string, string>;
  export default styles;
}

interface Window {
  __EV_BOOTED__?: boolean;
}

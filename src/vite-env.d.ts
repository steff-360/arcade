/// <reference types="vite/client" />

interface Window {
  localStorage: Storage
}

declare module '*.css' {
  const content: { [key: string]: string }
  export default content
}

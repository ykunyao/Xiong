export {};

declare global {
  interface Window {
    xiong: {
      app: {
        getVersion(): Promise<string>;
      };
    };
  }
}

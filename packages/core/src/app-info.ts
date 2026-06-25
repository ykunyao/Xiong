export interface AppInfo {
  readonly name: 'Xiong';
  readonly version: string;
}

export function createAppInfo(version: string): Readonly<AppInfo> {
  return Object.freeze({
    name: 'Xiong',
    version,
  });
}

import { createAppInfo } from '@xiong/core';
import { useEffect, useState } from 'react';

export function App(): React.JSX.Element {
  const [version, setVersion] = useState('0.1.0');
  const appInfo = createAppInfo(version);

  useEffect(() => {
    void window.xiong.app.getVersion().then(setVersion);
  }, []);

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="app-title">
        <p className="eyebrow">Phase 0 · Desktop Foundation</p>
        <h1 id="app-title">{appInfo.name}</h1>
        <p className="summary">一个本地优先、可调试的 AI 角色扮演桌面应用。</p>
        <dl className="status-grid">
          <div>
            <dt>桌面壳</dt>
            <dd>Electron 安全模式</dd>
          </div>
          <div>
            <dt>核心边界</dt>
            <dd>平台无关 TypeScript</dd>
          </div>
          <div>
            <dt>版本</dt>
            <dd>{appInfo.version}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}

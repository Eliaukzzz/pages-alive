/**
 * Keep Alive · 隔离世界桥接脚本
 *
 * MAIN world 的脚本拿不到 chrome.* API，所以由这里：
 *   - 把用户的行为配置转发进去
 *   - 告诉后台"这个标签页已经被保护了"，用来点亮图标角标
 *
 * 真正干活的是 inject.js。
 */
(() => {
  'use strict';

  const CHANNEL = '__keep_alive__';
  const STORAGE_KEY = 'keepAlive.state';

  const post = (type, extra) => {
    try {
      window.postMessage({ __keepAlive: CHANNEL, type, ...extra }, '*');
    } catch {
      /* ignore */
    }
  };

  const pushConfig = async () => {
    try {
      const data = await chrome.storage.sync.get(STORAGE_KEY);
      const behavior = data?.[STORAGE_KEY]?.behavior || {};
      post('config', {
        config: {
          keepAnimationFrames: behavior.keepAnimationFrames !== false,
          blockBackgroundEvents: behavior.blockBackgroundEvents !== false,
        },
      });
    } catch {
      /* 扩展被重载时 chrome.* 会失效，忽略 */
    }
  };

  window.addEventListener(
    'message',
    (event) => {
      if (event.source !== window && event.source !== null) return;
      const data = event.data;
      if (!data || typeof data !== 'object' || data.__keepAlive !== CHANNEL) return;
      if (data.type === 'hello') pushConfig();
    },
    false,
  );

  // 主动推一次，再在关键节点补推，避免和 MAIN world 的注入顺序赛跑。
  pushConfig();
  document.addEventListener('DOMContentLoaded', pushConfig, { once: true });
  window.addEventListener('load', pushConfig, { once: true });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'keepAlive:ping') return undefined;
    sendResponse({ ok: true, href: location.href });
    return undefined;
  });

  if (window === window.top) {
    const report = () => {
      try {
        chrome.runtime.sendMessage({ type: 'keepAlive:status', url: location.href }).catch(() => {});
      } catch {
        /* ignore */
      }
    };
    report();
    document.addEventListener('DOMContentLoaded', report, { once: true });
  }
})();

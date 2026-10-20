/**
 * Keep Alive · 页面世界引导脚本（document_start，MAIN world）
 *
 * 目标只有一个：让页面永远相信"标签页是可见的、聚焦的"。
 * 这样各家的播放器就不会在切到后台时把视频流降级成纯音频、也不会
 * 在切回来时重新初始化解码器造成卡顿。
 *
 * 做四件事：
 *   1. 改写 document.hidden / visibilityState（以及 webkit 前缀版本）
 *   2. 改写 document.hasFocus()
 *   3. 在 window 捕获阶段吞掉 visibilitychange / blur
 *   4. 后台时用定时器接管 requestAnimationFrame（可选，保活渲染循环）
 *
 * 全部逻辑都包在 try/catch 里：任何一步失败都不能影响页面本身。
 */
(() => {
  'use strict';

  const W = window;
  const INSTALLED = '__keepAliveInstalled__';
  if (W[INSTALLED]) return;

  try {
    Object.defineProperty(W, INSTALLED, {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  } catch {
    W[INSTALLED] = true;
  }

  const CHANNEL = '__keep_alive__';
  const config = {
    keepAnimationFrames: true,
    blockBackgroundEvents: true,
  };

  const docProto = Document.prototype;
  const descriptors = {
    hidden: Object.getOwnPropertyDescriptor(docProto, 'hidden'),
    visibilityState: Object.getOwnPropertyDescriptor(docProto, 'visibilityState'),
    webkitHidden: Object.getOwnPropertyDescriptor(docProto, 'webkitHidden'),
    webkitVisibilityState: Object.getOwnPropertyDescriptor(docProto, 'webkitVisibilityState'),
  };
  const nativeRAF = W.requestAnimationFrame;
  const nativeCAF = W.cancelAnimationFrame;

  // 调试快照（只读，暴露给 __keepAlive.state()，方便排查）
  let rafSnapshot = () => null;

  const readReal = (descriptor, fallback) => {
    try {
      return descriptor && typeof descriptor.get === 'function'
        ? descriptor.get.call(document)
        : fallback;
    } catch {
      return fallback;
    }
  };

  // 页面看到的是假的，这里读的是浏览器给出的真值。
  const isReallyHidden = () => readReal(descriptors.hidden, false) === true;

  /* ------------------------------------------------------------------ *
   * 1. 可见性
   * ------------------------------------------------------------------ */

  const spoof = (target, prop, getter, descriptor) => {
    if (!descriptor) return;
    try {
      Object.defineProperty(target, prop, {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: getter,
      });
    } catch {
      /* 某些内核不允许改写，忽略 */
    }
  };

  spoof(docProto, 'hidden', () => false, descriptors.hidden);
  spoof(docProto, 'visibilityState', () => 'visible', descriptors.visibilityState);
  spoof(docProto, 'webkitHidden', () => false, descriptors.webkitHidden);
  spoof(docProto, 'webkitVisibilityState', () => 'visible', descriptors.webkitVisibilityState);

  /* ------------------------------------------------------------------ *
   * 2. 焦点
   * ------------------------------------------------------------------ */

  try {
    Object.defineProperty(docProto, 'hasFocus', {
      configurable: true,
      writable: true,
      value: function hasFocus() {
        return true;
      },
    });
  } catch {
    try {
      docProto.hasFocus = function hasFocus() {
        return true;
      };
    } catch {
      /* ignore */
    }
  }

  /* ------------------------------------------------------------------ *
   * 3. 事件拦截
   * ------------------------------------------------------------------ */

  // 只拦 window / document 级别的"我失焦了 / 我隐藏了"，元素级的 blur 不动。
  const GUARDED = ['visibilitychange', 'webkitvisibilitychange', 'blur'];
  let onVisibilitySignal = null;
  const guard = (event) => {
    const target = event.target;
    if (target !== document && target !== W) return;
    // 先做自己的事（迁移被浏览器挂起的 rAF），再把事件对页面藏起来
    if (event.type !== 'blur' && onVisibilitySignal) onVisibilitySignal();
    if (!config.blockBackgroundEvents) return;
    event.stopImmediatePropagation();
  };
  const addGuard = (target, type) => {
    try {
      target.addEventListener(type, guard, true);
    } catch {
      /* ignore */
    }
  };
  for (const type of GUARDED) {
    addGuard(W, type);
    addGuard(document, type);
  }

  /* ------------------------------------------------------------------ *
   * 4. 后台时接管 requestAnimationFrame
   * ------------------------------------------------------------------ */

  if (typeof nativeRAF === 'function' && typeof nativeCAF === 'function') {
    const nativeSetTimeout = W.setTimeout.bind(W);
    const now = () => (W.performance ? W.performance.now() : Date.now());
    let seq = 0;
    let pumpTimer = 0;
    let flushCount = 0;
    let migrateCount = 0;
    const pendingNative = new Map(); // id -> { nativeId, callback }
    const parked = new Map(); // id -> callback

    rafSnapshot = () => ({
      flushes: flushCount,
      migrations: migrateCount,
      parked: parked.size,
      pending: pendingNative.size,
      hidden: isReallyHidden(),
    });

    const flush = () => {
      pumpTimer = 0;
      flushCount += 1;
      if (parked.size === 0) return;
      const batch = [...parked.entries()];
      parked.clear();
      const timestamp = now();
      for (const [, callback] of batch) {
        try {
          callback(timestamp);
        } catch (error) {
          // 把页面自己的异常抛回给它，别让它悄悄消失
          nativeSetTimeout(() => {
            throw error;
          }, 0);
        }
      }
      if (parked.size > 0) schedule();
    };

    const schedule = () => {
      if (pumpTimer) return;
      pumpTimer = nativeSetTimeout(flush, 16);
    };

    /**
     * 标签页刚隐藏时，已经排队的原生 rAF 会被浏览器直接挂起，
     * 页面的动画循环就卡死在半路。这里把这些回调搬进我们自己的泵。
     */
    const migratePending = () => {
      if (pendingNative.size === 0) return;
      migrateCount += 1;
      for (const [id, entry] of pendingNative) {
        try {
          nativeCAF.call(W, entry.nativeId);
        } catch {
          /* ignore */
        }
        parked.set(id, entry.callback);
      }
      pendingNative.clear();
      schedule();
    };

    onVisibilitySignal = () => {
      if (isReallyHidden()) migratePending();
      else if (parked.size > 0) schedule();
    };

    // 兜底：即使错过了 visibilitychange，也能在 1 秒内把挂起的帧接管过来
    W.setInterval(onVisibilitySignal, 500);

    W.requestAnimationFrame = function requestAnimationFrame(callback) {
      if (typeof callback !== 'function') return nativeRAF.call(W, callback);

      const id = ++seq;
      if (config.keepAnimationFrames && isReallyHidden()) {
        parked.set(id, callback);
        schedule();
        return id;
      }

      const nativeId = nativeRAF.call(W, (timestamp) => {
        pendingNative.delete(id);
        callback(timestamp);
      });
      pendingNative.set(id, { nativeId, callback });
      return id;
    };

    W.cancelAnimationFrame = function cancelAnimationFrame(id) {
      if (parked.delete(id)) return;
      const entry = pendingNative.get(id);
      if (entry) {
        pendingNative.delete(id);
        nativeCAF.call(W, entry.nativeId);
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * 5. 顺手补掉 Performance Timeline 里的可见性痕迹
   * ------------------------------------------------------------------ */

  try {
    const perfProto = Performance.prototype;
    const nativeGetEntriesByType = perfProto.getEntriesByType;
    if (typeof nativeGetEntriesByType === 'function') {
      perfProto.getEntriesByType = function getEntriesByType(type) {
        const entries = nativeGetEntriesByType.call(this, type);
        if (type === 'visibility-state') return [];
        return entries;
      };
    }
    const nativeGetEntries = perfProto.getEntries;
    if (typeof nativeGetEntries === 'function') {
      perfProto.getEntries = function getEntries() {
        return nativeGetEntries.call(this).filter((entry) => entry.entryType !== 'visibility-state');
      };
    }
  } catch {
    /* ignore */
  }

  /* ------------------------------------------------------------------ *
   * 6. 与隔离世界的扩展脚本握手，接收行为配置
   * ------------------------------------------------------------------ */

  W.addEventListener(
    'message',
    (event) => {
      if (event.source !== W && event.source !== null) return;
      const data = event.data;
      if (!data || typeof data !== 'object' || data.__keepAlive !== CHANNEL) return;
      if (data.type !== 'config' || !data.config || typeof data.config !== 'object') return;
      if (typeof data.config.keepAnimationFrames === 'boolean') {
        config.keepAnimationFrames = data.config.keepAnimationFrames;
      }
      if (typeof data.config.blockBackgroundEvents === 'boolean') {
        config.blockBackgroundEvents = data.config.blockBackgroundEvents;
      }
    },
    false,
  );

  const sayHello = () => {
    try {
      W.postMessage({ __keepAlive: CHANNEL, type: 'hello' }, '*');
    } catch {
      /* ignore */
    }
  };
  sayHello();
  W.setTimeout(sayHello, 0);
  W.setTimeout(sayHello, 100);
  W.setTimeout(sayHello, 1200);
  document.addEventListener('DOMContentLoaded', sayHello, { once: true });
  W.addEventListener('load', sayHello, { once: true });

  /* ------------------------------------------------------------------ *
   * 7. 调试入口（不影响页面，方便验证）
   * ------------------------------------------------------------------ */

  try {
    Object.defineProperty(W, '__keepAlive', {
      value: Object.freeze({
        version: '1.0.0',
        state: () => ({
          patched: true,
          realHidden: isReallyHidden(),
          hasFocus: true,
          config: { ...config },
          raf: rafSnapshot(),
        }),
      }),
      enumerable: false,
      configurable: false,
      writable: false,
    });
  } catch {
    /* ignore */
  }
})();

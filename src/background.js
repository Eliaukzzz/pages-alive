import {
  STORAGE_KEY,
  defaultState,
  createSite,
  loadState,
  saveState,
  collectMatches,
} from './shared/store.js';
import { findSiteForUrl, prettyHost } from './shared/patterns.js';

const MAIN_SCRIPT_ID = 'keepAlive.main';
const BRIDGE_SCRIPT_ID = 'keepAlive.bridge';
const SCRIPT_IDS = [MAIN_SCRIPT_ID, BRIDGE_SCRIPT_ID];
const REG_SIGNATURE_KEY = 'keepAlive.registration';

const BADGE_COLOR = '#12B886';

/* -------------------------------------------------------------------------- *
 * 内容脚本注册
 * -------------------------------------------------------------------------- */

async function listRegistrations() {
  try {
    return await chrome.scripting.getRegisteredContentScripts({ ids: SCRIPT_IDS });
  } catch {
    return [];
  }
}

/**
 * 把"已启用站点"同步成动态注册的内容脚本。
 *
 * 用动态注册而不是 <all_urls> 静态注入，是为了让脚本只在用户真正
 * 添加过的站点里运行 —— 用户没加过的网站，扩展不碰。
 */
async function syncRegistrations(state) {
  const matches = collectMatches(state);
  const signature = JSON.stringify(matches);

  const [existing, stored] = await Promise.all([
    listRegistrations(),
    chrome.storage.local.get(REG_SIGNATURE_KEY).catch(() => ({})),
  ]);

  const expectedCount = matches.length > 0 ? 2 : 0;
  const healthy = existing.length === expectedCount;
  if (healthy && stored[REG_SIGNATURE_KEY] === signature) {
    return { changed: false, matches: matches.length };
  }

  const staleIds = existing.map((script) => script.id).filter((id) => SCRIPT_IDS.includes(id));
  if (staleIds.length > 0) {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: staleIds });
    } catch {
      /* ignore */
    }
  }

  if (matches.length === 0) {
    await chrome.storage.local.set({ [REG_SIGNATURE_KEY]: signature });
    return { changed: true, matches: 0 };
  }

  try {
    await chrome.scripting.registerContentScripts([
      {
        id: MAIN_SCRIPT_ID,
        matches,
        js: ['src/inject.js'],
        runAt: 'document_start',
        world: 'MAIN',
        allFrames: true,
        persistAcrossSessions: true,
      },
      {
        id: BRIDGE_SCRIPT_ID,
        matches,
        js: ['src/content.js'],
        runAt: 'document_start',
        world: 'ISOLATED',
        allFrames: true,
        persistAcrossSessions: true,
      },
    ]);
  } catch (error) {
    console.error('[Keep Alive] 注册内容脚本失败', error);
    await chrome.storage.local.set({
      [REG_SIGNATURE_KEY]: '',
      'keepAlive.lastError': String(error?.message || error),
    });
    return { changed: false, error: String(error?.message || error) };
  }

  await chrome.storage.local.set({ [REG_SIGNATURE_KEY]: signature });
  return { changed: true, matches: matches.length };
}

/* -------------------------------------------------------------------------- *
 * 图标角标 / 防回收
 * -------------------------------------------------------------------------- */

async function refreshBadge(tabId, state) {
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return;
  }
  if (!tab) return;

  const current = state || (await loadState());
  const site = tab.url ? findSiteForUrl(current, tab.url) : null;
  const active = Boolean(current.enabled && site && site.enabled);

  const tasks = [
    chrome.action.setBadgeText({ tabId, text: active ? 'ON' : '' }).catch(() => {}),
    chrome.action
      .setTitle({
        tabId,
        title: active
          ? `Keep Alive · 正在保护 ${prettyHost(tab.url)}`
          : 'Keep Alive · 后台视频常亮',
      })
      .catch(() => {}),
  ];
  if (active) {
    tasks.push(chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR }).catch(() => {}));
  }
  await Promise.all(tasks);
}

async function ensureNotDiscardable(tabId, state, url) {
  const current = state || (await loadState());
  if (!current.enabled || !current.behavior.preventDiscard) return;
  const site = url ? findSiteForUrl(current, url) : null;
  if (!site || !site.enabled) return;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab && tab.autoDiscardable !== false) {
      await chrome.tabs.update(tabId, { autoDiscardable: false });
    }
  } catch {
    /* ignore */
  }
}

async function bootstrap() {
  const state = await loadState();
  await syncRegistrations(state);

  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return;
  }
  for (const tab of tabs) {
    if (typeof tab.id !== 'number') continue;
    await refreshBadge(tab.id, state);
    await ensureNotDiscardable(tab.id, state, tab.url);
  }
}

/* -------------------------------------------------------------------------- *
 * 安装 / 启动
 * -------------------------------------------------------------------------- */

async function seedIfEmpty() {
  const data = await chrome.storage.sync.get(STORAGE_KEY).catch(() => ({}));
  if (data?.[STORAGE_KEY]) return;
  const state = defaultState();
  const seeded = createSite('bilibili.com', '哔哩哔哩');
  if (seeded.ok) state.sites.push(seeded.site);
  await saveState(state);
}

chrome.runtime.onInstalled.addListener((details) => {
  (async () => {
    if (details.reason === 'install') {
      await seedIfEmpty();
      // 首次安装打开一次设置页，让用户（和审核员）立刻看到能配置什么
      await chrome.runtime.openOptionsPage().catch(() => {});
    }
    await bootstrap();
  })().catch((error) => console.error('[Keep Alive] 初始化失败', error));
});

chrome.runtime.onStartup.addListener(() => {
  bootstrap().catch((error) => console.error('[Keep Alive] 启动同步失败', error));
});

/* -------------------------------------------------------------------------- *
 * 状态变化
 * -------------------------------------------------------------------------- */

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync' || !changes[STORAGE_KEY]) return;
  bootstrap().catch((error) => console.error('[Keep Alive] 状态同步失败', error));
});

/* -------------------------------------------------------------------------- *
 * 标签页事件
 * -------------------------------------------------------------------------- */

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== 'complete') return;
  refreshBadge(tabId).catch(() => {});
  ensureNotDiscardable(tabId, null, tab?.url).catch(() => {});
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  refreshBadge(tabId).catch(() => {});
});

/* -------------------------------------------------------------------------- *
 * 来自内容脚本 / 界面的消息
 * -------------------------------------------------------------------------- */

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || typeof message !== 'object') return undefined;

  if (message.type === 'keepAlive:status') {
    if (sender.tab?.id !== undefined) refreshBadge(sender.tab.id).catch(() => {});
    return undefined;
  }

  if (message.type === 'keepAlive:sync') {
    bootstrap().catch(() => {});
    return undefined;
  }

  return undefined;
});

import { normalizeSite } from './patterns.js';

export const STORAGE_KEY = 'keepAlive.state';
export const STATE_VERSION = 1;
export const MAX_SITES = 40;

export const DEFAULT_BEHAVIOR = Object.freeze({
  // 后台标签页继续以 ~60fps 驱动 requestAnimationFrame（更流畅，但更费电）
  keepAnimationFrames: true,
  // 阻止 Chrome 在内存紧张时丢弃这些标签页
  preventDiscard: true,
  // 拦截 visibilitychange / blur，让页面永远收不到"我隐藏了"的信号
  blockBackgroundEvents: true,
});

function uid() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createSite(input, label) {
  const result = normalizeSite(input);
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    site: {
      id: uid(),
      input: result.site.input,
      host: result.site.host,
      label: label || result.site.label,
      matches: result.site.matches,
      enabled: true,
      createdAt: Date.now(),
    },
  };
}

export function defaultState() {
  return {
    version: STATE_VERSION,
    enabled: true,
    behavior: { ...DEFAULT_BEHAVIOR },
    sites: [],
  };
}

function fromStoredSite(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const result = normalizeSite(raw.input);
  if (!result.ok) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    input: result.site.input,
    host: result.site.host,
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : result.site.label,
    matches: result.site.matches,
    enabled: raw.enabled !== false,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
  };
}

/** 无论存储里是什么，都归一化成可用的状态对象。 */
export function normalizeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;

  const state = {
    version: STATE_VERSION,
    enabled: raw.enabled !== false,
    behavior: { ...DEFAULT_BEHAVIOR },
    sites: [],
  };

  if (raw.behavior && typeof raw.behavior === 'object') {
    for (const key of Object.keys(DEFAULT_BEHAVIOR)) {
      if (typeof raw.behavior[key] === 'boolean') state.behavior[key] = raw.behavior[key];
    }
  }

  const seen = new Set();
  for (const item of Array.isArray(raw.sites) ? raw.sites : []) {
    const site = fromStoredSite(item);
    if (!site || seen.has(site.host)) continue;
    seen.add(site.host);
    state.sites.push(site);
    if (state.sites.length >= MAX_SITES) break;
  }

  return state;
}

function toStoredState(state) {
  return {
    version: STATE_VERSION,
    enabled: state.enabled !== false,
    behavior: { ...DEFAULT_BEHAVIOR, ...(state.behavior || {}) },
    sites: state.sites.map((site) => ({
      id: site.id,
      input: site.input,
      label: site.label,
      enabled: site.enabled !== false,
      createdAt: site.createdAt,
    })),
  };
}

export async function loadState() {
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  return normalizeState(data?.[STORAGE_KEY]);
}

export async function saveState(state) {
  const compact = toStoredState(normalizeState(state));
  await chrome.storage.sync.set({ [STORAGE_KEY]: compact });
  return normalizeState(compact);
}

export function onStateChanged(listener) {
  const handler = (changes, areaName) => {
    if (areaName !== 'sync' || !changes[STORAGE_KEY]) return;
    listener(normalizeState(changes[STORAGE_KEY].newValue));
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

/** 已启用的站点 → 去重后的 match patterns。 */
export function collectMatches(state) {
  if (!state?.enabled) return [];
  const set = new Set();
  for (const site of state.sites) {
    if (!site.enabled) continue;
    for (const pattern of site.matches) set.add(pattern);
  }
  return [...set].sort();
}

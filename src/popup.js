import { createSite, loadState, saveState } from './shared/store.js';
import { findSiteForUrl, prettyHost } from './shared/patterns.js';
import { avatarFor, shadeColor } from './shared/presets.js';

const $ = (id) => document.getElementById(id);

const refs = {
  globalSwitch: $('globalSwitch'),
  avatar: $('avatar'),
  host: $('host'),
  siteSub: $('siteSub'),
  pill: $('pill'),
  primaryBtn: $('primaryBtn'),
  note: $('note'),
  version: $('version'),
  openOptions: $('openOptions'),
};

const state = {
  tab: null,
  data: null,
  site: null,
  injected: false,
  mode: 'none',
};

/* ------------------------------------------------------------------ utils */

function setPill(text, variant) {
  refs.pill.textContent = text;
  refs.pill.className = `pill ${variant}`;
}

function setAvatar(siteLike) {
  const avatar = avatarFor(siteLike);
  refs.avatar.textContent = avatar.initial;
  refs.avatar.style.background = `linear-gradient(145deg, ${avatar.color}, ${shadeColor(avatar.color, -18)})`;
}

function setPrimary(label, mode, variant = 'primary') {
  const btn = refs.primaryBtn;
  btn.textContent = label;
  btn.classList.remove('hidden', 'btn-primary', 'btn-secondary');
  btn.classList.add(variant === 'secondary' ? 'btn-secondary' : 'btn-primary');
  btn.disabled = false;
  state.mode = mode;
}

function hidePrimary() {
  refs.primaryBtn.classList.add('hidden');
  state.mode = 'none';
}

function setNote(html) {
  refs.note.innerHTML = html;
}

async function ping(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'keepAlive:ping' });
    return Boolean(response?.ok);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ render */

async function load() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.tab = tab || null;
  state.data = await loadState();
  const url = state.tab?.url || '';
  state.site = /^https?:/i.test(url) ? findSiteForUrl(state.data, url) : null;
  state.injected =
    Boolean(state.site?.enabled) && state.data.enabled && typeof state.tab?.id === 'number'
      ? await ping(state.tab.id)
      : false;
}

function render() {
  const { tab, data, site } = state;
  const url = tab?.url || '';
  const supported = /^https?:\/\//i.test(url);

  refs.globalSwitch.checked = data.enabled;
  refs.version.textContent = `v${chrome.runtime.getManifest().version}`;
  refs.avatar.style.background = '';

  if (!supported) {
    refs.host.textContent = prettyHost(url) || '当前页面';
    refs.siteSub.textContent = '浏览器内部页面无法注入脚本';
    setPill('不支持', 'pill-off');
    setAvatar({ host: 'x', label: '·' });
    hidePrimary();
    setNote('请在普通网页（<strong>http / https</strong>）上使用。');
    return;
  }

  const displayHost = site?.host || prettyHost(url) || url;
  refs.host.textContent = displayHost;
  setAvatar(site || { host: displayHost, label: displayHost });

  if (!data.enabled) {
    refs.siteSub.textContent = '全局开关已关闭';
    setPill('已关闭', 'pill-off');
    setPrimary('启用全局开关', 'global-on');
    setNote('打开后，列表中所有站点都会恢复保护。');
    return;
  }

  if (!site) {
    refs.siteSub.textContent = '不在保护列表中';
    setPill('未保护', 'pill-off');
    setPrimary('保持此站点活跃', 'add-site');
    setNote('只对<strong>列表内</strong>的网站生效，其它网站完全不受影响。');
    return;
  }

  if (!site.enabled) {
    refs.siteSub.textContent = '已暂停，脚本不再注入';
    setPill('已暂停', 'pill-off');
    setPrimary('启用此站点', 'enable-site');
    setNote('站点仍在列表中，随时可以重新启用。');
    return;
  }

  if (state.injected) {
    refs.siteSub.textContent = '页面以为自己一直在前台';
    setPill('保护中', 'pill-on');
    setPrimary('停用此站点', 'disable-site', 'secondary');
    setNote('切走再切回不会降级成纯音频，也不会重新缓冲。');
    return;
  }

  refs.siteSub.textContent = '已启用，等待页面加载脚本';
  setPill('待生效', 'pill-warn');
  setPrimary('刷新标签页', 'reload');
  setNote('脚本只在页面加载时注入，<strong>刷新一次</strong>即可生效。');
}

/* ------------------------------------------------------------------ actions */

async function persist(mutator) {
  const next = structuredClone(state.data);
  mutator(next);
  state.data = await saveState(next);
  try {
    await chrome.runtime.sendMessage({ type: 'keepAlive:sync' });
  } catch {
    /* 后台可能正在重启，storage 变化本身也会触发同步 */
  }
}

async function onPrimary() {
  const url = state.tab?.url || '';
  try {
    switch (state.mode) {
      case 'global-on':
        await persist((next) => {
          next.enabled = true;
        });
        break;

      case 'add-site': {
        const hostname = new URL(url).hostname;
        const created = createSite(hostname);
        if (!created.ok) throw new Error(created.error);
        await persist((next) => {
          if (!next.sites.some((item) => item.host === created.site.host)) {
            next.sites.push(created.site);
          }
        });
        break;
      }

      case 'enable-site':
        await persist((next) => {
          const target = next.sites.find((item) => item.id === state.site.id);
          if (target) target.enabled = true;
        });
        break;

      case 'disable-site':
        await persist((next) => {
          const target = next.sites.find((item) => item.id === state.site.id);
          if (target) target.enabled = false;
        });
        break;

      case 'reload':
        if (state.tab?.id !== undefined) {
          await chrome.tabs.reload(state.tab.id);
          window.close();
          return;
        }
        break;

      default:
        return;
    }
  } catch (error) {
    setNote(`操作失败：${String(error?.message || error)}`);
    return;
  }

  await load();
  render();
}

async function onGlobalSwitch() {
  const enabled = refs.globalSwitch.checked;
  try {
    await persist((next) => {
      next.enabled = enabled;
    });
    await load();
    render();
  } catch (error) {
    refs.globalSwitch.checked = !enabled;
    setNote(`操作失败：${String(error?.message || error)}`);
  }
}

/* ------------------------------------------------------------------ boot */

refs.primaryBtn.addEventListener('click', onPrimary);
refs.globalSwitch.addEventListener('change', onGlobalSwitch);
refs.openOptions.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

load()
  .then(render)
  .catch((error) => {
    refs.host.textContent = '加载失败';
    refs.siteSub.textContent = String(error?.message || error);
  });

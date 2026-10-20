import { PRESETS, avatarFor, shadeColor } from './shared/presets.js';
import { normalizeSite } from './shared/patterns.js';
import {
  DEFAULT_BEHAVIOR,
  MAX_SITES,
  createSite,
  loadState,
  onStateChanged,
  saveState,
} from './shared/store.js';

const $ = (id) => document.getElementById(id);

const refs = {
  globalSwitch: $('globalSwitch'),
  globalLabel: $('globalLabel'),
  siteList: $('siteList'),
  siteCount: $('siteCount'),
  emptyState: $('emptyState'),
  addForm: $('addForm'),
  siteInput: $('siteInput'),
  addBtn: $('addBtn'),
  preview: $('preview'),
  presetChips: $('presetChips'),
  optRaf: $('optRaf'),
  optDiscard: $('optDiscard'),
  optEvents: $('optEvents'),
  resetBtn: $('resetBtn'),
  version: $('version'),
  toast: $('toast'),
};

let state = null;
let toastTimer = 0;

/* ------------------------------------------------------------------ helpers */

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') node.style.cssText = value;
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

function toast(message, isError = false) {
  clearTimeout(toastTimer);
  refs.toast.textContent = message;
  refs.toast.className = `toast is-visible${isError ? ' is-error' : ''}`;
  toastTimer = setTimeout(() => {
    refs.toast.className = 'toast';
  }, 2600);
}

const clone = (value) => structuredClone(value);

async function commit(next, message) {
  state = await saveState(next);
  render();
  if (message) toast(message);
  try {
    await chrome.runtime.sendMessage({ type: 'keepAlive:sync' });
  } catch {
    /* 后台可能正在重启；storage 变化本身也会触发同步 */
  }
}

/* ------------------------------------------------------------------ site list */

function buildAvatar(siteLike) {
  const avatar = avatarFor(siteLike);
  const node = el('span', { class: 'avatar' }, avatar.initial);
  node.style.background = `linear-gradient(145deg, ${avatar.color}, ${shadeColor(avatar.color, -18)})`;
  return node;
}

function buildRow(site) {
  const row = el('li', {
    class: `site-row${site.enabled ? '' : ' is-off'}`,
    dataset: { id: site.id },
  });

  const info = el(
    'div',
    { class: 'site-info' },
    el(
      'div',
      { class: 'site-name-line' },
      el('span', { class: 'site-name' }, site.label),
      site.input !== site.host ? el('span', { class: 'site-tag' }, '带路径') : null,
    ),
    el('div', { class: 'site-host' }, site.host),
    el(
      'div',
      { class: 'site-patterns' },
      site.matches.map((pattern) => el('code', {}, pattern)),
    ),
  );

  const toggleInput = el('input', {
    type: 'checkbox',
    checked: site.enabled,
    'aria-label': `启用 ${site.label}`,
  });
  toggleInput.addEventListener('change', () => {
    const next = clone(state);
    const target = next.sites.find((item) => item.id === site.id);
    if (!target) return;
    target.enabled = toggleInput.checked;
    commit(next, toggleInput.checked ? '已启用，刷新标签页后生效' : '已暂停该站点').catch((error) =>
      toast(`保存失败：${String(error?.message || error)}`, true),
    );
  });

  const toggle = el('label', { class: 'switch' }, toggleInput, el('span', { class: 'track' }));

  const remove = el('button', {
    class: 'icon-btn',
    type: 'button',
    title: '从列表移除',
    'aria-label': `移除 ${site.label}`,
  });
  remove.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6"/><path d="M19 6l-1 13a1.5 1.5 0 0 1-1.5 1.4h-9A1.5 1.5 0 0 1 6 19L5 6"/><path d="M10 11v5M14 11v5"/></svg>';
  remove.addEventListener('click', () => {
    const next = clone(state);
    next.sites = next.sites.filter((item) => item.id !== site.id);
    commit(next, `已移除 ${site.label}`).catch((error) =>
      toast(`保存失败：${String(error?.message || error)}`, true),
    );
  });

  row.append(buildAvatar(site), info, el('div', { class: 'site-actions' }, toggle, remove));
  return row;
}

function renderSites() {
  refs.siteList.replaceChildren(...state.sites.map(buildRow));
  refs.siteCount.textContent = `${state.sites.length} 个`;
  refs.emptyState.hidden = state.sites.length > 0;
  refs.siteList.hidden = state.sites.length === 0;

  for (const chip of refs.presetChips.querySelectorAll('.chip')) {
    const host = chip.dataset.host;
    const added = state.sites.some((site) => site.host === host);
    chip.classList.toggle('is-added', added);
    chip.title = added ? '已在列表中' : `添加 ${host}`;
  }
}

function renderBehavior() {
  const behavior = { ...DEFAULT_BEHAVIOR, ...state.behavior };
  refs.optRaf.checked = behavior.keepAnimationFrames;
  refs.optDiscard.checked = behavior.preventDiscard;
  refs.optEvents.checked = behavior.blockBackgroundEvents;
}

function renderGlobal() {
  refs.globalSwitch.checked = state.enabled;
  refs.globalLabel.textContent = state.enabled ? '已开启' : '已关闭';
}

function render() {
  renderGlobal();
  renderBehavior();
  renderSites();
}

/* ------------------------------------------------------------------ presets */

function renderPresets() {
  const nodes = PRESETS.map((preset) => {
    const dot = el('span', { class: 'dot' }, preset.initial);
    dot.style.background = preset.color;
    const chip = el('button', { class: 'chip', type: 'button', dataset: { host: preset.host } }, dot, preset.label);
    chip.addEventListener('click', () => {
      addSite(preset.host, preset.label).catch((error) =>
        toast(`添加失败：${String(error?.message || error)}`, true),
      );
    });
    return chip;
  });
  refs.presetChips.replaceChildren(...nodes);
}

/* ------------------------------------------------------------------ add */

async function addSite(raw, label) {
  const created = createSite(raw, label);
  if (!created.ok) {
    refs.preview.textContent = created.error;
    refs.preview.classList.add('is-error');
    refs.siteInput.classList.add('is-error');
    return;
  }

  const existing = state.sites.find((site) => site.host === created.site.host);
  if (existing) {
    toast(`${existing.label} 已经在列表里了`);
    highlight(existing.id);
    return;
  }

  if (state.sites.length >= MAX_SITES) {
    toast(`最多支持 ${MAX_SITES} 个站点`, true);
    return;
  }

  const next = clone(state);
  next.sites.push(created.site);
  await commit(next, `已添加 ${created.site.label}，刷新标签页后生效`);

  refs.siteInput.value = '';
  refs.siteInput.classList.remove('is-error');
  updatePreview();
  highlight(created.site.id);
}

function highlight(id) {
  const row = refs.siteList.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!row) return;
  row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  row.classList.remove('flash');
  void row.offsetWidth;
  row.classList.add('flash');
}

function updatePreview() {
  const raw = refs.siteInput.value.trim();
  refs.siteInput.classList.remove('is-error');
  refs.preview.classList.remove('is-error');

  if (!raw) {
    refs.preview.textContent = '回车添加；域名会自动补全为 *://域名/* 的形式';
    return;
  }

  const result = normalizeSite(raw);
  if (!result.ok) {
    refs.preview.textContent = result.error;
    refs.preview.classList.add('is-error');
    refs.siteInput.classList.add('is-error');
    return;
  }
  refs.preview.textContent = `将匹配：${result.site.matches.join('   ')}`;
}

/* ------------------------------------------------------------------ events */

refs.addForm.addEventListener('submit', (event) => {
  event.preventDefault();
  addSite(refs.siteInput.value).catch((error) =>
    toast(`添加失败：${String(error?.message || error)}`, true),
  );
});

refs.siteInput.addEventListener('input', updatePreview);

refs.globalSwitch.addEventListener('change', () => {
  const next = clone(state);
  next.enabled = refs.globalSwitch.checked;
  commit(next, next.enabled ? '全局保护已开启' : '全局保护已关闭').catch((error) =>
    toast(`保存失败：${String(error?.message || error)}`, true),
  );
});

function bindBehavior(input, key, message) {
  input.addEventListener('change', () => {
    const next = clone(state);
    next.behavior = { ...DEFAULT_BEHAVIOR, ...next.behavior, [key]: input.checked };
    commit(next, message).catch((error) =>
      toast(`保存失败：${String(error?.message || error)}`, true),
    );
  });
}

bindBehavior(refs.optRaf, 'keepAnimationFrames', '已保存，刷新标签页后生效');
bindBehavior(refs.optDiscard, 'preventDiscard', '已保存，刷新标签页后生效');
bindBehavior(refs.optEvents, 'blockBackgroundEvents', '已保存，刷新标签页后生效');

refs.resetBtn.addEventListener('click', () => {
  const next = clone(state);
  next.behavior = { ...DEFAULT_BEHAVIOR };
  commit(next, '高级选项已恢复默认').catch((error) =>
    toast(`保存失败：${String(error?.message || error)}`, true),
  );
});

/* ------------------------------------------------------------------ boot */

refs.version.textContent = chrome.runtime.getManifest().version;
renderPresets();
updatePreview();

loadState()
  .then((loaded) => {
    state = loaded;
    render();
    onStateChanged((next) => {
      state = next;
      render();
    });
  })
  .catch((error) => {
    toast(`加载设置失败：${String(error?.message || error)}`, true);
  });

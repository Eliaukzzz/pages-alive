/**
 * 站点输入 → Chrome match pattern 的转换与匹配工具。
 *
 * 支持的输入形式：
 *   bilibili.com
 *   *.bilibili.com
 *   https://www.bilibili.com/video/BV1xx
 *   bilibili.com/video/*
 */

const SCHEMES = new Set(['http', 'https', '*']);
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?';
const HOST_RE = new RegExp(`^(?:\\*|\\*\\.)?${LABEL}(?:\\.${LABEL})*$`);

function fail(error) {
  return { ok: false, error };
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(glob) {
  return new RegExp('^' + glob.split('*').map(escapeRegExp).join('.*') + '$');
}

/**
 * @param {string} raw
 * @returns {{ok: true, site: {input: string, host: string, label: string, matches: string[]}}
 *          | {ok: false, error: string}}
 */
export function normalizeSite(raw) {
  const input = String(raw ?? '').trim();
  if (!input) return fail('请输入网址或域名');
  if (/\s/.test(input)) return fail('网址中不能包含空格');

  let rest = input;

  const schemeMatch = rest.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (schemeMatch) {
    if (!SCHEMES.has(schemeMatch[1].toLowerCase())) return fail('只支持 http / https 网站');
    rest = rest.slice(schemeMatch[0].length);
  } else if (rest.startsWith('//')) {
    rest = rest.slice(2);
  }

  // http / https 都匹配：站点经常会做协议跳转，只认一种很容易失效
  const scheme = '*';

  // 去掉可能存在的 user:pass@
  const at = rest.lastIndexOf('@');
  if (at !== -1) rest = rest.slice(at + 1);

  const slash = rest.indexOf('/');
  let host = (slash === -1 ? rest : rest.slice(0, slash)).toLowerCase();
  let path = slash === -1 ? '' : rest.slice(slash);

  // match pattern 不区分端口，这里直接去掉
  host = host.replace(/:\d+$/, '');
  if (!host) return fail('缺少域名');

  const wildcard = host.startsWith('*.');
  if (wildcard) host = host.slice(2);
  if (host.startsWith('www.') && host.split('.').length > 2) host = host.slice(4);

  if (host === '*') return fail('请填写具体域名，而不是 *');
  if (!HOST_RE.test(host)) return fail('域名格式不正确');

  if (!path) {
    path = '/*';
  } else {
    if (!path.startsWith('/')) path = '/' + path;
    if (!path.endsWith('*')) path += '*';
  }

  const hosts = [];
  const isBareHost = IPV4_RE.test(host) || host === 'localhost' || !host.includes('.');
  if (wildcard) {
    hosts.push('*.' + host);
  } else if (isBareHost) {
    hosts.push(host);
  } else {
    hosts.push(host, '*.' + host);
  }

  const matches = [...new Set(hosts.map((h) => `${scheme}://${h}${path}`))];
  return {
    ok: true,
    site: {
      input,
      host,
      label: host === '*' ? '所有网站' : host,
      matches,
    },
  };
}

/** 判断一条 match pattern 是否命中某个 URL。 */
export function patternMatchesUrl(pattern, url) {
  const parsed = /^(\*|https?):\/\/([^/]+)(\/.*)$/.exec(pattern);
  if (!parsed) return false;
  const [, patternScheme, patternHost, patternPath] = parsed;

  let target;
  try {
    target = new URL(url);
  } catch {
    return false;
  }

  const scheme = target.protocol.replace(':', '');
  if (scheme !== 'http' && scheme !== 'https') return false;
  if (patternScheme !== '*' && patternScheme !== scheme) return false;

  const host = target.hostname.toLowerCase();
  if (patternHost === '*') {
    // 全部主机
  } else if (patternHost.startsWith('*.')) {
    const base = patternHost.slice(2);
    if (host !== base && !host.endsWith('.' + base)) return false;
  } else if (host !== patternHost) {
    return false;
  }

  return globToRegExp(patternPath).test(target.pathname + target.search);
}

/** 该站点配置是否命中 URL。 */
export function siteMatchesUrl(site, url) {
  if (!site || !Array.isArray(site.matches)) return false;
  return site.matches.some((pattern) => patternMatchesUrl(pattern, url));
}

/** 在状态里查找命中该 URL 的站点（优先返回已启用的）。 */
export function findSiteForUrl(state, url) {
  const sites = Array.isArray(state?.sites) ? state.sites : [];
  const hits = sites.filter((site) => siteMatchesUrl(site, url));
  return hits.find((site) => site.enabled) || hits[0] || null;
}

/** 用于界面上展示的简短域名。 */
export function prettyHost(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return u.protocol.replace(':', '');
    return u.hostname.replace(/^www\./, '') || u.hostname;
  } catch {
    return '';
  }
}

/** 常见长视频 / 直播站点，用于"一键添加"。 */
export const PRESETS = [
  { host: 'bilibili.com', label: '哔哩哔哩', color: '#FB7299', initial: 'B' },
  { host: 'youtube.com', label: 'YouTube', color: '#FF0033', initial: 'Y' },
  { host: 'v.qq.com', label: '腾讯视频', color: '#FF7A3D', initial: 'T' },
  { host: 'iqiyi.com', label: '爱奇艺', color: '#00BE06', initial: 'i' },
  { host: 'youku.com', label: '优酷', color: '#1BA5E0', initial: 'Y' },
  { host: 'mgtv.com', label: '芒果 TV', color: '#FF6B00', initial: 'M' },
  { host: 'douyu.com', label: '斗鱼', color: '#FF7A00', initial: 'D' },
  { host: 'huya.com', label: '虎牙', color: '#FFA800', initial: 'H' },
  { host: 'twitch.tv', label: 'Twitch', color: '#9146FF', initial: 'T' },
  { host: 'netflix.com', label: 'Netflix', color: '#E50914', initial: 'N' },
  { host: 'primevideo.com', label: 'Prime Video', color: '#00A8E1', initial: 'P' },
  { host: 'disneyplus.com', label: 'Disney+', color: '#113CCF', initial: 'D' },
  { host: 'ixigua.com', label: '西瓜视频', color: '#FF2C55', initial: 'X' },
  { host: 'douyin.com', label: '抖音', color: '#161823', initial: 'D' },
  { host: 'yangshipin.cn', label: '央视频', color: '#FF5A00', initial: 'Y' },
  { host: 'miguvideo.com', label: '咪咕视频', color: '#E60012', initial: 'M' },
];

export const PRESET_BY_HOST = new Map(PRESETS.map((preset) => [preset.host, preset]));

/** 根据站点配置挑一个头像样式。 */
export function avatarFor(site) {
  const preset = PRESET_BY_HOST.get(site?.host);
  if (preset) return { initial: preset.initial, color: preset.color, label: preset.label };
  const label = site?.label || site?.host || '?';
  const palette = ['#0EA5E9', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444', '#EC4899', '#6366F1'];
  let hash = 0;
  for (const ch of String(site?.host || label)) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return {
    initial: label.replace(/^www\./, '').charAt(0).toUpperCase() || '?',
    color: palette[hash % palette.length],
    label,
  };
}

/** 把 hex 颜色加深/变浅，用于头像渐变。 */
export function shadeColor(hex, amount) {
  try {
    const value = parseInt(hex.slice(1), 16);
    const clamp = (n) => Math.max(0, Math.min(255, n));
    const r = clamp((value >> 16) + amount);
    const g = clamp(((value >> 8) & 0xff) + amount);
    const b = clamp((value & 0xff) + amount);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  } catch {
    return hex;
  }
}

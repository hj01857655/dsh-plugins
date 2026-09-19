/**
 * Locale dictionaries for dsh-theme-studio.
 *
 * @module client/locales
 */

export const NS = 'theme-studio'

export const zh: Record<string, string> = {
  nav: '主题工作室',
  title: '主题工作室',
  subtitle: '自定义 dsh 界面外观',

  presetSection: '预设主题',
  presetHint: '选择一个预设配色方案',
  noPreset: '无（使用默认）',

  accentSection: '强调色',
  accentHint: '同时作用于主按钮、链接、导航选中态与悬停高亮',
  accentPlaceholder: '#4d6bfe',
  accentApplying: '当前生效：',
  darkAccentSection: '暗色模式强调色',
  darkAccentHint: '暗色模式下使用的强调色，留空则沿用上面的颜色',
  preserveContrast: '已自动提亮以保证暗色下可读',
  tokenNote: '本面板只写 dsh 真实存在的设计令牌（{count} 个，均从 dsh 样式表核实）。dsh 按组件硬编码了圆角且未提供动画令牌，因此不提供圆角调节，动画开关改用样式表实现。',

  densitySection: '密度',
  densityCompact: '紧凑',
  densityComfortable: '舒适',
  densitySpacious: '宽松',
  densityShadowHint: '覆盖官方「外观」里的字号（不动你已保存的设置，关闭本插件即恢复原值）',

  radiusSection: '圆角',

  fontSection: '字体',
  fontSystem: '系统',
  fontMono: '等宽',
  fontSerif: '衬线',

  customCssSection: '自定义 CSS',
  customCssHint: '覆盖 dsh 令牌，每行一个 `--dsw-* 或 --dsh-*: value;`',
  customCssPlaceholder: '--dsw-alias-brand-primary: #ff0000;\n--dsw-alias-label-primary: #111111;',

  behaviorSection: '行为',
  animations: '界面动画',
  animationsHint: '关闭可减少动画干扰（用样式表把过渡时长压到近零，事件仍会触发）',

  ioSection: '导入 / 导出',
  export: '导出主题',
  import: '导入主题',
  importHint: '粘贴导出的 JSON，或上传 .json 文件',
  importPlaceholder: '{"preset":"nord","accentColor":"#5e81ac",...}',
  importFile: '选择文件',
  importSuccess: '主题已导入',
  importFailed: '导入失败：不是有效的主题 JSON',
  exportSuccess: '主题已复制到剪贴板',
  exportFailed: '复制失败，已填入下方文本框',

  preview: '预览',
  reset: '重置为默认',
  resetConfirm: '确定要重置所有主题设置吗？',
  resetted: '已重置为默认主题',

  link: '链接',
  text: '这是一段示例文本，用于预览字号与字体。',
}

export const en: Record<string, string> = {
  nav: 'Theme Studio',
  title: 'Theme Studio',
  subtitle: 'Customize the dsh UI appearance',

  presetSection: 'Preset Themes',
  presetHint: 'Choose a pre-built color scheme',
  noPreset: 'None (use default)',

  accentSection: 'Accent Color',
  accentHint: 'Custom accent color — drives buttons, links, the active nav item and hover tints',
  accentPlaceholder: '#4d6bfe',
  accentApplying: 'Currently applied:',
  darkAccentSection: 'Dark Mode Accent',
  darkAccentHint: 'Accent used in dark mode; leave empty to reuse the color above',
  preserveContrast: 'Lightened automatically for dark-mode readability',
  tokenNote: 'This panel only writes design tokens that actually exist in dsh ({count} verified against its stylesheets). dsh hardcodes per-component corner radii and ships no motion tokens, so there is no radius control and the animation toggle is implemented as a stylesheet.',

  densitySection: 'Density',
  densityCompact: 'Compact',
  densityComfortable: 'Comfortable',
  densitySpacious: 'Spacious',
  densityShadowHint: 'Overrides the font size in the official Appearance row — your saved setting is untouched and returns when this plugin is removed',

  radiusSection: 'Border Radius',
  radiusUnavailable: 'dsh ships no radius token, so this cannot be adjusted',

  fontSection: 'Font Family',
  fontSystem: 'System',
  fontMono: 'Monospace',
  fontSerif: 'Serif',

  customCssSection: 'Custom CSS',
  customCssHint: 'Override dsh tokens, one `--dsw-* or --dsh-*: value;` per line',
  customCssPlaceholder: '--dsw-alias-brand-primary: #ff0000;\n--dsw-alias-label-primary: #111111;',

  behaviorSection: 'Behavior',
  animations: 'UI Animations',
  animationsHint: 'Turn off to reduce motion (a stylesheet compresses transition durations to near-zero so events still fire)',

  ioSection: 'Import / Export',
  export: 'Export Theme',
  import: 'Import Theme',
  importHint: 'Paste exported JSON, or upload a .json file',
  importPlaceholder: '{"preset":"nord","accentColor":"#5e81ac",...}',
  importFile: 'Choose File',
  importSuccess: 'Theme imported',
  importFailed: 'Import failed: not a valid theme JSON',
  exportSuccess: 'Theme copied to clipboard',
  exportFailed: 'Copy failed — filled into the box below',

  preview: 'Preview',
  reset: 'Reset to Default',
  resetConfirm: 'Reset all theme settings to default?',
  resetted: 'Reset to default theme',

  link: 'Link',
  text: 'Sample text for previewing size and font family.',
}

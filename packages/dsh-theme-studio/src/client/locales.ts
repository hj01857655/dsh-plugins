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
  presetSideLight: '浅色',
  presetSideDark: '深色',
  presetSideHint: '给浅色与深色分别挑主题；深色留空就沿用浅色所选',
  noPreset: '无（使用默认）',
  noPresetDark: '跟随浅色',

  accentSection: '强调色',
  accentHint: '同时作用于主按钮、链接、导航选中态与悬停高亮',
  accentPlaceholder: '#4d6bfe',
  accentApplying: '当前生效：',
  darkAccentSection: '暗色模式强调色',
  darkAccentHint: '暗色模式下使用的强调色，留空则沿用上面的颜色',
  preserveContrast: '已自动提亮以保证暗色下可读',

  densitySection: '密度',
  density_tight: '极紧凑',
  density_compact: '紧凑',
  density_comfortable: '舒适',
  density_relaxed: '舒展',
  density_spacious: '宽松',
  density_maximum: '最宽',
  densityHint: '直接写入官方「外观」的字号设置（当前 {px}px），与官方控件始终一致',

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

  writeBackFailed: '主题令牌未写入 body，覆盖未生效',
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
  presetSideLight: 'Light',
  presetSideDark: 'Dark',
  presetSideHint: 'Pick a theme for each mode; leaving dark empty follows the light one',
  noPreset: 'None (use default)',
  noPresetDark: 'Same as light',

  accentSection: 'Accent Color',
  accentHint: 'Custom accent color — drives buttons, links, the active nav item and hover tints',
  accentPlaceholder: '#4d6bfe',
  accentApplying: 'Currently applied:',
  darkAccentSection: 'Dark Mode Accent',
  darkAccentHint: 'Accent used in dark mode; leave empty to reuse the color above',
  preserveContrast: 'Lightened automatically for dark-mode readability',

  densitySection: 'Density',
  density_tight: 'Tight',
  density_compact: 'Compact',
  density_comfortable: 'Comfortable',
  density_relaxed: 'Relaxed',
  density_spacious: 'Spacious',
  density_maximum: 'Widest',
  densityHint: 'Writes the official Appearance font size directly ({px}px now), so it always agrees with that control',

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

  writeBackFailed: 'Theme tokens did not reach body — the override had no effect',
  preview: 'Preview',
  reset: 'Reset to Default',
  resetConfirm: 'Reset all theme settings to default?',
  resetted: 'Reset to default theme',

  link: 'Link',
  text: 'Sample text for previewing size and font family.',
}

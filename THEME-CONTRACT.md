# dsh 主题与样式契约

面向为自己的 dsh 插件写前端（面板、设置行、自定义视图）的人。本文只讲已被核实的东西：所有令牌名、API 签名、错误信息都从 dsh 源码读出，出处写在每节末尾。

配套文档：`PLUGIN-CONTRACT.md`（插件骨架、装载、发布）。本文不重复那些内容。

---

## 0. 结论先讲

dsh 有一套**分层设计令牌 + 正式主题服务**的样式规范。要点四条：

1. 颜色只有一层归你：`--dsw-alias-*`。上下两层（`--dsw-static-*`、`--dsw-specific-*`）不要碰。
2. 令牌定义在 **`body`** 和 `body[data-ds-dark-theme]` 上，不在 `:root`。写错元素等于没写。
3. 改主题的正式入口是 **`ctx.theme.overrideTokens()`**（局部覆盖）或 `ctx.theme.register()`（整套主题），不是自己往 DOM 上 `setProperty`。
4. 令牌名必须真实存在。自创名字不会报错，只会静默失效——配上硬编码兜底色，面板会「看起来生效」。

---

## 1. 令牌分层：四层，只有一层归你

| 层 | 前缀 | 作用 | 已定义数量 | 第三方可否覆盖 |
|---|---|---|---|---|
| 静态层 | `--dsw-static-*` | 原始调色板台阶（`amber-100`、`deepseek-500`、`neutral-bluish-800` …） | 146 | ❌ 不要 |
| **别名层** | `--dsw-alias-*` | 语义令牌，所有组件读这一层 | 162 | ✅ **只覆盖这层** |
| 专用层 | `--dsw-specific-*` | 组件专属表面（气泡、菜单、侧栏） | 22 | ⚠️ 谨慎 |
| 轴层 | `--dsh-*` | 脚手架/尺寸轴（字号、滚动条、启动页） | 见 §5 | ⚠️ 按需 |

（数量统计自 `ui-theme/src/styles/design-platform.css`，按 `name:` 定义计。）

官方对这件事的表述：

> The token sheets are the sole color authority — values absent from the design system are deliberately not appended; the nearest semantic token wins, and design-owner-approved additions enter as a static step plus a semantic alias in the same change.

也就是说：**你要的颜色若在别名层找不到，正确做法是用最接近的语义令牌，或去找设计负责人加一步**——而不是自己发明一个变量名。

`--dsw-specific-*` 完整清单（22 个中的公开可见部分）：

```
--dsw-specific-bubble                      --dsw-specific-sidebar-fill
--dsw-specific-bubble-highlight            --dsw-specific-sidebar-nav-item-active
--dsw-specific-input-major                 --dsw-specific-sidebar-nav-item-active-accent
--dsw-specific-login-input                 --dsw-specific-sidebar-nav-item-hover
--dsw-specific-menu                        --dsw-specific-tip
--dsw-specific-selector
```

出处：`ui-theme/README.md`「Stylesheets」节；`ui-theme/src/client/index.ts` `BUILTIN_INSPECT_TOKENS`。

---

## 2. 定义位置与选择器

`design-platform.css` 把整套调色板定义在两个选择器上：

```css
body                    { /* 亮色基色 */ }
body[data-ds-dark-theme] { /* 暗色基色 */ }
```

**这是最容易踩的坑。** CSS 自定义属性按继承走：你在 `document.documentElement`（即 `html`）上设的值会被继承进 `body`，但 `body` 自己有一份同名声明——后者胜出。所以往 `html` 上写，界面**一个像素都不会变**，而且不报任何错。

```ts
// ❌ 静默失效：被 body 自己的声明压掉
document.documentElement.style.setProperty('--dsw-alias-brand-primary', '#f00')

// ✅ 有效
document.body.style.setProperty('--dsw-alias-brand-primary', '#f00')
```

更好的做法是根本不要自己写，走 §3 的 API。

暗色判定也看 `body`：

```ts
const isDark = document.body.hasAttribute('data-ds-dark-theme')
```

用 `MutationObserver` 监听该属性即可跟随宿主切换。属性名由 `ui-layout` 导出为常量 `DARK_ATTRIBUTE`。

出处：`ui-layout/src/client/theme-presenter.ts` 头注释；`ui-theme/src/styles/design-platform.css`。

---

## 3. 唯一的正式扩展点：`ctx.theme`

`ui-theme` 的客户端半边 `ctx.provide('theme', theme)` 出一个 `ThemeRuntime` 实例。它注入的服务是：

```ts
export const inject = ['slots', 'locale', 'remote', 'settingsScope']
```

你的插件要改主题，就 inject `theme`，然后二选一。

### 3.1 `overrideTokens`：局部覆盖（推荐）

栈式覆盖层。这是给「只想调几个色」的插件用的。

```ts
ctx.inject(['theme'], (ctx) => {
  ctx.effect(() => ctx.theme.overrideTokens('my-plugin', {
    '--dsw-alias-brand-primary': { light: '#4d6bfe', dark: '#7aa2f7' },
    '--dsw-alias-state-error-primary': { light: '#b91c1c', dark: '#ef4444' },
  }), 'my-plugin: theme tokens')
})
```

语义（逐条来自源码注释）：

- **一个 source 一层**。同一个 source 再调一次，会**整体替换**该 source 原有的层并重新压到最上（effect 重注册语义）。
- 层按 seq 顺序叠加，**逐令牌后者胜**。`--dsw-alias-*` 也照这个规则覆盖基色。
- 返回 disposer，**只移除本次调用创建的那一层**；若期间同 source 又被覆盖过，disposer 是 no-op（不会误拆新层）。
- 基色主题不受影响，移除层即恢复。

### 3.2 `register`：整套主题

如果你要提供的是一个可选中的完整主题（出现在设置里的一个选项），用这个。

```ts
interface ThemeDefinition {
  id: string                        // 'system' 是偏好值，不是可注册 id
  colorScheme: 'light' | 'dark'     // 决定 body[data-ds-dark-theme] 的取值，不看 id
  tokens: Record<string, string>    // 别名层覆盖，单值（因为它本身就绑定一种 scheme）
}
```

```ts
ctx.effect(() => ctx.theme.register({
  id: 'my-theme',
  colorScheme: 'light',
  tokens: { '--dsw-alias-brand-primary': '#4d6bfe' },
}), 'my-plugin: theme')
```

约束：

- `id === 'system'` → 抛错 `"system" is a preference, not a registrable theme id`。
- 重复 id → 抛错 `theme "<id>" is already registered`。
- disposer 移除主题；**若被移除的正是当前偏好，偏好会重置为默认**，避免界面停在一个已注销主题的令牌上。

注意 `colorScheme` 与 `id` 是分开的——presenter 从 `colorScheme` 切换 `body[data-ds-dark-theme]`，**不是从 id 猜**。

### 3.3 校验规则：light/dark 必须成对

`overrideTokens` 的值是 `{ light, dark }` 对象，**两个都必填**。传裸字符串会抛：

```
theme override "<name>" from "<source>" is a bare string — pass { light: "<v>", dark: "<v>" }
(repeat the value when it is the same in both palettes);
a single value goes illegible when the user switches color scheme
```

值不是 `{ light: string, dark: string }` 形状时：

```
theme override "<name>" from "<source>" must map to a { light, dark } pair of strings
— one value per color scheme
```

这条设计是刻意的：**只给一个值，用户切到另一种配色时必然出现不可读的组合**。若某令牌与配色无关，就把同一个值写两遍。

运行时校验是必要的，因为动态包门面过来的调用方可能是无类型 JS。

### 3.4 读状态

```ts
const snap = ctx.theme.getTheme()
// snap.preference  'light' | 'dark' | 'system'
// snap.fontSize    12..17
// snap.active      { id, colorScheme, tokens }  ← 已折叠覆盖层，按当前配色取值
// snap.themes      注册表
// snap.revision    单调计数
```

`ctx.on('theme/change', (snapshot) => …)` 是唯一的连续同步通道；`setTheme(id)` / `setFontSize(px)` 是唯一的偏好写入口。

`exportInspectTokens()` 返回令牌清单（名字、用途、值类型、是否双色彩、对应 CSS 变量），供 Cordis 预定义检查用。

出处：`ui-theme/src/client/index.ts` L44–124（类型）、L275–317（register/overrideTokens）、L319–357（compose/publish）、L383–401（validateOverrides）。

---

## 4. 谁把你的值落到 DOM 上

presenter 在 `ui-layout`（`src/client/theme-presenter.ts`），纯 DOM 写入，不经 React。它负责：

- `document.documentElement.style.colorScheme` — 原生 UA 控件（滚动条、表单）用
- `body[data-ds-dark-theme]` — 选择令牌调色板
- **活动主题的别名令牌覆盖，作为内联 CSS 变量写在 `body` 上**
- `--dsh-content-font-size` — 正文字号轴
- `html[data-ds-theme-source]` — 供宿主外壳镜像到原生窗口 chrome（Electron preload 转发给 `nativeTheme.themeSource`）
- 一个 `meta[name="theme-color"]`

关键性质（源码原话）：

> the presenter only ever retracts what it wrote itself, so foreign attributes, metadata, and inline styles survive

**含义**：presenter 不会清理你写的内联变量。这既是宽容也是陷阱——你直接 `setProperty` 写的值不会被它撤掉，所以「能跑」不代表「写对了」；你只是绕过了叠加、双色值、dispose 这套机制。

出处：`ui-layout/src/client/theme-presenter.ts` L1–60。

---

## 5. 样式表顺序与归属

`ui-theme` 的客户端入口按固定顺序注入六个全局样式表，随插件卸载/HMR 一同移除（每个表通过 `ctx.effect` 挂载，标签带 `data-plugin` 与 `data-plugin-css`）：

| 顺序 | 文件 | 拥有什么 |
|---|---|---|
| 1 | `base.css` | 基础重置；`--dsh-content-font-size` 的依赖 |
| 2 | `corner-shape.css` | `--dsw-corner-shape`，圆角平滑 |
| 3 | `design-platform.css` | **静态层 + 别名层 + 专用层**（146 / 162 / 22） |
| 4 | `scrollbar.css` | `--dsh-scrollbar-*`（5 个），必须排在 design-platform 之后 |
| 5 | `gradient-shadow-text.css` | 字体阶梯 `--dsw-font-*`（180）、阴影 `--dsw-shadow-lv*`、elevation（5） |
| 6 | `shiki.css` | 代码高亮 |

顺序不能换：`scrollbar.css` 是 `--dsw-alias-scrollbar-*` 的唯一消费者，而该令牌由 `design-platform.css` 声明。

`--dsh-*` 轴层清单：

```
--dsh-content-font-size              (字号轴，12–17px，默认 14)
--dsh-content-font-size-secondary
--dsh-content-font-delta
--dsh-content-font-delta-secondary
--dsh-scrollbar-width                --dsh-scrollbar-thumb
--dsh-scrollbar-thumb-hover          --dsh-scrollbar-thumb-border
--dsh-scrollbar-track-margin
```

另有启动期专用的一组（`--dsh-boot-*`），只在插件加载前生效，插件不应写。

出处：`ui-theme/src/client/styles.ts`；`ui-theme/README.md`「Stylesheets」节。

---

## 6. 不得自创令牌名

自创名字**不会报错**。浏览器只是把那条声明当作未定义变量处理，`var()` 落回兜底值（有的话）或让该属性在计算值阶段失效。结果是：面板看起来正常，实际上你渲染的是一套固定配色而非宿主主题。

已知会踩的 11 个名字，全部**不存在于 dsh**：

```
--accent   --accent-hover   --bg-primary   --bg-secondary   --bg-tertiary
--text-primary   --text-secondary   --border   --error   --success   --warning
```

对照表（左：常见自创写法；右：真实令牌）：

| 自创 | 真实令牌 |
|---|---|
| `--accent` / `--accent-hover` | `--dsw-alias-brand-primary`（悬停态可用 `--dsw-alias-button-primary-hover`） |
| `--bg-primary` | `--dsw-alias-bg-layer-1` |
| `--bg-secondary` | `--dsw-alias-bg-layer-2` |
| `--bg-tertiary` | `--dsw-alias-interactive-bg-hover` |
| `--border` | `--dsw-alias-border-l2` |
| `--text-primary` | `--dsw-alias-label-primary` |
| `--text-secondary` | `--dsw-alias-label-tertiary` |
| `--error` | `--dsw-alias-state-error-primary` |
| `--success` | `--dsw-alias-state-success-primary` |
| `--warning` | `--dsw-alias-state-warn-primary` |
| 主按钮文字 `#fff` | `--dsw-alias-label-primary-inverted` |

最后一条值得单独说：`--dsw-alias-brand-primary` 是**中性**品牌色（亮色近黑、暗色近白）。硬写 `#fff` 会在亮色模式下变成白底白字。

**别加硬编码兜底。** `var(--dsw-…, #fff)` 里的兜底色会在两种配色之一必然出错，而且会把「令牌名写错了」这件事故意藏起来。令牌若缺失，让声明失效、属性继承，反而是更体面的降级。

替代方案：dsh 自己的启动页确实用了兜底（`var(--dsw-alias-bg-base, #fff)`），但那是**首帧 FOUC** 场景，且兜底值对应的是启动页自己的 `--dsh-boot-*` 层。插件面板不适用。

高频别名令牌（按在已安装运行时的被引用次数排序，可作选型起点）：

```
226  --dsw-alias-label-tertiary          54  --dsw-alias-border-l2
223  --dsw-alias-label-primary           42  --dsw-alias-border-l4
172  --dsw-alias-label-secondary         41  --dsw-alias-bg-layer-1
102  --dsw-alias-interactive-bg-hover    37  --dsw-alias-border-l1
 80  --dsw-alias-state-business-primary  33  --dsw-alias-border-l3
 79  --dsw-alias-state-error-primary     29  --dsw-font-xs-13
 78  --dsw-alias-label-caption           27  --dsw-alias-bg-base
 67  --dsw-font-family                   18  --dsw-alias-bg-layer-2
```

要枚举全部，用 `ctx.theme.exportInspectTokens()`，或直接扫 `design-platform.css` 里的 `name:` 定义。

### 状态色的淡底

`--dsw-alias-state-*-primary` 是前景色。要淡底，用同族的 `-tertiary` / `-secondary`：

```
--dsw-alias-state-business-tertiary     --dsw-alias-state-business-primary
--dsw-alias-state-success-tertiary      --dsw-alias-state-success-primary
--dsw-alias-state-warn-tertiary         --dsw-alias-state-warn-primary
--dsw-alias-state-error-secondary       --dsw-alias-state-error-primary
```

注意没有 `--dsw-alias-state-error-tertiary`（不存在），错误态的淡底是 `-secondary`。

---

## 7. 圆角与动效：没有令牌，别硬造

**圆角无法做成令牌控制。** dsh 按组件硬编码 `border-radius`，且**不提供任何圆角令牌**（只有 `--dsw-corner-shape` 这一个非尺寸的形状开关）。大量组件是 `border-radius: 50%` 圆形和 pill 圆角。想全局调圆角，没有忠实的实现方式。

`corner-shape.css` 的机制：在 `@supports (corner-shape: superellipse(1.5))` 内定义 `--dsw-corner-shape`，通过通配选择器应用到所有元素及其 `::before`/`::after`。不支持 `corner-shape` 的引擎保留普通圆角。**全圆形状必须把 `corner-shape: round` 与其圆角配对写**，因为超椭圆会让它们变形——这条由 ui-theme 的 spec 测试在全仓范围强制。

**动效也没有令牌。** `gradient-shadow-text.css` 只拥有阴影与 elevation，没有 duration/transition 令牌。要「减少动效」，只能注入一张样式表：

```css
*, *::before, *::after {
  transition-duration: 0.001ms !important;
  animation-duration: 0.001ms !important;
  animation-iteration-count: 1 !important;
}
```

用 `0.001ms` 而非 `0s`：零时长可能让 `transitionend` / `animationend` 不触发，等待这些事件的组件会挂住。近零时长保持了事件触发，视觉上是瞬时的。

可用阴影令牌：`--dsw-elevation-stroke`、`--dsw-elevation-stroke-color`、`--dsw-elevation-panel`、`--dsw-elevation-prominent`、`--dsw-elevation-soft`（定义在 `gradient-shadow-text.css`）。

`--dsw-corner-shape` 之外的圆角：**不要提供。**

---

## 8. 插件面板自己该用什么

面板是宿主页面里的 React 树，不是隔离的 shadow DOM。因此：

- 直接读别名层令牌，跟宿主主题走。
- 不要给面板单独做一套配色开关——那会和宿主的亮暗切换打架。
- 组件库（若有）里的令牌表必须全部是 §6 对照表右列的真实名字。

若你的插件确实要改全局主题（像主题定制类插件），走 §3.1 的 `overrideTokens`，**不要**自己 `setProperty`。理由：你直接写虽然不会被 presenter 撤掉（§4），但会丢掉叠加顺序、light/dark 成对取值、dispose 三件事，并且和用户的其它主题插件互相覆盖——没有哪一层能说清「谁最后赢」。

---

## 9. 验证清单

在真机上过一遍：

```powershell
dsh --profile web --dump-config 2>&1 | Select-String "^# == <plugin>"
dsh web --no-open
```

浏览器侧：

- [ ] 面板在**亮色**下正常，文字与背景对比可读
- [ ] 切到**暗色**，面板**没有白底**（这是 `--bg-primary` 兜底 `#fff` 的典型症状）
- [ ] 面板同时跟随切换，不需要刷新
- [ ] Console 无未定义变量相关的样式异常
- [ ] 若用了 `overrideTokens`：卸载插件后主题**恢复**到宿主原样
- [ ] 若提供了可注册主题：切换偏好到别的主题再切回，无残留

自动化守卫（推荐，能挡住 §6 的静默回归）：

1. 扫 `src/client/**/*.{ts,tsx}` 里所有 `var(--x)` 的名字，与 dsh 真实令牌集比对，任一不在集合内即失败。
2. 断言扫描确实覆盖了每个视图文件（否则守卫会「绿着漏」）。
3. 断言不存在 `var(--token, fallback)` 硬编码兜底。
4. 断言所有名字以 `--dsw-` 或 `--dsh-` 开头。

---

## 附：核实方式

本文所有令牌名与数量来自：

- `deepseek-harness/packages/client/ui-theme/src/styles/*.css`（令牌定义）
- `deepseek-harness/packages/client/ui-theme/src/client/index.ts`（API 与校验）
- `deepseek-harness/packages/client/ui-layout/src/client/theme-presenter.ts`（落盘路径）
- `deepseek-harness/packages/client/ui-theme/README.md`（设计原则表述）

复现命令（在 dsh 源码盘根目录）：

```powershell
# 各层定义数量
$css = Get-Content packages\client\ui-theme\src\styles\design-platform.css -Raw
foreach ($t in @('--dsw-static-','--dsw-alias-','--dsw-specific-')) {
  "$t " + ([regex]::Matches($css, [regex]::Escape($t) + '[\w-]+\s*:')).Count
}

# 某令牌是否有定义（空 = 不存在）
Select-String -Path packages\client\ui-theme\src\styles\*.css -Pattern '--dsw-alias-state-error-tertiary\s*:'
```

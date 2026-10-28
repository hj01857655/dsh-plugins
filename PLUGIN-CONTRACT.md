# dsh 插件开发契约

本文件记录本目录下 8 个 dsh 插件的**硬性契约**。每一条都来自对官方源码与运行时的实际核验，不是推测。

**配色与样式的内容不在这里** —— 见 `THEME-CONTRACT.md`（令牌分层、`ctx.theme` API、定义在 `body` 上、不得自创令牌名、圆角与动效为何没有令牌）。

---

## 0. 先分清两个 dsh

| | 位置 | 用途 |
|---|---|---|
| **CLI 运行时**（`dsh` 命令） | `C:\Users\12925\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh` | 官方 npm 全局安装，版本以 `dsh --version` 为准 |
| **Desktop 运行时**（动态端口，rc.3 实测见 §9） | `C:\Users\12925\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh` | Electron 自带，包名是 `@deepseek-ai/dsh-desktop-runtime` |
| **源码参考**（只读） | `E:\VSCodeSpace\deepseek-harness` | 阅读契约用，**不参与运行** |

> **三个位置可能三个版本。** 本机实测（2026-10-20）：CLI 与 Desktop 都已为 `0.2.1-rc.2`（npm 的 `next`）。此前 CLI 曾落后到 `0.1.5-rc.2`，导致本契约 9.1 等条款失效——版本不齐时先对齐再读契约。
>
> **但同一安装内部也可能不齐。** 2026-10-20 实测：`dsh@0.2.1-rc.2` 的全局安装里，`node_modules/@deepseek-ai/dsh-base` 是 `0.2.0-rc.2`（`npm ls` 报 `invalid`），而 Desktop 的是 `0.2.1-rc.2`。两个 base 的 patch 内容不同（0.2.0 没有 `working-directory` 行），所以「宿主版本」不足以推断「哪个服务被挂载」。查法见 4.1。

**铁律：契约必须以运行时版本为准。** 照源码写完，必须回运行时核验一遍包名、导出约定、服务名。

查运行时里某个契约事实：

```powershell
# CLI 运行时（依赖是扁平安装在 dsh/node_modules 下，不是 .pnpm）
$g = "C:\Users\12925\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai"
$j = Get-Content "$g\dsh-client-ui-skill\package.json" -Raw | ConvertFrom-Json
$j.dsh.client      # 看官方怎么写
```

**权威文档优先于本契约。** 0.2.0 起 `@deepseek-ai/dsh-plugin-manager` 自带中文 README（`README.zh.md`，约 20 KB），是本契约第 9 章的一手来源：

```powershell
$pm = "$env:APPDATA\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-plugin-manager"
code "$pm\README.zh.md"
```

---

## 1. 骨架不变量

一个 dsh 插件 = **宿主半边** + **浏览器半边**，两者通过 HTTP 路由通信。

```
<plugin>/
├── package.json            # manifest：dsh.bundle.patch + dsh.client
├── cordis.patch.yml        # 注册进 profile 的装载行
├── tsconfig.json           # 宿主半边（编译到 lib/）
├── tsconfig.client.json    # 浏览器半边（必须 noEmit）
├── src/
│   ├── index.ts            # 宿主入口：apply(ctx)
│   ├── routes.ts           # 宿主路由：ctx.inject(['connection'], ...)
│   ├── cli.ts / bin.ts     # 命令行入口（不启动 dsh 也能用）
│   └── client/
│       ├── index.tsx       # 浏览器入口：注册槽位 + 词典
│       ├── locales.ts      # zh / en 词典
│       └── view.tsx        # React 组件（纯渲染）
├── scripts/bundle-client.mjs   # 浏览器半边打包成 loader 工厂
└── tests/
```

---

## 2. `cordis.patch.yml` 格式

dsh loader 要求**顶层是 YAML 数组**，不是对象：

```yaml
- insert:
    - id: <plugin-name>
      name: '<plugin-name>'
```

写成顶层对象（`insert:` 开头）会报：

```
Error: overlay .../cordis.patch.yml must be a top-level YAML array of loader patch entries
```

---

## 3. `package.json` 必填字段

```json
{
  "main": "lib/index.js",
  "exports": {
    ".": { "types": "./lib/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/client/index.d.ts", "default": "./lib/<plugin>.web.js" },
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml", "README.md", "CHANGELOG.md"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": ["@deepseek-ai/dsh-client-ui-renderer", "..."]
    }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "~4.0.5",
    "@deepseek-ai/dsh-agent": "^0.2.1-rc.2"
  }
}
```

> 只写**运行时会 `import` 的**宿主包。纯类型依赖（`import type`，含 `import type {}` 这种只为拿 `declare module` 增补的写法）放 `devDependencies` 就够——编译期有类型，产物里没有 import，宿主也就不需要为它做模块拦截。注意宿主只拦截**在 peer 里点名的包**（`app-boot` 的 `resolver.ts`：`readPeerNames(directory).has(name)`），所以真跑起来要 import 的包漏在 peer 外，会被解析到 profile 自己的副本上，两个实例。

> **peer 里的包同时也是 devDependency。** 两条用途不同：peer 让宿主拦截（保证模块身份），devDependency 让本地能编译和跑测试。`pnpm-workspace.yaml` 里 `autoInstallPeers: false`，所以 peer 不会被自动装进工作区——漏了 devDependency 那一行就是 `ERR_MODULE_NOT_FOUND`。
>
> 还有一个连带效应：**被依赖的官方包自己的运行时 import 也要能解析**。`@deepseek-ai/dsh-tools` 运行时 import `dsh-scope`、`dsh-sandbox`、`dsh-brand` 等（它自己的 peer），宿主里由 dsh 的完整安装满足，工作区里却什么都没有。要在测试里实例化真实 `ToolRuntime`，这几个必须同时进 `devDependencies`，否则报的是 `Cannot find package '@deepseek-ai/dsh-scope' imported from …/dsh-tools/lib/index.js`——错在别人的包里，很容易误判成自己写错了。宿主自己的 patch 里点名了 `dsh-scope` / `dsh-sandbox` 等（`ToolRuntime` 的 `static inject`、`dsh-sandbox` 的 escalation 逻辑），profile 里本来就有，所以它们**不需要**进本插件的 `peerDependencies`。

要点：

- **`dsh.bundle.patch` 必填**——否则 dsh 把它当普通依赖，不加载 patch 层。
- **宿主共享包必须放 `peerDependencies`，绝不能放 `dependencies`**。这用于保持宿主与插件的模块身份一致；旧版 Desktop 专属校验已移除，不能再以该校验作为当前版本的依据（见 9.3–9.4）。
- **`./client` 的 `default` 指向打包产物**（`lib/<name>.web.js`），**`types` 指向 tsc 产物**（`lib/client/index.d.ts`）。两者不是同一个文件——`lib/client.js` 是 `src/client.ts` 的编译产物，**不要**用它，重名会让 esbuild 覆盖宿主模块。
- **不能有 `prepare` 等生命周期脚本**——dsh 拒绝安装，除非在 `allowBuilds` 白名单里。所以 `lib/` 必须随 npm 包预构建发布。

---

## 4. ⚠️ 两个 inject，别搞混

这是最容易踩的坑。**同一个插件有两套 `inject`，名字规则完全不同：**

| 位置 | 语义 | 值 |
|---|---|---|
| `package.json` → `dsh.client.inject` | **包名**依赖边 | `["@deepseek-ai/dsh-client-locale", ...]` |
| `src/client/index.tsx` → `export const inject` | **cordis 服务名** | `["slots", "locale"]` |

官方 `ui-skill` 的对照（运行时实测）：

```
manifest : ["@deepseek-ai/dsh-api-session-controller", "@deepseek-ai/dsh-client-locale",
            "@deepseek-ai/dsh-client-ui-renderer", "@deepseek-ai/dsh-client-ui-tool", ...]
src      : ['inputTriggers', 'sessions', 'slots', 'locale', 'remote', 'remote.skills']
```

**服务 → 提供包对照表**（运行时 `0.2.0-rc.2` 复核，2026-10-16：三行均按运行时产物里的 `super(ctx, "slots")` / `ctx.provide("locale", …)` / `ctx.provide("connection", …)` 逐条核到）：

| 服务名（源码 inject） | 提供包（manifest inject） |
|---|---|
| `slots` | `@deepseek-ai/dsh-client-ui-renderer`（`registry.ts` 里 `super(ctx, 'slots')`） |
| `locale` | `@deepseek-ai/dsh-client-locale`（`ctx.provide('locale', locale)`） |
| `connection` | `@deepseek-ai/dsh-client-connection` |

`settings.section` **槽位**由 `@deepseek-ai/dsh-client-ui-settings` 声明——注册进它需要该包在 manifest 里。

### 4.1 host 半边：`inject` 里写什么，等于「没有它我就不跑」

cordis 的 `inject` 是**硬依赖**：任一声明服务未提供，fiber 停在 `pending`，`apply` 根本不会执行。启动时只打印一行：

```
dsh-context-memory (dsh-context-memory): pending (waiting for service: workingDirectory)
```

`pending` 和「没装」在观感上没有区别——服务不注册、pre-step 不挂、CLI 不工作。所以：

- **只写你真的不能没有的服务**。能降级的服务用 `ctx.get('name')` 读：未提供时返回 `undefined` 而不是抛错（cordis 4.0.5 实测），`?.` 加兜底即可。
- **不要假设服务一定被挂载**。同一台机器上 `dsh@0.2.1-rc.2` 可以配着 `@deepseek-ai/dsh-base@0.2.0-rc.2`（npm 报 `invalid`，宿主照常启动）：0.2.0 的 base patch 里**没有** `working-directory` 这一行，`fs-search` / `tool-skill` / `workflow-ptc` 会一起 `pending`——这是宿主自身的不一致，插件不该被它拖死。
- 判断某服务是否被挂：`dsh --profile <p> --dump-config | Select-String "id: working-directory"`。

#### 可降级能力：`ctx.inject` 挂子 fiber，而不是写进 `inject`

`ctx.get` 只适合「读一下就走的」服务。当一项能力需要**注册**东西（工具、路由、事件里的额外监听），且它缺失时只该丢掉那一项、其余照跑，正确写法是 `ctx.inject(['服务名'], (child) => …)`：

```ts
// dsh-context-memory/src/tools.ts
export function registerMemoryTools(ctx: Context, options: MemoryToolOptions): void {
  ctx.inject(['tools'], (toolCtx) => {
    toolCtx.tools.register(defineTool({ name: 'memory_recall', /* … */ }))
  })
}
```

区别是硬的：写成静态 `export const inject = ['tools']`，那么没有工具注册表的宿主（CLI、headless profile）上**整个插件** `pending`——pre-step、`contextMemory` 服务、面板全都不跑，而它们跟工具毫无关系。`ctx.inject` 让缺失只损失那一个子 fiber。

同一个判据适用于路由：本插件的 `registerMemoryRoutes` 就是这么挂 `['connection']` 的，headless 宿主只是没有面板。

`ctx.inject` 只在注册那一刻被调用：服务后到也没关系，所以它不要求在 `apply` 顶部就存在，也不要求调用方 `await`。反过来，别指望它同步执行完——测试里要等一次 `setImmediate` 再去调工具，否则可能赶在子 fiber 起来之前。

#### 工具注册的额外约束（`@deepseek-ai/dsh-tools` 0.2.1-rc.2 实测）

- `ToolRuntime` 自带 `static inject = ["systemPrompt"]`。测试里要实例化它，得先提供一个 `systemPrompt` 服务的替身，否则 `ctx.tools` 永远是 `undefined`，`ctx.inject(['tools'])` 的回调也不会触发。
- `defineTool` 在**注册时**编译 schema（`parameterSchemaSpecToJsonSchema` / `valueSchemaSpecToJsonSchema`），在**每次调用时**校验入参与返回值。所以测试必须走 `ctx.tools.execute({ callId, name, arguments, signal })` 这条真实通路；直接调 `execute` 实现会通过一个注册表可能拒绝的定义。
- `parameters` 里的每个属性用 `required: true` 标必填；`output.schema` 若声明了 `properties`，`additionalProperties` 必须显式写 `true` 或 `false`（省略会编译报错）。
- 走 `ctx.tools.execute` 的入参不合法时，结果由**注册表**返回 `isError`，错误串是 `invalid arguments: "x" must be one of [...]`；在实现里自己校验会得到与「合法但没结果」无法区分的失败。

---

## 5. 浏览器半边打包：必须是 loader 工厂，不是裸 ESM

dsh 把多个插件的客户端产物**拼成一个 `<script>` 串行求值**。裸 ESM 会带顶层 `import`，拼接后语法非法，求值中断 → 报：

```
... loaded without registering "@deepseek-ai/dsh-client-hmr" via __ModuleLoader__.load
```

正确格式是 **lazy-CJS 工厂**：

```js
window.__ModuleLoader__.load({ id: "<plugin-name>", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
// ... CJS 主体 ...
return module.exports; } });
```

esbuild 配置：

```js
await build({
  entryPoints: ['src/client/index.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'cjs',                 // 关键
  target: 'es2022',
  outfile: 'lib/<name>.web.js',
  sourcemap: true,
  jsx: 'automatic',              // 关键：默认经典 JSX 会失败
  external: ['react', 'react/jsx-runtime'],
  banner: { js: 'window.__ModuleLoader__.load({ id: "<name>", factory: (require) => {'
    + '\nvar module = { exports: {} }; var exports = module.exports;' },
  footer: { js: 'return module.exports; } });' },
})
```

`react` 由 loader 的模块表提供（`PLATFORM_MODULES`），保持 external。

### 5.1 dsh 如何发现你的客户端半边

宿主按 bundle 的 patch 层组装 roster（`packages/test-support/client-runtime/src/assembly/bundle-roster.ts`）：

1. 读每个 bundle 的 `dsh.bundle.patch`，解析其中的 `insert` 行
2. 对每个启用的包，读它的 `package.json`
3. **只挑 `dsh.client.platform === 'web'` 的**，把 `dsh.client.inject` 与 `immediately` 带进 roster
4. 分组（`group: true`）会展开；组上的 `disabled` 会禁用其下所有行；`seen` 集合按包名去重

**两个直接后果**：

- **插件必须出现在某个 bundle 的 patch 层里**，否则 roster 根本不看它。这就是 `cordis.patch.yml` 里 `insert` 行的作用——profile 的 bundle 列表是 `['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']`，你的插件靠自己的 patch 被 `dsh plugin add` 追加进去。
- **`platform` 字段拼错（比如写 `'browser'`）会被静默跳过**——不报错，只是浏览器里没有你的页面。这是最隐蔽的一类失败。

浏览器请求的 URL 是 `/plugins/<pkg-name>/client.js`，host 把它映射到包 `exports` 里的 `./client` 条目——所以 `exports["./client"]` 的键名必须正好是 `./client`。

---

## 6. ⚠️ `tsconfig.client.json` 必须 `noEmit`

带 `rootDir: src/client` + `outDir: lib` 时，`tsc -p tsconfig.client.json` 会把 `src/client/index.tsx` **输出到 `lib/index.js`，覆盖宿主半边**。宿主加载到客户端代码后去等客户端服务，profile 拒绝启动：

```
plugin tree failed to load: 3 entries did not activate
  <plugin>: pending (waiting for services: ...)
```

正确写法：

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "jsx": "react-jsx", "lib": ["ES2022", "DOM", "DOM.Iterable"], "noEmit": true },
  "include": ["src/client", "src/types.ts"]
}
```

`.gitignore` 加防线，防止编译产物落进 `src/`：

```
src/**/*.js
src/**/*.d.ts
```

自检：`lib/index.js` 里不应出现 `dsh-client-`。

---

## 7. 中文本地化（官方机制）

界面文字全部硬编码英文 = 不合规范。官方做法：

```ts
// locales.ts —— zh 是 key 集合的基准，en 用 typeof zh 约束，缺 key 编译不过
export const NS = 'myPlugin'
export const zh = { 'nav': '成本', 'title': '成本', /* ... */ }
export const en: typeof zh = { 'nav': 'Cost', 'title': 'Cost', /* ... */ }

// index.tsx
export const inject = ['slots', 'locale']

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), '<plugin>: dictionaries')

  ctx.slots.inject('settings.section', () => ctx.slots.register(
    {
      name: 'settings.section',
      id: '<slot-id>',
      order: 41,
      label: () => ctx.locale.bind(NS)('nav'),
      locale: NS,          // ← 声明后，组件收到 t 座位，语言切换自动重渲染
    },
    MyPanel,
  ))
}

// view.tsx —— 所有可见文字走 t
export function MyPanel({ t }: { t: (key: string) => string }) {
  return <h2>{t('title')}</h2>
}
```

要点：
- `locale: NS` 是**声明式**的——渲染器据此给组件注入 `t`，并按 `(face, ns, revision)` 缓存函数引用，语言切换靠引用变化触发 `React.memo` 重渲染。
- `zh` 必须是 key 集合的**唯一真相来源**，`en` 用 `typeof zh` 约束。
- 官方 53 个 client 包中 35 个注册了 zh 词典。

---

## 8. 宿主半边：路由与降级

```ts
export function apply(ctx: Context): void {
  const service = { /* ... */ }
  ctx.provide('myService', service)
  registerRoutes(ctx, service)
}

// routes.ts
export function registerRoutes(ctx: Context, service: MyService): void {
  ctx.inject(['connection'], (connectionCtx) => {     // 必须 inject，不能直接读 ctx.connection
    const connection = (connectionCtx as any).connection
    connection.fetch.register({
      path: PANEL_PATH, methods: ['GET'], requestBody: 'buffered',
      fetch: () => Promise.resolve(Response.json(service.panel(), {
        headers: { 'cache-control': 'no-store' },      // 每次从磁盘重算
      })),
    })
  })
}
```

- **必须用 `ctx.inject(['connection'], cb)`**——直接属性访问会抛 `cannot get property "connection" without inject`。
- 无头 host 没有 web connection，`inject` 不触发即可，插件照常加载（静默降级）。
- 面板数据每次请求从磁盘重新推导，不缓存——否则面板显示的是启动时的状态。
- 客户端取数走 `/api/*` 路由，用全局 `fetch`。

---

## 9. Desktop 与 Web 的差异

**结论先行：同一个包同时适配两者，不需要分叉。** Desktop 就是 Web 应用套一层 Electron 壳。

| | Web | Desktop |
|---|---|---|
| profile 目录 | `$DSH_HOME/profiles/web` | `$DSH_HOME/profiles/desktop` |
| bundle 层 | `['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']` | **完全相同**（`PROFILE_TEMPLATES.web`） |
| 客户端半边 | 浏览器 `<script>` | Electron renderer，**同一套 `/plugins/<id>/client.js` 机制** |
| 后端 | `dsh web` 自选端口 | 私有 Host 进程。**rc.2 源码读出固定 `--port 19387`；rc.3 实测是动态端口**（2026-10-28 观察到 `127.0.0.1:65008`），定位方法：按 PID 查 `@deepseek-ai/dsh-desktop-host` 进程的 LISTEN 端口，或读其命令行 |
| 插件安装 | `dsh plugin --profile web add <pkg>`（CLI 转发 pnpm） | 应用内「插件」页；`dsh plugin --profile desktop` 亦可用，但 Desktop 必须先完整退出 |

Desktop 的 Host 启动方式（`apps/desktop-host/src/index.ts`）：

```ts
runProfile({ profile: 'desktop', args: ['--no-open', '--port', '19387'], ... })
```

——**就是 web profile，只是进程由 Electron 拉起、端口固定**。所以宿主半边与浏览器半边的写法完全一致。

### 9.1 CLI 可以装 desktop 插件，但有前提（0.2.0 起放宽）

`0.1.5` 时代这条命令被硬拦：

```sh
dsh plugin --profile desktop add <pkg>
# error: profile "desktop" is managed exclusively by the Electron application"
```

拦截代码在 `lib/bin.js` 的 `rejectElectronProfile()`，由第三个参数 `manageDesktopProfile` 控制：

```js
function parseDshArgs(argv, version, manageDesktopProfile = false) { ... }
//                                        ↑ 默认 false = CLI 被拦
```

源码注释写明该参数的用途是 *"permit Desktop's installed carrier to manage its reserved profile's plugins"*——**Desktop 应用自己有权管自己的 profile，CLI 默认没有**。

**0.2.0 的实际行为**（读 `lib/plugin-BGnVfe_D.js` 与 `@deepseek-ai/dsh-plugin-manager` README 得出）：

| 条件 | 结果 |
|---|---|
| Desktop 从未启动过 | 拒绝：`Open DeepSeek Harness Desktop once to initialize its profile, then fully quit it before running dsh plugin --profile desktop.` |
| Desktop 正在运行 | 由 `withFileLock` 等锁（`lockWaitMs` 默认 120 s）挡住，避免并发写 manifest |
| Desktop 已完整退出 + profile 已初始化 | **可以装**，且会打印兼容性警告 |

所以结论要分两层说：

- **推荐路径仍是应用内「插件」页**——它经 Web 应用的认证 HTTP API 走共享插件管理器，不需要退出应用，还能用上 HMR 即时生效。
- **CLI 不是被禁**，而是需要 Desktop 完全退出。适合脚本化、CI、或应用内页面出问题时的兜底。

> ⚠️ 旧版契约写的「CLI 介入会破坏 Desktop 的派生态」在 0.2.0 已不成立：profile 初始化与插件管理在 commit `8c2fa73ceb` 后就是 CLI/Desktop 共享实现了。看到这条旧说法按过期处理。

> ⚠️ **0.2.1-rc.3 实测修正（2026-10-28）**：上表在 rc.3 **不成立**。rc.3 的 `lib/bin.js` 里
> `plugin` 子命令的 action 恢复了硬拦截，且是无条件的：
>
> ```js
> .action((args, options) => {
>     if (!manageDesktopProfile) rejectElectronProfile(plugin, options.profile);
> ```
>
> `manageDesktopProfile` 只是 `parseDshArgs` 的第三个参数，**没有任何环境变量、旗标或
> 配置能从外部打开**——只有 Desktop 自身的 launcher（`@deepseek-ai/dsh-desktop-host`）
> 会传 `true`。实测 `dsh plugin --profile desktop add <path>` 在 CLI 已对齐 rc.3、
> Desktop 完整退出与否均被拒。同一拦截也覆盖 `--profile desktop` 的 boot / `--dump-config`
> （该调用点连守卫都没有），所以 **desktop profile 在 rc.3 上 CLI 侧完全不可操作**。
>
> rc.3 的可行路径只有两条：**应用内「插件」页**，或手工复刻 `installBundle` 的动作
> （profile 目录 `pnpm add` + 向 `cordis.patch.yml` 追加 insert 行）——后者实测可被
> Desktop 正常加载。本仓库 `dsh-git` 插件即以此方式装载成功。契约 §9.1 的
> 「Desktop 已完整退出即可装」按 rc.2 及更早版本理解。

### 9.2 安装来源：registry / path / tarball / git，且 `dsh plugin` 是 pnpm 转发

**先记住语义变化**：0.2.0 的 `dsh plugin` 不再是封装好的安装器，而是**把参数原样转给 pnpm**（`lib/bin.js` 的 description：*"manage a profile's plugins by forwarding the remaining arguments to pnpm in the profile directory"*）。所以任何 pnpm 的 spec 形式都能用，版本范围、tag、`workspace:*` 都由 pnpm 解释。

| kind | 形态 | 备注 |
|---|---|---|
| `registry` | npm 包名，可带版本范围 | 默认先问 `options.registry`，失败再问 `fallbackRegistries`（默认 `https://registry.npmmirror.com/`） |
| `path` | 本地绝对/相对路径 | 直接读其 `package.json`，版本兼容检查在 pnpm 运行前完成 |
| `tarball` | `.tgz` / `.tar.gz`，本地或 HTTP | 必须先抓取，因此版本兼容性在安装后才判定 |
| `git` | `github:` 简写、`git://`、`git@host:`、托管仓库 URL | 安装前有 `git ls-remote` 连通性预检（`githubConnectionTimeoutMs` 默认 5000 ms） |

**本地 path 安装是支持的**，不需要为了验证而先发 npm。

> ⚠️ **rc.3 实测（2026-10-28）：`link:` 协议不能用，必须 `file:`。** 直接
> `pnpm add <本地目录>` 会以 `link:` 落盘，pnpm 自己警告 *linked dependency will not
> resolve the peer dependencies from the target node_modules*——插件运行时会把
> `@deepseek-ai/cordis` 等解析到**工作区自己的 node_modules**，得到第二份 cordis 实例
> （§9.4 的「服务互相看不见」）。改成 `file:<绝对路径>` 后 peer 由宿主的模块拦截机制
> 接管，身份一致。验证方法：从插件目录 `require.resolve('@deepseek-ai/cordis')`
> 应落在 profile/宿主的副本上；desktop profile 的 node_modules 里没有 `@deepseek-ai/`
> 目录是**预期现象**（宿主运行时按 peer 名单拦截重定向），不要当成故障排查。

#### git 源的插件会被 pnpm 拦，除非放行构建脚本

git 源的包通常靠 `prepare` 脚本在安装时构建。pnpm 11 默认拦截依赖脚本，于是安装失败并在 `pendingBuilds` 里报告待决定的包名。放行方式——把精确 key 写进 profile 的 `pnpm-workspace.yaml`：

```yaml
# $DSH_HOME/profiles/<profile>/pnpm-workspace.yaml
allowBuilds:
  <package-name>: true
```

CLI 检测到 git spec 失败时会直接把这提示打出来。Web 插件页则提供「允许这些脚本并重试」按钮。**授权按包名保存在当前 profile，允许以宿主用户权限执行命令**——只批准你信任的包。

#### 版本兼容闸门（0.2.0 新增，最容易踩）

点名包的 `add` / 带 spec 的 `install` 会在 **pnpm 运行前**做一次 DSH peer 兼容检查。不兼容就直接失败，不下载、不跑构建。报错形如：

```
dsh: plugin command failed; diagnostics: <logPath>
dsh: to accept the risk, run: dsh plugin --profile <profile> allow-version <name>@<version> --dsh-version <runtime> --accept-risk
```

豁免写在 profile 自己的 `compatibility.json`（与 `package.json`、`cordis.patch.yml` 并列），把**精确的 `package@version`** 映射到**精确的 DSH 运行时版本**列表。要点：

- 插件升级、DSH 升级都**不继承**授权，要重新批。
- 豁免**不授权依赖脚本**，构建脚本仍走上面的 `allowBuilds`。
- 在线 profile 授权后当次会话即重新组合挂载（报告 `applied`）；仅启动型 profile 要重启（报告 `restart-required`）。
- CLI 三个子命令：`version-exemptions`、`allow-version <pkg@ver> --dsh-version <runtime> --accept-risk`、`revoke-version <pkg@ver> --dsh-version <runtime>`。

### 9.3 曾经存在过的 desktop 专属校验（已移除，不要照旧资料写）

`0.1.6-alpha.2` 之前，`apps/desktop/src/profile-packages.ts` 有一个 `validateDesktopPluginGraph`，会拒绝：把宿主共享包声明为 `dependencies`、peer 版本不匹配、包解析到 profile 外、宿主包嵌套/别名副本、**符号链接的私有包**（`desktop profile: linked private package`）。

那个函数在 `e84a4e857e`（2026-09-10）「refactor(desktop): run shared Web UI in a thin Electron shell」中被删除；随后 `8c2fa73ceb` 把 profile 初始化与插件管理抽成 CLI/Desktop 共享实现。当前源码已无该函数、无 `linked private package` 错误串。

**判断旧资料是否过时的最快方法**：在源码里搜那两条错误串，搜不到就是旧版规则。

> **注意别矫枉过正。** 那个函数没了，但 *"peer 不匹配"* 这一类检查在 0.2.0 以另一种形式回来了——见 9.2 的**版本兼容闸门**：点名包的 `add` 会在 pnpm 运行前校验 DSH peer，不兼容直接失败。区别是旧版是安装期的硬拒绝 + 无法豁免，新版是可经 `allow-version --accept-risk` 显式放行。写 `peerDependencies` 时依然要按 9.4 的规矩来。

### 9.4 仍然成立的约束：peer 与模块身份

校验函数没了，但**它想防的问题没有消失**。Desktop 与 Web 都把第一方包连进 profile，宿主与插件必须共用同一模块实例（同一份 cordis、同一份 client 单例），否则服务注册互相看不见。

`packages/boot/app-boot/src/profile.ts` 生成的 pnpm 配置：

```
nodeLinker: hoisted
autoInstallPeers: false
```

`autoInstallPeers: false` 意味着**未声明的 peer 不会被自动补装**。所以：

- 宿主共享包（`@deepseek-ai/cordis` 等）**必须**放 `peerDependencies`，不能放 `dependencies`——放错会得到嵌套副本，两个实例，服务找不到。
- peer 范围要能覆盖宿主实际版本。**实测（2026-10-20）：CLI 与 Desktop 都已升到 `0.2.1-rc.2`，内置 cordis 是 `4.0.5`。** 官方 0.2.1-rc.2 插件统一写 `@deepseek-ai/cordis: ~4.0.5` 加各 `@deepseek-ai/dsh-*: 0.2.1-rc.2`。本仓库插件写 `^0.2.1-rc.2`——semver 在 `includePrerelease` 下把它读作「≥ 0.2.1-rc.2 且 < 0.3.0」，`0.2.0-rc.2` 不再满足。

> **peer 写旧的后果是整包被跳过，不是警告。** 实测输出：
>
> ```
> dsh: skipping profile bundle "dsh-context-memory": Error: Plugin
> dsh-context-memory@0.9.0 is incompatible with dsh 0.2.1-rc.2: peerDependencies {...}
> ```
>
> `--dump-config` 里那一行仍然在（patch 层照常组合），但 fiber 根本不会创建。排查时**不能只看 `--dump-config`**，要看启动时的 `did not activate` 清单。

### 9.5 本机实测边界（2026-10-15 已补齐）

本节内容来自源码阅读，**并已在本机 Desktop 上核验版本事实**：

| 核验项 | 方法 | 结果 |
|---|---|---|
| Desktop 运行时版本 | 读 `app.asar/dsh/package.json` | `0.2.0-rc.2`，包名 `@deepseek-ai/dsh-desktop-runtime` |
| 内置 `@deepseek-ai/*` 包数 | 列 `node_modules/@deepseek-ai` | 289 个，含 `dsh-plugin-manager` / `dsh-client-ui-plugin-manager` / `dsh-client-ui-settings-plugins` / `dsh-host-plugin-inventory` |
| 内置 cordis 版本 | 同上 | `4.0.4` |
| 8 个插件的依赖边是否都在 | 拿 `dsh.client.inject` + `peerDependencies` 逐个比对 | 全部命中，`./client` 产物路径均存在 |
| desktop profile 是否被 Electron 独占 | 搜 `managed exclusively` 错误串 | 0.2.0 运行时中**不存在**该串；只剩 `requireDesktopProfile()` 的存在性检查。**rc.3 该串回归且对 `plugin` 与 `--profile` 全部生效（见 §9.1 修正）** |

**仍未实测的**：插件真正装载后页面是否亮、Console 是否干净。原因——8 个插件此前装在 `profiles/web/node_modules` 的 8 个 symlink 全部指向不存在的 `E:\VSCodeSpace\dsh-plugins`（断链，从未加载过），已在 2026-10-15 清除；`profiles/default` 下另有 8 个实体残留目录，同样已清除。下次装插件后应补这一项。

---

## 10. 构建与测试约定

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json && node scripts/bundle-client.mjs",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.client.json",
    "test": "tsc -p tsconfig.json && node --test",
    "prepublishOnly": "npm run build && npm test"
  }
}
```

- 测试用 Node 内置 `node --test`，**不引入 Vitest / Jest**。
- **test 脚本不能写 `node --test tests/*.test.mjs`**——glob 在 Windows PowerShell 下不展开，Node 拿到字面量找不到文件，CI 直接红。用无参数的 `node --test` 自动发现。
- `tests/*.test.mjs` 必须是**纯 JS，零类型注解**。
- CLI 入口是 `bin.js`（`cli.js` 只导出 `run()`，不自动执行，直接跑 stdout 为空）。
- 测试指向**编译产物** `lib/`，所以 `test` 脚本里要先 `tsc`。
- CI 矩阵必须**双平台**（ubuntu + windows）——guard 语义与 glob 行为是平台相关的。

---

## 11. 真机验证清单

以 npm 已发布的包为例（本地 path 把包名换成绝对路径即可）。

```powershell
# 0. 先对齐版本——CLI 与 Desktop 版本不一致时，契约条款可能失效
dsh --version
# Desktop 版本读: C:\Users\12925\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\package.json

# 1. 装载（web profile；desktop profile 需先完整退出 Desktop）
dsh plugin --profile web add dsh-theme-studio

#    版本不兼容时 CLI 会打印精确的 allow-version 命令，照抄执行：
#    dsh plugin --profile web allow-version <pkg>@<ver> --dsh-version <runtime> --accept-risk

#    查看 / 撤销豁免
dsh plugin --profile web version-exemptions

# 2. 配置层是否识别（会暴露 cordis.patch.yml 格式错误）
dsh --profile web --dump-config 2>&1 | Select-String "^# == dsh-theme-studio"

# 3. 启动（会暴露 host 半边被污染、服务 inject 写错）
dsh web --no-open

# 4. 面板路由（带 cookie 会话，否则 401）
$token = "<启动输出的 token>"
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-WebRequest "http://127.0.0.1:3080/?token=$token" -WebSession $s -UseBasicParsing | Out-Null
Invoke-WebRequest "http://127.0.0.1:3080/api/<plugin>.panel" -WebSession $s -UseBasicParsing
```

浏览器侧：打开页面看 Settings 里是否出现插件页、文字是否跟随语言、Console 有无报错。

**Desktop 侧**：直接用应用内「插件」页添加，不必退出应用——rc.3 起这也是**唯一**官方路径（CLI 侧 desktop profile 全拦截，见 §9.1 修正）；宿主端口 rc.3 为动态分配（见 §9 表）。

**常见静默失败**（不报错但插件不出现）：

| 现象 | 原因 |
|---|---|
| 装成功但页面没有 | `dsh.client.platform` 拼错（如写成 `browser`）——roster 静默跳过 |
| 装成功但 roster 不认 | 插件不在任何 bundle 的 patch 层；检查自己的 `cordis.patch.yml` 是否被 `dsh plugin add` 追加 |
| profile 拒绝启动 | `tsconfig.client.json` 漏了 `noEmit`，`tsc` 把客户端代码输出到 `lib/index.js` 覆盖宿主半边 |
| 服务互相看不见 | 共享包写进 `dependencies` 而非 `peerDependencies`，得到两份 cordis 实例 |
| 客户端语法错误 | `.web.js` 是裸 ESM 而非 `__ModuleLoader__.load()` 工厂 |

---

## 12. 命名与发布

- 包名 / 仓库名 / 目录名三者一致。
- npm 上重名或**过于相似**会被拒（`dsh-trace` 因近似 `dd-trace` 被 403，需在发布前改名）。
- GitHub 仓库打 `dsh-plugin` topic 后进 dsh-plugin-hub（批量同步收录，非实时）。
- README 顶部 badges：npm version、downloads、CI、license、node、stars、topic。
- 仓库需带 `dsh-plugin` topic（进入 dsh-plugin-hub）；为与其余仓库一致，同时打 `deepseek-harness`、`dsh`、`dsh-plugins`。
- LICENSE 文件（MIT）——新建仓库时最容易漏的一项。

---

## 13. Agent 生命周期钩子

dsh 的 agent 循环暴露 `agent/pre-step` 事件，插件可以在 agent 组装每一步请求前插入内容。

### 已知可用的事件

| 事件 | 签名 | 时机 |
|---|---|---|
| `agent/pre-step` | `(ctx: { agent, messages, signal }, next) => Promise<PreStepDecision>` | agent 组装本步请求之前，所有 pre-step 钩子按中间件顺序依次执行，最后的 `decision.messages` 即发送给模型的消息列表 |

### 使用方式

```ts
ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
  const decision = await next()
  if (decision.kind === 'reject') return decision
  // 在 decision.messages 中插入 / 移除消息
  return { ...decision, messages: [...decision.messages, myContextMessage] }
})
```

### 契约要点

- **先调 `next()`，再改 `decision.messages`。** 中间件链的顺序由加载顺序决定，后加载的插件在外层。
- **注入的消息要声明自己的 `kind` —— 0.2.0-rc.2 起没有通用的 `plugin` 兜底 kind。** `MessageSourceMap` 是可合并的 sum type（`@deepseek-ai/dsh-llm` 原文：*Merge-extensible sum type — each producer declares its own `kind` in its own module; there is no shared catch-all `plugin` kind*）：生产者在自己模块里 augment 进 map，消费者按 `kind` 收窄。官方 `dsh-agent-loop` 的 `runtime-context` 就是这么写的，照拄即可：

```ts
// 自己的模块，例如 src/source.ts
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'my-plugin': { kind: 'my-plugin' } & ContextFormed
  }
}
export const recallSource = { kind: 'my-plugin', form: 'recall' } as const
```

`form` 是与生产者无关的另一轴（`ContextForm`：`instructions` / `catalog` / `snapshot` / `notice` / `relay` / `recall`；省略 = 不透明内容）。仍按老写法写 `kind: 'plugin'` 在 0.2.0-rc.2 下直接 `TS2322`（该联合只剩 `user` / `model` / `tool` / `system-prompt` / `model-selection`），`plugin` / `form` 字段也读不到。
- **清理上一步的注入。** 每次 pre-step 先 `agent.inbox.remove(previousId)` 移除上一步注入的消息，再插入新的。否则历史里会出现越来越多的重复注入。
- **空内容不要注入。** 如果没有相关内容，直接返回原 decision，不要插入一条空消息。

### 当前使用情况

| 插件 | 用途 |
|---|---|
| dsh-context-memory | 在 pre-step 中自动捕获用户显式记忆语句，并注入 top-5 相关记忆 + 未决冲突 |

---

## 14. 相关文档

- `THEME-CONTRACT.md` —— 主题与样式：令牌分层（`--dsw-static-*` / `--dsw-alias-*` / `--dsw-specific-*` / `--dsh-*`）、`ctx.theme.overrideTokens()` 与 `register()`、为什么必须写在 `body` 而不是 `documentElement`、自创令牌名为何静默失效、圆角/动效为何没有令牌。

# Skills Market Hub

**DeepSeek Harness 的技能市场插件**：在桌面端侧栏浏览 ClawHub 与 SkillHub 上的技能，读说明、看文件、确认后安装到本机，并在同一个面板里管理已安装的技能。

当前版本 **0.1.2**（[更新说明](./CHANGELOG.md)）。已在 DeepSeek Harness `0.2.0-rc.2` 上实测运行，见[验收记录](#验收记录)。

本插件是独立的社区项目。技能由各自的作者发布，版权归原作者，以每个技能自己声明的许可证为准；本仓库的 MIT 许可证只覆盖插件自身的代码。

---

## 这个插件做什么

| 功能 | 说明 |
| --- | --- |
| **双源浏览** | ClawHub 与 SkillHub 同时检索，跨源镜像自动折叠（保留原始条目，不展示过期的副本） |
| **筛选与搜索** | 按来源、安全结论、安装状态筛选；关键词搜索对全角/半角与 markdown 强调符号都做归一化 |
| **安装前预览** | 完整 SKILL.md、逐文件清单与内容、上游安全报告、版本变更日志 |
| **确认后安装** | 弹窗列出来源、作者、版本、安全结论；勾选知晓后才可确认 |
| **已安装管理** | 列出本机全部技能（含手动放入的），区分「市场安装」与「本地」，可预览、可卸载 |
| **持久快照** | 上游数据落盘缓存（默认 60 分钟），`fetchedAt` 命中不重新盖章，上游不可用时回退陈旧数据 |

---

## 安装

```bash
dsh plugin --profile desktop add <本包路径或包名> -w
```

装完重启 DeepSeek Harness 桌面端，侧栏会出现「技能市场」入口。

本插件只向 profile 的插件行**插入自己一行**，不替换任何官方组件。想移除时删掉那一行即可。

### 修改代码后，profile 需要重新安装一次

**这是最容易踩的一个坑**：用 `file:` 指向本地目录安装时，包管理器放进 profile 的不是软链接，而是**安装那一刻的拷贝**。之后你改源码、重新构建，profile 里仍然是旧版本 —— 而插件"看起来装好了"，所以这个现象很难归因：你复现的仍然是已经修好的那个错误。

从 0.1.2 起，插件会**自己发现这件事**。宿主的日志里会出现一行：

```
skills-market-hub: ready (v0.1.2, root=…, install=…, uninstall=on, cache=60m)
```

如果加载的构建与它旁边的 `package.json` 版本不一致，紧跟一条警告，写明两个版本号和要执行的命令。

每次改完代码、重新 `pnpm build` 之后：

```bash
cd ~/.dsh/profiles/desktop
pnpm install --force --no-frozen-lockfile
```

然后重启桌面端。

`--force` 不能省：包管理器按 `file:` 路径缓存依赖，不加它就会认为"路径没变，无需处理"，拷贝依旧是旧的。

> 试过用 `postinstall` 钩子自动重建，**已放弃**：pnpm 11+ 默认拦截依赖的 install 脚本，那样会让**整个 profile 安装失败**（`ERR_PNPM_IGNORED_BUILDS`）。为了省一步手工操作而弄坏主要安装流程，不划算。所以这里选择"发现并说清楚"，而不是"自动修"。

判断 profile 里到底是哪一份，直接比哈希（PowerShell，两边应输出同一个值）：

```powershell
Get-FileHash "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-skills-market-hub\package.json" -Algorithm SHA256
Get-FileHash "D:\projects\dsh\dsh-skills-market-hub\package.json" -Algorithm SHA256
```

包的版本号也能直接看出来（Windows 上 `require()` 会被反斜杠路径绊住，所以这里读文件再解析）：

```powershell
node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.USERPROFILE+'/.dsh/profiles/desktop/node_modules/dsh-skills-market-hub/package.json','utf8')).version)"
```

改代码时不建议改用 `git+ssh://…` 安装：那条路走的是仓库里提交的 `lib/`，每次改动都要先提交推送再重新拉取，联调阶段反而更慢。等插件稳定、或要部署到别的机器时再换。

### 从源码构建

```bash
pnpm install
pnpm build      # tsc×2 + esbuild，产出 lib/
pnpm check      # typecheck + build + 契约校验 + 全部测试 + 打包闭包
```

---

## 配置

写在 profile 的插件行 `config` 里；每个字段都有默认值，写 `{}` 也能启动。

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `skillsRoot` | `null` | 安装到哪个目录。`null` = `$DSH_HOME/skills` |
| `clawhubBaseUrl` | `https://clawhub.ai` | ClawHub 地址 |
| `skillhubBaseUrl` | `https://api.skillhub.cn` | SkillHub 地址 |
| `timeoutMs` | `15000` | 单次上游请求超时 |
| `requestRetries` | `1` | 首次失败后的额外尝试次数（仅对 429 与 5xx 重试） |
| `allowUninstall` | `true` | 是否允许卸载。关掉后卸载端点一律 405 |
| `pageSize` | `24` | 列表默认页大小（1–100） |
| `cacheTtlMinutes` | `60` | 上游快照有效期（1–1440） |

---

## HTTP 接口

一条前缀路由 `/api/skills-market-hub`，全部返回 JSON 且 `Cache-Control: no-store`；失败恒为 `{ error: { code, message } }`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/ping` `/version` `/stats` `/status` | 存活、版本、缓存计数、逐源健康 |
| GET | `/skills` | 列表。参数 `q, source, security, installed, cursor, limit, refresh` |
| GET | `/skills/:source/:slug` | 详情。参数 `owner`（ClawHub 的 slug 跨作者共享时必填）、`refresh` |
| GET | `/skills/:source/:slug/file` | 单个文件内容。参数 `path`（必填）、`owner` |
| POST | `/install` | body `{ id: "source:slug", owner? }` |
| POST | `/uninstall` | body `{ id }` |
| GET | `/installed` | 本机技能清单 |
| GET | `/installed/detail` | 单个已安装技能的文档与文件清单。参数 `key` |
| GET | `/installed/file` | 已安装技能的单个文件。参数 `key`、`path` |
| POST | `/installed/uninstall` | body `{ key }` |

`key` 是技能绝对路径的 SHA-256：浏览器端从不持有真实路径，主机端每次请求用这个 key 重新扫描磁盘来解析，所以调用方无法构造出任意文件读取。

---

## 设计约束

这几条不是风格偏好，是**发布形态强加的**，改代码前值得先读：

**运行时零依赖。** 宿主以「装好但未构建」的形态加载插件，未被提升到 profile 里的依赖会让插件加载失败。因此 YAML frontmatter 由自带的子集解析器处理（支持块标量、流式集合、引号转义），Markdown 不引入渲染库。

**客户端产物只依赖 React。** `lib/client.cjs` 里出现的每一个 `require()` 都必须是平台种子模块。共享的 UI 原语包（`dsh-client-ui-primitives`）被**刻意不使用**：它的入口在顶层静态导入 katex、shiki、mermaid 语言包、`simple-icons` 与三十余个样式表，取它一个按钮等于把这些全部打进本插件的 bundle。面板因此自己用 `--dsw-*` 主题 token 画控件，代价是零。

**客户端产物是 `.cjs`。** 主机半是 ESM（与其他 DSH 插件一致），而给浏览器模块加载器的产物是 CommonJS 闭包工厂。用扩展名表达这个差异，而不是在 `lib/` 里放一个 `package.json` —— 那会连主机半一起声明成 CommonJS 并让 `import` 直接报错。构建脚本会断言 `lib/` 下不存在那个文件。

**信任门每次请求解析。** 原始 web 路由不继承 Connection 服务的 Host/Origin 围栏，而 Connection 行可能晚于本插件激活；快照会让市场在围栏就位前对任意网页可读可装。

**安装不信缓存。** 详情与文件清单在写入磁盘前强制 `force: true, allowStale: false`；每一个上游给出校验和的文件都会现场比对，不匹配即中止，暂存目录整体丢弃。

**落盘只走原子发布。** 文件先写进技能根下的点前缀暂存目录，全部校验通过后一次 `rename` 发布。卸载先 `rename` 到点前缀回收目录再删除，所以中断最多留下一个被扫描忽略的目录，而不会留下半个技能。

**卸载需要自证所有权。** 目录里必须存在本插件写的 `.skills-market-hub.json`，且其中 `id` 与调用方所指的技能一致。所有权只看身份字段，账本损坏不影响归属判定 —— 但手工放入的技能永远不会被删。

---

## 开发

```
src/
├── index.ts               插件入口：name / inject / Config / apply
├── config.ts              schemastery 配置 schema
├── web-routes.ts          前缀路由、信任门、错误信封、参数校验器
├── routes.ts              端点派发表（12 条）
├── market/
│   ├── types.ts           跨边界数据模型（客户端 import type 的唯一来源）
│   ├── yaml.ts            零依赖 YAML 子集解析器
│   ├── frontmatter.ts     SKILL.md 头/正文切分
│   ├── provider-fetch.ts  超时、重试、流式体积上限、逐源健康
│   ├── clawhub-provider.ts / skillhub-provider.ts
│   ├── cache.ts / disk-cache.ts
│   ├── dedupe.ts          跨源镜像折叠
│   ├── cursor.ts          不透明分页游标
│   └── market-service.ts  筛选、分页、安装态标注
├── skills/
│   ├── root.ts            装到哪 / 什么算已安装
│   ├── installed.ts       清单扫描与 sidecar 校验
│   └── install-service.ts 暂存→校验→原子发布→卸载
└── client/
    ├── index.tsx          slots + locale 注册
    ├── api.ts             主机 HTTP 客户端
    ├── state.ts           控制器与状态机
    ├── ui.tsx             token 化的控件与状态块
    ├── translate.tsx      面板级 i18n 上下文
    ├── locales.ts         zh（基准）/ en
    ├── icons.tsx
    ├── page/MarketPage.tsx
    └── components/        SkillCard / MarketList / MarketDetail / InstalledPanel / Dialogs
```

### 测试

```bash
pnpm check                            # typecheck + build + 契约校验 + 271 项测试 + 打包闭包
node --test tests/*.test.mjs          # 全部离线测试
SMH_LIVE=1 node --test tests/live-providers.test.mjs   # 真实上游集成（需联网）
node scripts/capture-fixtures.mjs     # 重新抓取上游响应夹具
node scripts/pack-check.mjs           # 打包产物装进空目录后是否还能加载
```

上游响应夹具（`tests/fixtures/market/`）由真实注册表抓取，provider 归一化测试全部对着它们跑。夹具的内容会随上游变化（下载计数、首页排名），所以**断言从夹具推导，不写死字面量** —— 重新抓取后仍然应该全绿，除非上游真的改了字段名。

真实上游集成测试**默认跳过**，因为它需要网络、比其余测试慢，而且上游故障不该被读成这个插件的回归。发版前跑一次：夹具是照片，它证明归一化匹配某个时刻抓到的形状，不证明注册表今天仍然这样回答。

---

## 已知边界

- 面板不渲染 Markdown：`description` 按作者所写的预格式文本展示。共享的 Markdown 渲染器会把整个 UI 原语包拖进 bundle（见上文），而自带一个 Markdown 子集解析器再声称它忠实还原，比直接展示原文更糟。「文件」页给出带 frontmatter 的完整源文。
- 没有随包发布的策展目录：首页即实时列表。因此首屏依赖上游可用性（失败时给出重试，而不是空白页）。
- ClawHub 的 slug 跨作者共享。不带 `owner` 的详情请求在上游有歧义时返回 409 与本插件抛出的候选作者列表；面板从卡片或详情页带上作者，从而避免装到另一个作者的字节。
- **只有 ClawHub 把 `owner` 当 pin 解析。** SkillHub 的详情路由本身已经确定账户，`owner` 参数不被上游解释，因此不做作者一致性校验 —— 做了会把本来可装的技能全部拒掉（0.1.0 的真实缺陷，见 [CHANGELOG](./CHANGELOG.md)）。两个 provider 的差别由 `pinsOwner` 显式声明，而不是靠猜。
- **SkillHub 的偏移分页在页边界会重叠一项。** 直接请求原始接口同样如此，属于上游行为，游标层无法消除；由面板按 id 去重，读者不会看到重复卡片。

---

## 验收记录

真实桌面端上的验证结果。与自动化测试分开记录：测试证明代码路径可跑，这里记录的是**人在界面上看到了什么**。

### 0.1.0 — 首次加载

**环境**：DeepSeek Harness 桌面端 `0.2.0-rc.2`，Windows，Node 24.21.0，profile 内 `file:` 安装。

**观察到**：

- 侧栏出现「技能市场」入口，点击后面板正常挂载（无白屏、无控制台报错）
- 首页渲染出 ClawHub 与 SkillHub 双源卡片网格，搜索框与三个筛选下拉可用
- 卡片显示来源、版本、下载量；SkillHub 卡片的安全结论显示为「未知」——**这是正确的**，该注册表只在详情接口返回安全报告
- 点「安装」弹出确认弹窗，列出来源、作者、版本、安全结论，未勾选知晓时确认按钮禁用
- **缺陷**：确认后安装失败，报「the registry resolved a different author for this skill」。SkillHub 技能全部如此。已在 0.1.1 修复（见 [CHANGELOG](./CHANGELOG.md)）

**未验证**（当时未执行）：文件预览、安全与更新日志页签、已安装列表、卸载。

### 0.1.1 — 修复后复验

**环境**：同上，`pnpm install --force` 重新安装到 profile 后重启。

**观察到**：

- SkillHub 技能安装成功，写盘完成
- 「已安装」页签列出该技能，标签为「市场安装」
- 卸载成功，目录被移除

**未验证**（尚无观察记录）：浅色主题、非 Windows 平台、文件预览与安全页签、空态与错误态在实际界面中的呈现。这些路径由自动化测试覆盖，但没有人在真实界面上看过。

### 自动化覆盖对照

`pnpm check` 跑的部分与上面的手工观察是互补的，不是替代关系。截至 0.1.2：

| 层次 | 数量 | 说明 |
| --- | --- | --- |
| 离线测试 | 273 | 含对真实上游响应夹具的归一化、安装/卸载生命周期（真实临时目录）、控制器竞态与分页守卫、组件真实渲染、过期构建检测 |
| 真实上游集成 | 7 | 需联网，默认跳过；含一次真实的安装与卸载 |
| 打包闭包 | 15 | 产物装进空目录后能否独立加载 |
| 契约校验 | 14 | 清单、补丁层、客户端纯度、主题 token、版本一致性、peer 集合 |

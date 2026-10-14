# 更新说明

## 0.1.4

**修复：Windows 上安装会间歇性失败，报「publishing the skill failed」，并在技能目录里留下一个删不掉的目录。**

现象来自真实界面：安装 `ppt-generator-skill` 时底部提示只有一句话，没有任何可用信息；而 `~/.dsh/skills` 里多了一个 `.skills-market-hub-install-*`，用 `rd`、`rm`、`chmod` 都删不掉（全部 `EPERM`）。

排查把三件事分开了，它们各自都是缺陷：

**一、`EPERM` 被当成了通用磁盘错误。** 原子发布是一句 `rename`。Windows 上，杀毒、索引器、云同步工具可以在目录刚创建时短暂持有句柄，`rename` 因此返回 `EPERM` —— 这个错误码的名字极具误导性，它不是权限问题，而是"现在不行，等一下可以"。旧的分类表里只有 `ENOTEMPTY`/`EEXIST`/`ENOTDIR`，所以这个最常见的失败原因落进了兜底分支。实测确认了平台差异：

```
rename 到已存在的非空目录：POSIX → ENOTEMPTY，Windows → EPERM
```

**二、这个失败根本没有重试。** 一句 `EPERM` 就放弃整个安装，而同样的调用在几十毫秒后就会成功。现在有界重试（6 次，递增退避）。

**三、清理失败被吞掉了，这才是目录留下的原因。** 发布失败后 `finally` 里的清理是 `rm(...).catch(() => undefined)` —— 而当时句柄还握着，`rm` 也会 `EPERM`。失败被静默丢弃，于是技能目录里多了一个没人能解释的目录。现在清理失败会上报，插件启动时也会重试清扫（持有句柄的进程退出后就能删掉，而重启桌面端正是这个时机）。

错误信息也随之改写。原来只有一句 `publishing the skill failed`，现在带上操作系统自己的说法、重试次数、以及要手工删除的目录名：

```
the operating system refused to publish the skill after 6 attempts
(EPERM: operation not permitted, rename '…'); a scanner, indexer, or sync tool
may be holding the directory — retry, and remove .skills-market-hub-install-oGQv8V by hand if it stays behind
```

另外修掉的：**目标被占用时报错不准**。`assertInstallTargetFree` 用 `catch {}` 吞掉 `lstat` 的**所有**错误并一律当作"目标不存在" —— 包括 `EPERM`。现在区分 `ENOENT`（真的不存在）与其他错误（目录不可读，这不是"空闲"）。

### 关于测试

这一轮有一个测试设计问题值得记录。覆盖这些失败需要一个 `EPERM`，而它是竞态，无法按需制造。第一版测试改的是全局 `node:fs/promises`：

```
TypeError: Cannot assign to read only property 'rename' of object '[object Module]'
```

ES 模块命名空间是只读的，绕过它等于在测加载器而不是被测代码。改成显式接缝：`InstallOptions.fs` 收下发布路径真正用到的那三个调用（`rename` / `rm` / `exists`）。生产路径不传，走真实实现；测试传假的。这也顺带把"这段代码到底依赖文件系统的什么"写清楚了。

新增 9 条测试：重试后成功、占用与磁盘错误的分流、被吞掉的清理现在被上报、遗留目录被下一次安装清掉、清扫不碰真实技能、以及一个不存在的技能根不算失败。

## 0.1.3

**新增：技能的分类标签，以及让两个筛选下拉说明自己在筛什么。**

界面上反馈的两个问题：分类标签"还没落实"，以及筛选栏右侧两个下拉只有「全部」，看不出在筛哪个维度。

### 分类标签

数据其实一直都在，只是没被读出来：

- **SkillHub**：每个技能都带 `category`（顶层分类 key）和 `subCategories`（发布者选的细分项，含 `{key, name}`），而列表接口的 `tags` 是 `null`。0.1.2 之前只读 `tags`，所以**每一个** SkillHub 卡片的标签位都是空的。
- **ClawHub**：分类在 `native.skill.categories`（`string[]`），列表形态**根本不带**这个字段，只有搜索与详情有。

而且只有 key 是不够的 —— key 是 `design-media` 这样的机器标识。人读的名字在**另一个接口** `/api/v1/categories` 上（13 项，每项同时给出中文 `name` 与英文 `nameEn`）。所以这一版新增 `src/market/taxonomy.ts`：一次取回词汇表、缓存一小时、供所有卡片共用，`ensureCategoryVocabulary` 在 provider 之前 await，provider 之后同步读取。

两处细节值得单独说：

- **中英标签分开存，而不是取回时就选一个。** 上游读数是跨语言缓存的，如果 payload 里只留一个语言的名字，缓存就会被"第一个发问的人"锁死。词汇表是全站共用的，两个拼写一起带上只多几百字节。客户端按 `ctx.locale` 的当前语言选，切换语言时 chips 跟着变（`src/client/locale-store.ts` 订阅宿主的 locale 快照）。
- **解析不出来时不猜。** 词汇表没读到、或 key 未发布，客户端按 zh → en → key（`business-ops` → `Business Ops`）逐级降级，**永远退到 key 而不是退到空白**。key 同时挂在 chip 的 tooltip 上，因为那才是将来做分类筛选、以及提问时要用的稳定标识。

卡片最多显示 2 个分类，其余折叠成 `+N`，hover 展开名字 —— 卡片的首要任务是可扫读。详情页带「分类 / 标签」两个标题，因为在那里"哪个是分类、哪个是发布者关键词"是个合理的问题。

### 两个下拉的提示

筛选栏右侧那两个下拉都写着「全部」，读者无从知道分别在筛什么。改了两处：

- 选项名自述维度：`全部安全等级` / `全部安装状态`（英文 `Any verdict` / `Any state`），与旁边的 `全部来源` 一致。
- `SelectField` 新增 `ariaDescription`，同时作为 `title` 提示与无障碍描述，写清筛选依据（例如"按上游注册表给出的安全结论筛选；「未知」表示注册表没有发布扫描结果"）。

### 顺手修掉的

- `/categories` 端点从 0.1.0 起就存在，但**恒定返回空数组**（"等策展目录随包发布"）。现在返回真实词汇表。
- 两个脆弱断言。重新抓取夹具时暴露出来：一个把下载数写死成 `50487`（上游随时会变），另一个断言 SkillHub 列表的 `tags`"恒为 null" —— 新抓的页面里它是有值的数组。夹具是照片，那条断言读的是天气。

**live 测试抓到一个真实缺陷，值得记录。** `ensureCategoryVocabulary` 第一版请求的是 `/api/categories`。单元测试全绿（它们手工填充词汇表，不走网络），live 测试直接失败：那个拼写返回 **405 空响应**，与"注册表没有发布分类"无法区分 —— 也就是说，猜错路径不会报错，只会静默降级。已改为 `/api/v1/categories`，并补了一条离线测试：把 skillhub 基址指向本地 HTTP 服务器，断言请求路径与解析结果，让这类错误不必联网就能抓到。

## 0.1.2

**新增：插件会报告自己加载的是哪个构建。**

`file:` 依赖在 profile 里是**拷贝而不是软链**，所以改完源码重新构建后，profile 里仍然是旧版本 —— 而插件"看起来装好了"。0.1.1 的修复就因此没能到达 GUI：错误信息是已经修好的那条，指向任何地方都不是构建本身。

现在激活时会记录版本号：

```
skills-market-hub: ready (v0.1.2, root=…, install=…, uninstall=on, cache=60m)
```

并且当加载的构建与它旁边 `package.json` 的版本不一致时，追加一条警告，写明两个版本号与刷新命令。

检测刻意做得很窄：**只**比对版本号。它无法发现"行为变了但版本号没变"的重建，也不假装能 —— 一个永远正确的窄信号，好过一个偶尔误报的宽信号。具体实现上：

- 向上搜索清单并要求 **`name` 匹配**。固定层数的 `..` 对 `lib/index.js` 正确、对 `lib/market/cache.js` 错误；而不校验名字的话，一个缺失清单的包会被拿去和**宿主项目**的 `package.json` 比较，在正常开发布局下必然误报。
- 清单缺失、损坏、或没有可用版本号时一律**不告警**。那不是过期构建的证据。

同目录的 `scripts/probe-stale-build.mjs` 会把 `lib/` 拷成真实安装形态，验证健康时静默、清单被改到超前时告警。

**放弃的做法，记录在案：** 先用 `postinstall` 钩子自动重建，**已撤回**。pnpm 11+ 默认拦截依赖的 install 脚本，于是连 `pnpm install` 本身都失败（`ERR_PNPM_IGNORED_BUILDS`）—— 为了省一步手工操作而弄坏主要安装流程。现在选择"发现并说清楚"，而不是"自动修"。

## 0.1.1

**修复：SkillHub 的技能全部无法安装。**

面板对每一个 SkillHub 技能都报「the registry resolved a different author for this skill」，安装按钮实际不可用。

原因是把只有 ClawHub 才成立的概念当成了两个注册表通用的：

- **ClawHub** 把同一个 slug 发布在多个作者名下。`?owner=` 是在选择**具体哪一个**技能，所以解析出的作者与卡片不符时拒绝安装是对的 —— 那确实是另一个技能。
- **SkillHub** 的详情路由本身已经确定了账户（`/api/v1/skills/{slug}`），并且**完全不解释** `owner` 参数。它的列表用的是 `namespace.handle`，详情返回的是 `owner.handle`，这是**同一个账户的两个不同字段**。把两者对比，必然把本来可装的技能拒掉。

抽查 24 个 SkillHub 技能，**17 个**的两个 handle 不一致 —— 所以这不是边缘情况，而是普遍失败。

修法是给 provider 加一个 `pinsOwner` 能力声明，只在注册表真的把 `owner` 当 pin 解析时才做一致性校验；同时不再把无效的 `owner` 透传给不解释它的注册表。拒绝时的报错也补上了两个 handle 的具体值，读者能看出自己面对的到底是谁。

新增 `tests/owner-pin.test.mjs`：两个方向都断言。只删掉校验会让 SkillHub 测试通过、同时悄悄重新打开 ClawHub 的洞。

**修复：ClawHub 的 404 不再被当成「技能不存在」以外的语义。**

`rejectionFor` 之前把 404 与「上游响应格式不对」归为同一个错误码，现在仍然如此，但错误信息带上了具体状态码与技能标识。

**清理：`dsh-client-ui-primitives` 从 `peerDependencies` 移除。**

0.1.0 收窄客户端依赖面时改掉了 `dsh.client.inject` 与 import，却漏了这个 manifest 条目。校验脚本新增了一条断言（`DECLARED_PEERS`），让 manifest 与代码再次漂移时会失败。

**验证补充：**

- `tests/live-providers.test.mjs` 的安装用例现在**特意挑选两个 handle 不一致的 SkillHub 技能**，并按面板的方式传入卡片上的作者 —— 0.1.0 的用例因为没传 `owner`，恰好绕过了出错的代码路径，所以没能在发布前发现这个问题。
- 该用例同时记录了一条已核实的上游行为：SkillHub 的 `page/pageSize` 偏移分页在页边界会重叠一项（直接请求原始接口同样如此）。这无法在游标层消除，由客户端按 id 去重；live 断言改为检查「游标确实在前进」。
- `scripts/verify.mjs` 从 12 项增至 14 项。

## 0.1.0

首个版本。ClawHub 与 SkillHub 双源浏览、搜索、安装前预览、确认后安装、本机技能管理与卸载。

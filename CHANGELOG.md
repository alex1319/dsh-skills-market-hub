# 更新说明

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

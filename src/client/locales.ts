/**
 * Skills Market dictionaries.
 *
 * `zh` is the key-set baseline; `en` is typed against it, so a key added here
 * cannot be forgotten there (the host's typed `register` overload enforces the
 * same balance when the plugin is loaded).
 *
 * The namespace is declared through module augmentation rather than restated as a
 * bare string: that is what puts the typed key domain on `ctx.locale.bind` and on
 * the framework-injected `t` seat, so a typo in a component surfaces at compile
 * time instead of as a raw key in the UI.
 */

import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'

/** Dictionary namespace owned by this plugin. */
export const NS = 'skillsMarketHub'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Skills Market panel and detail copy. */
    'skillsMarketHub': keyof typeof zh
  }
}

export const zh = {
  panel: '技能市场',
  title: '技能市场',
  subtitle: '浏览并安装 ClawHub 与 SkillHub 上的第三方技能',

  tabMarket: '市场',
  tabInstalled: '已安装',

  search: '搜索技能…',
  refresh: '刷新',
  loading: '加载中…',
  retry: '重试',
  empty: '没有找到匹配的技能',
  emptyHint: '换个关键词，或清空筛选条件试试。',
  clearFilters: '清空筛选',
  errorTitle: '加载失败',

  filterSource: '来源',
  filterSecurity: '安全',
  filterInstalled: '安装状态',
  sourceAll: '全部来源',
  securityAll: '全部安全等级',
  securityVerified: '已核验',
  securityBenign: '未见异常',
  securityUnknown: '未知',
  securityFlagged: '有风险',
  installedAll: '全部安装状态',
  installedOnly: '已安装',
  installedInstallable: '未安装',
  filterSourceHint: '只看某一个注册表：ClawHub 或 SkillHub。',
  filterSecurityHint: '按上游注册表给出的安全结论筛选；「未知」表示注册表没有发布扫描结果。',
  filterInstalledHint: '按本机是否已经装了它来筛选。',

  install: '安装',
  installing: '安装中…',
  installed: '已安装',
  notInstallable: '不可安装',
  uninstall: '卸载',
  uninstalling: '卸载中…',
  uninstallDisabled: '当前配置禁止卸载',
  cancel: '取消',
  confirm: '确认',
  close: '关闭',
  back: '返回',

  installTitle: '安装技能',
  installConfirm: '确认安装',
  uninstallTitle: '卸载技能',
  uninstallConfirm: '确认卸载',
  installSource: '来源',
  installSecurity: '安全结论',
  installPath: '安装位置',
  installRequiresKeyHint: '该技能运行需要自备 API Key',
  installAcknowledge: '我了解这是第三方技能，其内容会进入模型上下文，且我会自行判断是否遵循其中的指令。',
  installHint: '安装只会把文件写入技能目录，不会执行技能里的任何脚本。',

  installedTitle: '已安装技能',
  installedSearch: '搜索本机技能…',
  installedManaged: '市场安装',
  installedLocal: '本地',
  installedLinked: '链接',
  installedDocument: '文档',
  installedHeader: '元数据',
  installedEmpty: '本机还没有安装任何技能。',
  installedEmptyHint: '到「市场」里挑一个装进来，或手动放到技能目录。',
  uninstallHint: '卸载会删除这个技能的目录，且不可撤销。',

  detailOverview: '概览',
  detailFiles: '文件',
  detailSecurity: '安全',
  detailChangelog: '更新日志',
  detailAbout: '技能说明',
  detailCategories: '分类',
  detailTags: '标签',
  detailVersion: '版本',
  detailDownloads: '下载',
  detailUpdated: '更新',
  detailFileEmpty: '这个技能没有可预览的文件',
  detailFileTooBig: '文件超过预览体积上限',
  detailFileTruncated: '内容已截断',
  detailPage: '在市场中查看',
  detailRequiresKey: '需要 API Key',
  detailNoDescription: '该技能没有提供说明正文',
  detailNoDescriptionHint: '可以到「文件」里直接查看它的 SKILL.md。',

  securityReport: '查看报告',
  securityCaveat: '结论来自上游注册表，本插件不代为背书。',
} as const

export const en: Record<keyof typeof zh, string> = {
  panel: 'Skills Market',
  title: 'Skills Market',
  subtitle: 'Browse and install third-party skills from ClawHub and SkillHub',

  tabMarket: 'Market',
  tabInstalled: 'Installed',

  search: 'Search skills…',
  refresh: 'Refresh',
  loading: 'Loading…',
  retry: 'Retry',
  empty: 'No matching skills',
  emptyHint: 'Try another keyword, or clear the filters.',
  clearFilters: 'Clear filters',
  errorTitle: 'Failed to load',

  filterSource: 'Source',
  filterSecurity: 'Security',
  filterInstalled: 'Install state',
  sourceAll: 'All sources',
  securityAll: 'Any verdict',
  securityVerified: 'Verified',
  securityBenign: 'No findings',
  securityUnknown: 'Unknown',
  securityFlagged: 'Flagged',
  installedAll: 'Any state',
  installedOnly: 'Installed',
  installedInstallable: 'Not installed',
  filterSourceHint: 'Show one registry only: ClawHub or SkillHub.',
  filterSecurityHint: 'Filter by the verdict the upstream registry published; "Unknown" means it published no scan.',
  filterInstalledHint: 'Filter by whether this machine already has the skill.',

  install: 'Install',
  installing: 'Installing…',
  installed: 'Installed',
  notInstallable: 'Not installable',
  uninstall: 'Uninstall',
  uninstalling: 'Uninstalling…',
  uninstallDisabled: 'Removal is disabled by configuration',
  cancel: 'Cancel',
  confirm: 'Confirm',
  close: 'Close',
  back: 'Back',

  installTitle: 'Install skill',
  installConfirm: 'Install',
  uninstallTitle: 'Uninstall skill',
  uninstallConfirm: 'Uninstall',
  installSource: 'Source',
  installSecurity: 'Security verdict',
  installPath: 'Install location',
  installRequiresKeyHint: 'This skill needs its own API key to run',
  installAcknowledge: 'I understand this is a third-party skill, that its content enters the model context, and that following its instructions is my own decision.',
  installHint: 'Installing only writes files into the skills directory; it never runs scripts from the skill.',

  installedTitle: 'Installed skills',
  installedSearch: 'Search local skills…',
  installedManaged: 'From market',
  installedLocal: 'Local',
  installedLinked: 'Linked',
  installedDocument: 'Document',
  installedHeader: 'Metadata',
  installedEmpty: 'No skills are installed on this machine yet.',
  installedEmptyHint: 'Install one from the Market tab, or drop one into the skills directory.',
  uninstallHint: 'Uninstalling deletes this skill directory and cannot be undone.',

  detailOverview: 'Overview',
  detailFiles: 'Files',
  detailSecurity: 'Security',
  detailChangelog: 'Changelog',
  detailAbout: 'About this skill',
  detailCategories: 'Categories',
  detailTags: 'Tags',
  detailVersion: 'Version',
  detailDownloads: 'Downloads',
  detailUpdated: 'Updated',
  detailFileEmpty: 'This skill has no previewable files',
  detailFileTooBig: 'This file is over the preview size limit',
  detailFileTruncated: 'Content truncated',
  detailPage: 'View in market',
  detailRequiresKey: 'Requires an API key',
  detailNoDescription: 'This skill publishes no description body',
  detailNoDescriptionHint: 'Open the Files tab to read its SKILL.md directly.',

  securityReport: 'View report',
  securityCaveat: 'Verdicts come from the upstream registry; this plugin does not endorse them.',
}

/** Bound translate function of this plugin's namespace. */
export type MarketTranslate = Translate<keyof typeof zh>

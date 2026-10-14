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
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
/** Dictionary namespace owned by this plugin. */
export declare const NS = "skillsMarketHub";
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Skills Market panel and detail copy. */
        'skillsMarketHub': keyof typeof zh;
    }
}
export declare const zh: {
    readonly panel: "技能市场";
    readonly title: "技能市场";
    readonly subtitle: "浏览并安装 ClawHub 与 SkillHub 上的第三方技能";
    readonly tabMarket: "市场";
    readonly tabInstalled: "已安装";
    readonly search: "搜索技能…";
    readonly refresh: "刷新";
    readonly loading: "加载中…";
    readonly retry: "重试";
    readonly empty: "没有找到匹配的技能";
    readonly emptyHint: "换个关键词，或清空筛选条件试试。";
    readonly clearFilters: "清空筛选";
    readonly errorTitle: "加载失败";
    readonly filterSource: "来源";
    readonly filterSecurity: "安全";
    readonly filterInstalled: "安装状态";
    readonly sourceAll: "全部来源";
    readonly securityAll: "全部";
    readonly securityVerified: "已核验";
    readonly securityBenign: "未见异常";
    readonly securityUnknown: "未知";
    readonly securityFlagged: "有风险";
    readonly installedAll: "全部";
    readonly installedOnly: "已安装";
    readonly installedInstallable: "未安装";
    readonly install: "安装";
    readonly installing: "安装中…";
    readonly installed: "已安装";
    readonly notInstallable: "不可安装";
    readonly uninstall: "卸载";
    readonly uninstalling: "卸载中…";
    readonly uninstallDisabled: "当前配置禁止卸载";
    readonly cancel: "取消";
    readonly confirm: "确认";
    readonly close: "关闭";
    readonly back: "返回";
    readonly installTitle: "安装技能";
    readonly installConfirm: "确认安装";
    readonly uninstallTitle: "卸载技能";
    readonly uninstallConfirm: "确认卸载";
    readonly installSource: "来源";
    readonly installSecurity: "安全结论";
    readonly installPath: "安装位置";
    readonly installRequiresKeyHint: "该技能运行需要自备 API Key";
    readonly installAcknowledge: "我了解这是第三方技能，其内容会进入模型上下文，且我会自行判断是否遵循其中的指令。";
    readonly installHint: "安装只会把文件写入技能目录，不会执行技能里的任何脚本。";
    readonly installedTitle: "已安装技能";
    readonly installedSearch: "搜索本机技能…";
    readonly installedManaged: "市场安装";
    readonly installedLocal: "本地";
    readonly installedLinked: "链接";
    readonly installedDocument: "文档";
    readonly installedHeader: "元数据";
    readonly installedEmpty: "本机还没有安装任何技能。";
    readonly installedEmptyHint: "到「市场」里挑一个装进来，或手动放到技能目录。";
    readonly uninstallHint: "卸载会删除这个技能的目录，且不可撤销。";
    readonly detailOverview: "概览";
    readonly detailFiles: "文件";
    readonly detailSecurity: "安全";
    readonly detailChangelog: "更新日志";
    readonly detailAbout: "技能说明";
    readonly detailVersion: "版本";
    readonly detailDownloads: "下载";
    readonly detailUpdated: "更新";
    readonly detailFileEmpty: "这个技能没有可预览的文件";
    readonly detailFileTooBig: "文件超过预览体积上限";
    readonly detailFileTruncated: "内容已截断";
    readonly detailPage: "在市场中查看";
    readonly detailRequiresKey: "需要 API Key";
    readonly detailNoDescription: "该技能没有提供说明正文";
    readonly detailNoDescriptionHint: "可以到「文件」里直接查看它的 SKILL.md。";
    readonly securityReport: "查看报告";
    readonly securityCaveat: "结论来自上游注册表，本插件不代为背书。";
};
export declare const en: Record<keyof typeof zh, string>;
/** Bound translate function of this plugin's namespace. */
export type MarketTranslate = Translate<keyof typeof zh>;
//# sourceMappingURL=locales.d.ts.map
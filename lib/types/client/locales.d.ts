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
    readonly tabDiscover: "发现";
    readonly tabMarket: "市场";
    readonly tabInstalled: "已安装";
    readonly discoverTitle: "发现";
    readonly discoverFeatured: "精选";
    readonly discoverTrending: "热门";
    readonly discoverOfficial: "官方";
    readonly discoverNewest: "新发布";
    readonly discoverInstalls: "装机最多";
    readonly discoverFeaturedHint: "三个维度里进两个才上榜";
    readonly discoverFeaturedRule: "在「下载」「安装」「收藏」三个排序里都排进前列的技能：每进一次前 20 名得一票，两票才上榜，先按票数、再按最好名次排。所以它是「被取走、被用起来、被留下来」都成立的那一批 —— 这是对注册表已公布数字的汇总，不是编辑挑选。";
    readonly discoverTrendingHint: "各注册表自己的热度榜，两边交替";
    readonly discoverTrendingRule: "ClawHub 用它发布的 trending 索引；SkillHub 的列表接口没有排序参数，因此按安装量排列。两个注册表的结果交替展示，谁也不排在谁后面。";
    readonly discoverOfficialHint: "注册表自己标记为「已认证」";
    readonly discoverOfficialRule: "来源是注册表自己的认证标记。两个注册表都极少给出它 —— SkillHub 首页约百中有一，ClawHub 只在搜索接口声明、列表接口完全不返回，也没有端点能枚举官方发布者。所以这一栏常常很短甚至为空，这是注册表的事实，不用近似条目凑数。";
    readonly discoverNewestHint: "各注册表最新发布，两边交替";
    readonly discoverNewestRule: "ClawHub 用它发布的 newest 索引；SkillHub 按最后更新时间排列。两个注册表的结果交替展示。";
    readonly discoverInstallsHint: "按注册表公布的安装量";
    readonly discoverInstallsRule: "下载量记录「取走副本的人」，安装量记录「真的把它用起来的人」—— 后者是唯一一个两个注册表都发布、又能横跨两边比较的流量指标。";
    readonly discoverColumnSkill: "技能";
    readonly discoverColumnDownloads: "下载量";
    readonly discoverColumnInstalls: "安装量";
    readonly discoverColumnStars: "收藏";
    readonly discoverColumnUpdated: "更新于";
    readonly discoverVerified: "已认证";
    readonly discoverLoading: "正在从两个注册表读取榜单…";
    readonly discoverFindMore: "到市场里查找更多";
    readonly discoverShelfEmpty: "这一栏暂时是空的";
    readonly discoverEmpty: "暂时没有可推荐的内容";
    readonly discoverEmptyHint: "注册表没有返回任何条目，可以点上面的「刷新」重试，或直接到「市场」里浏览。";
    readonly discoverDegraded: "上游未正常响应：";
    readonly discoverDegradedHint: "该注册表这次没有正常返回，所以这里的结果可能比平时少。";
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
    readonly securityAll: "全部安全等级";
    readonly securityVerified: "已核验";
    readonly securityBenign: "未见异常";
    readonly securityUnknown: "未知";
    readonly securityFlagged: "有风险";
    readonly installedAll: "全部安装状态";
    readonly installedOnly: "已安装";
    readonly installedInstallable: "未安装";
    readonly filterSourceHint: "只看某一个注册表：ClawHub 或 SkillHub。";
    readonly filterSecurityHint: "按上游注册表给出的安全结论筛选；「未知」表示注册表没有发布扫描结果。";
    readonly filterInstalledHint: "按本机是否已经装了它来筛选。";
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
    readonly installedFilterSource: "按来源筛选";
    readonly installedSourceAll: "全部来源";
    readonly installedSourceLocal: "本地";
    readonly installedFilterSourceHint: "来源取自安装时写入的溯源文件；手动放入的技能归为「本地」。";
    readonly detailOverview: "概览";
    readonly detailFiles: "文件";
    readonly detailSecurity: "安全";
    readonly detailChangelog: "更新日志";
    readonly detailAbout: "技能说明";
    readonly detailCategories: "分类";
    readonly detailTags: "标签";
    readonly detailVersion: "版本";
    readonly detailDownloads: "下载";
    readonly detailStars: "收藏";
    readonly detailInstalls: "安装";
    readonly detailDownloadsHint: "上游注册表记录的下载次数。";
    readonly detailStarsHint: "上游注册表记录的收藏（star）数；SkillHub 上多数技能为 0，那是注册表本身的数据。";
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
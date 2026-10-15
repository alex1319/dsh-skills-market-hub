window.__ModuleLoader__.load({ id: "dsh-skills-market-hub", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lib/client/index.js
var index_exports = {};
__export(index_exports, {
  PANEL_ID: () => PANEL_ID,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// lib/client/page/MarketPage.js
var import_jsx_runtime9 = require("react/jsx-runtime");
var import_react9 = require("react");

// lib/client/translate.js
var import_jsx_runtime = require("react/jsx-runtime");
var import_react2 = require("react");

// lib/client/locale-store.js
var import_react = require("react");
var face = null;
var active = "zh";
var listeners = /* @__PURE__ */ new Set();
function installMarketLocale(next) {
  face = next !== void 0 && typeof next.subscribe === "function" ? next : null;
  active = read(face);
  if (face !== null) {
    const attached = face;
    attached.subscribe(() => {
      const value = read(attached);
      if (value === active)
        return;
      active = value;
      for (const listener of [...listeners])
        listener();
    });
  }
}
function resetMarketLocale() {
  face = null;
  listeners.clear();
}
function read(source) {
  try {
    return source?.getLocale().active ?? "zh";
  } catch {
    return "zh";
  }
}
function marketLocale() {
  return /^en\b|^en-/i.test(active) ? "en" : "zh";
}
function subscribe(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function useMarketLocale() {
  return (0, import_react.useSyncExternalStore)(subscribe, marketLocale, marketLocale);
}

// lib/client/translate.js
var TranslateContext = (0, import_react2.createContext)(null);
function TranslateProvider({ t, locale, children }) {
  return (0, import_jsx_runtime.jsx)(TranslateContext.Provider, { value: { t, locale }, children });
}
function useT() {
  const seat = (0, import_react2.useContext)(TranslateContext);
  if (seat === null) {
    throw new Error("useT() was called outside a TranslateProvider; the panel root must supply the locale seat it was registered with");
  }
  return seat.t;
}
function useLocale() {
  return (0, import_react2.useContext)(TranslateContext)?.locale ?? marketLocale();
}

// lib/client/ui.js
var import_jsx_runtime2 = require("react/jsx-runtime");
var import_react3 = require("react");
var token = {
  bgBase: "var(--dsw-alias-bg-base)",
  bgLayer1: "var(--dsw-alias-bg-layer-1)",
  bgLayer2: "var(--dsw-alias-bg-layer-2)",
  bgOverlay: "var(--dsw-alias-bg-overlay)",
  borderL1: "var(--dsw-alias-border-l1)",
  borderL2: "var(--dsw-alias-border-l2)",
  /**
   * The placeholder wash, and it is its own token for a reason.
   *
   * `bgLayer1`/`bgLayer2` are the *surface* colours, and in the light theme both
   * resolve to pure white — a placeholder painted with them is white on white, which
   * is to say invisible. That is what this panel's loading skeletons were until it
   * was rendered and looked at. `bg-skeleton` is the theme's own answer to exactly
   * this question and reads correctly in both themes.
   */
  skeleton: "var(--dsw-alias-bg-skeleton)",
  labelPrimary: "var(--dsw-alias-label-primary)",
  labelSecondary: "var(--dsw-alias-label-secondary)",
  brand: "var(--dsw-alias-brand-primary)",
  success: "var(--dsw-alias-state-success-primary)",
  warn: "var(--dsw-alias-state-warn-primary)",
  error: "var(--dsw-alias-state-error-primary)",
  idle: "var(--dsw-alias-state-idle-primary)",
  mono: "var(--dsw-font-mono)"
};
var radius = { xs: 4, sm: 6, md: 8, lg: 14 };
var SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
var shellStyle = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
  background: token.bgBase,
  color: token.labelPrimary,
  fontSize: 13,
  lineHeight: 1.5
};
var headerStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: SPACE.md,
  padding: `${SPACE.lg}px ${SPACE.xl}px ${SPACE.sm}px`
};
var titleStyle = { margin: 0, fontSize: 17, fontWeight: 600, lineHeight: 1.3 };
var subtitleStyle = { margin: 0, fontSize: 12, color: token.labelSecondary };
var bodyStyle = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  padding: `0 ${SPACE.xl}px ${SPACE.xl}px`
};
function surfaceStyle(overrides = {}) {
  return {
    border: `1px solid ${token.borderL1}`,
    borderRadius: radius.lg,
    background: token.bgLayer1,
    ...overrides
  };
}
function Button({ children, onClick, variant = "ghost", disabled = false, title, type = "button", style }) {
  const base = {
    font: "inherit",
    fontSize: 12,
    padding: "5px 12px",
    borderRadius: radius.md,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
    border: `1px solid ${token.borderL2}`,
    background: "transparent",
    color: token.labelPrimary
  };
  const primary = {
    ...base,
    background: token.brand,
    borderColor: "transparent",
    color: token.bgBase,
    fontWeight: 600
  };
  return (0, import_jsx_runtime2.jsx)("button", { type, onClick, disabled, title, style: { ...variant === "primary" ? primary : base, ...style }, children });
}
function TextField({ value, onChange, placeholder, onEnter, ariaLabel, style }) {
  return (0, import_jsx_runtime2.jsx)("input", { type: "search", value, "aria-label": ariaLabel, placeholder, onChange: (event) => {
    onChange(event.currentTarget.value);
  }, onKeyDown: (event) => {
    if (event.key === "Enter" && onEnter !== void 0) {
      event.preventDefault();
      onEnter();
    }
  }, style: {
    font: "inherit",
    fontSize: 13,
    width: "100%",
    padding: "7px 10px",
    borderRadius: radius.md,
    border: `1px solid ${token.borderL2}`,
    background: token.bgLayer1,
    color: token.labelPrimary,
    boxSizing: "border-box",
    ...style
  } });
}
function SelectField({ value, options, onChange, ariaLabel, ariaDescription }) {
  return (0, import_jsx_runtime2.jsx)("select", { value, "aria-label": ariaLabel, "aria-description": ariaDescription, title: ariaDescription, onChange: (event) => {
    onChange(event.currentTarget.value);
  }, style: {
    font: "inherit",
    fontSize: 12,
    padding: "6px 8px",
    borderRadius: radius.md,
    border: `1px solid ${token.borderL2}`,
    background: token.bgLayer1,
    color: token.labelPrimary
  }, children: options.map((option) => (0, import_jsx_runtime2.jsx)("option", { value: option.value, children: option.label }, option.value)) });
}
function Pill({ children, tone = "neutral", title }) {
  const colours = {
    neutral: token.labelSecondary,
    muted: token.idle,
    ok: token.success,
    warn: token.warn,
    error: token.error,
    brand: token.brand
  };
  return (0, import_jsx_runtime2.jsx)("span", { title, style: {
    display: "inline-block",
    fontSize: 11,
    lineHeight: 1.6,
    padding: "0 7px",
    borderRadius: radius.sm,
    border: `1px solid ${colours[tone]}`,
    color: colours[tone],
    whiteSpace: "nowrap"
  }, children });
}
function Notice({ title, detail, action }) {
  return (0, import_jsx_runtime2.jsxs)("div", { style: surfaceStyle({ padding: `${SPACE.lg}px ${SPACE.lg + 2}px`, display: "flex", flexDirection: "column", gap: SPACE.sm, alignItems: "flex-start" }), children: [(0, import_jsx_runtime2.jsx)("p", { style: { margin: 0, fontSize: 13, fontWeight: 600 }, children: title }), detail === void 0 ? null : (0, import_jsx_runtime2.jsx)("p", { style: { margin: 0, fontSize: 12, color: token.labelSecondary }, children: detail }), action] });
}
function Skeleton({ height = 74, count = 6 }) {
  (0, import_react3.useEffect)(ensureSkeletonStyle, []);
  return (0, import_jsx_runtime2.jsx)("div", { style: { display: "grid", gap: SPACE.md, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }, "aria-hidden": "true", children: Array.from({ length: count }, (_, index) => (0, import_jsx_runtime2.jsx)("div", { style: surfaceStyle({ height, background: token.skeleton }) }, index)) });
}
var SKELETON_STYLE_ID = "skills-market-hub-skeleton";
function ensureSkeletonStyle() {
  if (typeof document === "undefined")
    return;
  if (document.getElementById(SKELETON_STYLE_ID) !== null)
    return;
  const style = document.createElement("style");
  style.id = SKELETON_STYLE_ID;
  style.textContent = "@keyframes smh-pulse{0%,100%{opacity:.45}50%{opacity:.8}}@keyframes smh-slide{0%{transform:translateX(-100%)}100%{transform:translateX(340%)}}@media (prefers-reduced-motion: reduce){.smh-slide{animation:none!important;width:100%!important;opacity:.3}}";
  document.head.appendChild(style);
}
function LoadingLine({ label }) {
  (0, import_react3.useEffect)(ensureSkeletonStyle, []);
  return (0, import_jsx_runtime2.jsxs)("div", { role: "status", "aria-live": "polite", style: { display: "flex", flexDirection: "column", gap: SPACE.sm }, children: [(0, import_jsx_runtime2.jsx)("span", { style: { fontSize: 12, color: token.labelSecondary }, children: label }), (0, import_jsx_runtime2.jsx)("span", { "aria-hidden": "true", style: { display: "block", height: 2, borderRadius: 2, background: token.skeleton, overflow: "hidden" }, children: (0, import_jsx_runtime2.jsx)("span", { className: "smh-slide", style: {
    display: "block",
    height: "100%",
    width: "30%",
    background: token.brand,
    animation: "smh-slide 1.1s ease-in-out infinite"
  } }) })] });
}
function SourceBlock({ text, wrap = false }) {
  return (0, import_jsx_runtime2.jsx)("pre", { style: {
    margin: 0,
    padding: SPACE.md,
    borderRadius: radius.md,
    border: `1px solid ${token.borderL1}`,
    background: token.bgLayer2,
    fontFamily: token.mono,
    fontSize: 11.5,
    lineHeight: 1.6,
    overflowX: wrap ? "hidden" : "auto",
    whiteSpace: wrap ? "pre-wrap" : "pre",
    wordBreak: wrap ? "break-word" : "normal",
    maxHeight: 460,
    overflowY: "auto"
  }, children: text });
}
function fileSizeText(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0)
    return "\u2014";
  if (bytes < 1024)
    return `${bytes} B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function shortDate(at) {
  if (at === void 0 || !Number.isFinite(at) || at <= 0)
    return void 0;
  return new Date(at).toLocaleDateString();
}
function countText(value) {
  if (!Number.isFinite(value) || value < 0)
    return "\u2014";
  if (value < 1e3)
    return String(value);
  if (value < 1e6)
    return `${(value / 1e3).toFixed(value < 1e4 ? 1 : 0)}k`;
  return `${(value / 1e6).toFixed(1)}M`;
}
function categoryLabelText(ref, locale) {
  const preferred = locale === "en" ? ref.labelEn : ref.labelZh;
  const other = locale === "en" ? ref.labelZh : ref.labelEn;
  const chosen = preferred ?? other;
  if (chosen !== void 0 && chosen.trim() !== "")
    return chosen;
  return humanizeKey(ref.key);
}
function humanizeKey(key) {
  const spaced = key.replace(/[-_]+/g, " ").trim();
  if (spaced === "")
    return key;
  return spaced.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

// lib/client/components/MarketList.js
var import_jsx_runtime4 = require("react/jsx-runtime");
var import_react5 = require("react");

// lib/client/components/SkillCard.js
var import_jsx_runtime3 = require("react/jsx-runtime");
var import_react4 = require("react");
var CARD_CATEGORY_LIMIT = 2;
function securityTone(status) {
  if (status === "verified" || status === "benign")
    return "ok";
  if (status === "flagged")
    return "error";
  return "muted";
}
function securityLabelKey(status) {
  if (status === "verified")
    return "securityVerified";
  if (status === "benign")
    return "securityBenign";
  if (status === "flagged")
    return "securityFlagged";
  return "securityUnknown";
}
function SkillCard({ skill, busy, onOpen, onInstall }) {
  const t = useT();
  const locale = useLocale();
  const installed = skill.installState === "installed";
  const blocked = skill.installState === "not-installable";
  const categories = skill.categories ?? [];
  const shown = categories.slice(0, CARD_CATEGORY_LIMIT);
  const hidden = categories.slice(CARD_CATEGORY_LIMIT);
  return (0, import_jsx_runtime3.jsxs)("div", { style: surfaceStyle({ padding: SPACE.md, display: "flex", flexDirection: "column", gap: SPACE.sm }), children: [(0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "flex-start", gap: SPACE.sm }, children: [(0, import_jsx_runtime3.jsx)(SkillAvatar, { name: skill.name, iconUrl: skill.iconUrl }), (0, import_jsx_runtime3.jsxs)("div", { style: { minWidth: 0, flex: 1 }, children: [(0, import_jsx_runtime3.jsx)("button", { type: "button", onClick: onOpen, style: {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: 0,
    border: "none",
    background: "transparent",
    color: token.labelPrimary,
    font: "inherit",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  }, title: skill.name, children: skill.name }), (0, import_jsx_runtime3.jsxs)("div", { style: { fontSize: 11, color: token.labelSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: [skill.author.displayName ?? skill.author.handle, skill.version === void 0 ? "" : ` \xB7 v${skill.version}`] })] })] }), (0, import_jsx_runtime3.jsx)("p", { style: {
    margin: 0,
    fontSize: 12,
    color: token.labelSecondary,
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    minHeight: 54
  }, children: skill.summary }), (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", flexWrap: "wrap", gap: SPACE.xs, alignItems: "center" }, children: [shown.map((ref) => (0, import_jsx_runtime3.jsx)(CategoryPill, { category: ref }, ref.key)), hidden.length === 0 ? null : (
    // The overflow is named on hover rather than dropped: the key of every
    // classification is what a reader would search or report.
    (0, import_jsx_runtime3.jsxs)(Pill, { tone: "muted", title: hidden.map((ref) => categoryLabelText(ref, locale)).join(" / "), children: ["+", hidden.length] })
  ), (0, import_jsx_runtime3.jsx)(Pill, { tone: "brand", children: skill.source }), (0, import_jsx_runtime3.jsx)(Pill, { tone: securityTone(skill.securityStatus), title: t(securityLabelKey(skill.securityStatus)), children: t(securityLabelKey(skill.securityStatus)) }), skill.requiresApiKey === true ? (0, import_jsx_runtime3.jsx)(Pill, { tone: "warn", children: t("detailRequiresKey") }) : null, installed ? (0, import_jsx_runtime3.jsx)(Pill, { tone: "ok", children: t("installed") }) : null, (0, import_jsx_runtime3.jsxs)("span", { style: { marginLeft: "auto", display: "flex", gap: SPACE.sm, fontSize: 11, color: token.labelSecondary }, children: [(0, import_jsx_runtime3.jsxs)("span", { title: t("detailDownloadsHint"), children: [t("detailDownloads"), " ", countText(skill.stats.downloads)] }), (0, import_jsx_runtime3.jsxs)("span", { title: t("detailStarsHint"), children: [t("detailStars"), " ", countText(skill.stats.stars ?? 0)] })] })] }), (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", gap: SPACE.sm, alignItems: "center", marginTop: "auto" }, children: [(0, import_jsx_runtime3.jsx)(Button, { onClick: onOpen, style: { flex: 1 }, children: t("detailOverview") }), (0, import_jsx_runtime3.jsx)(Button, { variant: "primary", onClick: onInstall, disabled: busy || installed || blocked, title: blocked ? t("notInstallable") : void 0, style: { flex: 1 }, children: installed ? t("installed") : busy ? t("installing") : t("install") })] })] });
}
function CategoryPill({ category }) {
  const locale = useLocale();
  return (0, import_jsx_runtime3.jsx)(Pill, { tone: "neutral", title: category.key, children: categoryLabelText(category, locale) });
}
function SkillAvatar({ name: name2, iconUrl }) {
  const initials = name2.split(/\s+/).slice(0, 2).map((word) => word.slice(0, 1).toUpperCase()).join("") || "?";
  if (iconUrl !== void 0 && iconUrl !== "") {
    return (0, import_jsx_runtime3.jsx)("img", {
      src: iconUrl,
      alt: "",
      width: 30,
      height: 30,
      style: { width: 30, height: 30, borderRadius: radius.md, objectFit: "cover", flex: "none" },
      // A registry URL can rot; falling back to the monogram keeps the row legible.
      onError: (event) => {
        event.currentTarget.style.display = "none";
      }
    });
  }
  return (0, import_jsx_runtime3.jsx)("span", { "aria-hidden": "true", style: {
    width: 30,
    height: 30,
    flex: "none",
    borderRadius: radius.md,
    border: `1px solid ${token.borderL1}`,
    background: token.bgLayer2,
    color: token.labelSecondary,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 600
  }, children: initials });
}
function SkillGrid({ skills, installingIds, onOpen, onInstall }) {
  return (0, import_jsx_runtime3.jsx)("div", { style: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
    gap: SPACE.md,
    alignItems: "stretch"
  }, children: skills.map((skill) => (0, import_jsx_runtime3.jsx)(SkillCard, { skill, busy: installingIds.includes(skill.id), onOpen: () => {
    onOpen(skill);
  }, onInstall: () => {
    onInstall(skill);
  } }, skill.id)) });
}
function LoadMoreSentinel({ onReach, rootRef }) {
  const ref = (0, import_react4.useRef)(null);
  (0, import_react4.useEffect)(() => {
    const element = ref.current;
    if (element === null)
      return;
    if (typeof IntersectionObserver !== "function")
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting))
          onReach();
      },
      // Start one screen early so the next page is usually already there when the
      // reader arrives.
      { root: rootRef.current, rootMargin: "600px 0px" }
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [onReach, rootRef]);
  return (0, import_jsx_runtime3.jsx)("div", { ref, style: { height: 1 }, "aria-hidden": "true" });
}

// lib/client/components/MarketList.js
function MarketList(props) {
  const { state, scrollRoot } = props;
  const t = useT();
  const filtersActive = state.filters.q !== "" || state.filters.source !== "all" || state.filters.security !== "all" || state.filters.installed !== "all";
  const sourceOptions = (0, import_react5.useMemo)(() => [
    { value: "all", label: t("sourceAll") },
    { value: "clawhub", label: "ClawHub" },
    { value: "skillhub", label: "SkillHub" }
  ], [t]);
  const securityOptions = (0, import_react5.useMemo)(() => [
    { value: "all", label: t("securityAll") },
    { value: "verified", label: t("securityVerified") },
    { value: "benign", label: t("securityBenign") },
    { value: "unknown", label: t("securityUnknown") },
    { value: "flagged", label: t("securityFlagged") }
  ], [t]);
  const installedOptions = (0, import_react5.useMemo)(() => [
    { value: "all", label: t("installedAll") },
    { value: "installed", label: t("installedOnly") },
    { value: "installable", label: t("installedInstallable") }
  ], [t]);
  return (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: SPACE.md }, children: [(0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", gap: SPACE.sm, flexWrap: "wrap", alignItems: "center" }, children: [(0, import_jsx_runtime4.jsx)("div", { style: { flex: "1 1 240px", minWidth: 200 }, children: (0, import_jsx_runtime4.jsx)(TextField, { value: state.searchDraft, onChange: props.onSearchDraft, onEnter: props.onSubmitSearch, placeholder: t("search"), ariaLabel: t("search") }) }), (0, import_jsx_runtime4.jsx)(SelectField, { value: state.filters.source, options: sourceOptions, onChange: props.onSetSource, ariaLabel: t("filterSource"), ariaDescription: t("filterSourceHint") }), (0, import_jsx_runtime4.jsx)(SelectField, { value: state.filters.security, options: securityOptions, onChange: props.onSetSecurity, ariaLabel: t("filterSecurity"), ariaDescription: t("filterSecurityHint") }), (0, import_jsx_runtime4.jsx)(SelectField, { value: state.filters.installed, options: installedOptions, onChange: props.onSetInstalled, ariaLabel: t("filterInstalled"), ariaDescription: t("filterInstalledHint") }), filtersActive ? (0, import_jsx_runtime4.jsx)(Button, { onClick: props.onClearFilters, children: t("clearFilters") }) : null] }), state.error !== null && state.items.length === 0 ? (0, import_jsx_runtime4.jsx)(Notice, { title: t("errorTitle"), detail: state.error, action: (0, import_jsx_runtime4.jsx)(Button, { onClick: props.onRetry, children: t("retry") }) }) : null, state.loading && state.items.length === 0 ? (0, import_jsx_runtime4.jsx)(Skeleton, {}) : null, !state.loading && state.items.length === 0 && state.error === null ? (0, import_jsx_runtime4.jsx)(Notice, { title: t("empty"), detail: t("emptyHint") }) : null, state.items.length > 0 ? (0, import_jsx_runtime4.jsx)(SkillGrid, { skills: state.items, installingIds: state.installingIds, onOpen: props.onOpen, onInstall: props.onInstall }) : null, state.loadingMore ? (0, import_jsx_runtime4.jsx)("div", { style: { fontSize: 12, color: token.labelSecondary, textAlign: "center" }, children: t("loading") }) : null, state.error !== null && state.items.length > 0 ? (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", gap: SPACE.sm, alignItems: "center", justifyContent: "center" }, children: [(0, import_jsx_runtime4.jsx)("span", { style: { fontSize: 12, color: token.error }, children: state.error }), (0, import_jsx_runtime4.jsx)(Button, { onClick: props.onLoadMore, children: t("retry") })] }) : null, state.nextCursor !== null && !state.loadingMore ? (0, import_jsx_runtime4.jsx)(LoadMoreSentinel, { onReach: props.onLoadMore, rootRef: scrollRoot }) : null] });
}

// lib/client/components/MarketDetail.js
var import_jsx_runtime5 = require("react/jsx-runtime");
var import_react6 = require("react");
function securityTone2(status) {
  if (status === "verified" || status === "benign")
    return "ok";
  if (status === "flagged")
    return "error";
  return "muted";
}
function securityLabelKey2(status) {
  if (status === "verified")
    return "securityVerified";
  if (status === "benign")
    return "securityBenign";
  if (status === "flagged")
    return "securityFlagged";
  return "securityUnknown";
}
function MarketDetail(props) {
  const t = useT();
  const headingRef = (0, import_react6.useRef)(null);
  (0, import_react6.useEffect)(() => {
    if (props.detail !== null)
      headingRef.current?.focus();
  }, [props.detail === null]);
  if (props.loading && props.detail === null) {
    return (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: SPACE.md }, children: [(0, import_jsx_runtime5.jsx)(Skeleton, { height: 120, count: 1 }), (0, import_jsx_runtime5.jsx)(Skeleton, { height: 280, count: 1 })] });
  }
  if (props.error !== null && props.detail === null) {
    return (0, import_jsx_runtime5.jsx)(Notice, { title: t("errorTitle"), detail: props.error, action: (0, import_jsx_runtime5.jsx)(Button, { onClick: props.onRetry, children: t("retry") }) });
  }
  const detail = props.detail;
  if (detail === null)
    return null;
  const blocked = detail.installState === "not-installable";
  const installed = detail.installState === "installed";
  return (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: SPACE.lg }, children: [(0, import_jsx_runtime5.jsxs)("button", { type: "button", onClick: props.onBack, style: {
    alignSelf: "flex-start",
    border: "none",
    background: "transparent",
    color: token.labelSecondary,
    font: "inherit",
    fontSize: 12,
    cursor: "pointer",
    padding: 0
  }, children: ["\u2190 ", t("back")] }), (0, import_jsx_runtime5.jsxs)("div", { style: surfaceStyle({ padding: SPACE.lg }), children: [(0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", gap: SPACE.md, alignItems: "flex-start", flexWrap: "wrap" }, children: [(0, import_jsx_runtime5.jsxs)("div", { style: { flex: "1 1 320px", minWidth: 0 }, children: [(0, import_jsx_runtime5.jsx)("h2", { ref: headingRef, tabIndex: -1, style: { margin: 0, fontSize: 18, fontWeight: 600, outline: "none" }, children: detail.name }), (0, import_jsx_runtime5.jsxs)("p", { style: { margin: `${SPACE.xs}px 0 0`, fontSize: 12, color: token.labelSecondary }, children: [detail.author.displayName ?? detail.author.handle, detail.version === void 0 ? "" : ` \xB7 v${detail.version}`, detail.license === void 0 ? "" : ` \xB7 ${detail.license}`] }), (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", gap: SPACE.xs, flexWrap: "wrap", marginTop: SPACE.sm }, children: [(0, import_jsx_runtime5.jsx)(Pill, { tone: "brand", children: detail.source }), (0, import_jsx_runtime5.jsx)(Pill, { tone: securityTone2(detail.securityStatus), children: t(securityLabelKey2(detail.securityStatus)) }), detail.requiresApiKey === true ? (0, import_jsx_runtime5.jsx)(Pill, { tone: "warn", children: t("detailRequiresKey") }) : null, installed ? (0, import_jsx_runtime5.jsx)(Pill, { tone: "ok", children: t("installed") }) : null] })] }), (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: SPACE.sm, alignItems: "flex-end" }, children: [(0, import_jsx_runtime5.jsx)(Button, { variant: "primary", onClick: props.onInstall, disabled: props.busy || installed || blocked, children: installed ? t("installed") : props.busy ? t("installing") : t("install") }), detail.pageUrl === void 0 ? null : (0, import_jsx_runtime5.jsx)("a", { href: detail.pageUrl, target: "_blank", rel: "noopener noreferrer", style: { fontSize: 12, color: token.brand }, children: t("detailPage") })] })] }), (0, import_jsx_runtime5.jsxs)("dl", { style: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: SPACE.md,
    margin: `${SPACE.lg}px 0 0`,
    paddingTop: SPACE.md,
    borderTop: `1px solid ${token.borderL1}`
  }, children: [(0, import_jsx_runtime5.jsx)(Fact, { label: t("detailDownloads"), value: countText(detail.stats.downloads) }), detail.stats.installs === void 0 ? null : (0, import_jsx_runtime5.jsx)(Fact, { label: t("detailInstalls"), value: countText(detail.stats.installs) }), (0, import_jsx_runtime5.jsx)(Fact, { label: t("detailStars"), value: countText(detail.stats.stars ?? 0) }), (0, import_jsx_runtime5.jsx)(Fact, { label: t("detailUpdated"), value: shortDate(detail.updatedAt) ?? "\u2014" }), (0, import_jsx_runtime5.jsx)(Fact, { label: t("detailFiles"), value: `${detail.files.length} \xB7 ${fileSizeText(detail.totalSize)}` })] })] }), (0, import_jsx_runtime5.jsx)(TabBar, { tab: props.tab, onSetTab: props.onSetTab, hasSecurity: (detail.securityReports?.length ?? 0) > 0, hasChangelog: detail.changelog !== void 0 }), (0, import_jsx_runtime5.jsxs)("div", { children: [props.tab === "overview" ? (0, import_jsx_runtime5.jsx)(Overview, { detail }) : null, props.tab === "files" ? (0, import_jsx_runtime5.jsx)(FilesPane, { detail, file: props.file, loading: props.fileLoading, error: props.fileError, onSelectFile: props.onSelectFile }) : null, props.tab === "security" ? (0, import_jsx_runtime5.jsx)(SecurityPane, { detail }) : null, props.tab === "changelog" ? (0, import_jsx_runtime5.jsx)(ChangelogPane, { detail }) : null] })] });
}
function Fact({ label, value }) {
  return (0, import_jsx_runtime5.jsxs)("div", { style: { minWidth: 0 }, children: [(0, import_jsx_runtime5.jsx)("dt", { style: { fontSize: 11, color: token.labelSecondary, margin: 0 }, children: label }), (0, import_jsx_runtime5.jsx)("dd", { style: { margin: 0, fontSize: 13, fontVariantNumeric: "tabular-nums" }, children: value })] });
}
function TabBar({ tab, onSetTab, hasSecurity, hasChangelog }) {
  const t = useT();
  const tabs = [
    { id: "overview", label: t("detailOverview") },
    { id: "files", label: t("detailFiles") },
    // Tabs with nothing behind them are not offered: an empty Security tab reads
    // as "the scan failed" rather than "this registry does not publish scans".
    ...hasSecurity ? [{ id: "security", label: t("detailSecurity") }] : [],
    ...hasChangelog ? [{ id: "changelog", label: t("detailChangelog") }] : []
  ];
  return (0, import_jsx_runtime5.jsx)("div", { role: "tablist", style: { display: "flex", gap: SPACE.xs, borderBottom: `1px solid ${token.borderL1}`, paddingBottom: SPACE.xs }, children: tabs.map((entry) => (0, import_jsx_runtime5.jsx)("button", { role: "tab", type: "button", "aria-selected": tab === entry.id, onClick: () => {
    onSetTab(entry.id);
  }, style: {
    font: "inherit",
    fontSize: 12,
    padding: "5px 12px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: tab === entry.id ? token.labelPrimary : token.labelSecondary,
    borderBottom: `2px solid ${tab === entry.id ? token.brand : "transparent"}`,
    fontWeight: tab === entry.id ? 600 : 400
  }, children: entry.label }, entry.id)) });
}
function Overview({ detail }) {
  const t = useT();
  const body = detail.description.trim();
  const showSummary = detail.summary !== "" && body !== "" && !body.startsWith(detail.summary.slice(0, 40));
  return (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: SPACE.md }, children: [(0, import_jsx_runtime5.jsx)("h3", { style: { margin: 0, fontSize: 13, fontWeight: 600 }, children: t("detailAbout") }), showSummary ? (0, import_jsx_runtime5.jsx)("p", { style: { margin: 0, fontSize: 13, color: token.labelSecondary }, children: detail.summary }) : null, body === "" ? (0, import_jsx_runtime5.jsx)(Notice, { title: t("detailNoDescription"), detail: t("detailNoDescriptionHint") }) : (0, import_jsx_runtime5.jsx)(SourceBlock, { text: body, wrap: true }), detail.tags.length === 0 && (detail.categories ?? []).length === 0 ? null : (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: SPACE.xs }, children: [(detail.categories ?? []).length === 0 ? null : (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", gap: SPACE.xs, flexWrap: "wrap", alignItems: "center" }, children: [(0, import_jsx_runtime5.jsx)("span", { style: { fontSize: 11, color: token.labelSecondary }, children: t("detailCategories") }), (detail.categories ?? []).map((ref) => (0, import_jsx_runtime5.jsx)(CategoryPill, { category: ref }, ref.key))] }), detail.tags.length === 0 ? null : (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", gap: SPACE.xs, flexWrap: "wrap", alignItems: "center" }, children: [(0, import_jsx_runtime5.jsx)("span", { style: { fontSize: 11, color: token.labelSecondary }, children: t("detailTags") }), detail.tags.map((tag) => (0, import_jsx_runtime5.jsx)(Pill, { tone: "neutral", children: tag }, tag))] })] })] });
}
function FilesPane({ detail, file, loading, error, onSelectFile }) {
  const t = useT();
  const listRef = (0, import_react6.useRef)(null);
  (0, import_react6.useEffect)(() => {
    listRef.current?.focus();
  }, []);
  if (detail.files.length === 0) {
    return (0, import_jsx_runtime5.jsx)(Notice, { title: t("detailFileEmpty") });
  }
  return (0, import_jsx_runtime5.jsxs)("div", { style: { display: "grid", gridTemplateColumns: "minmax(180px, 240px) 1fr", gap: SPACE.md, alignItems: "start" }, children: [(0, import_jsx_runtime5.jsx)("div", { ref: listRef, tabIndex: -1, role: "listbox", "aria-label": t("detailFiles"), style: surfaceStyle({ padding: SPACE.sm, maxHeight: 460, overflowY: "auto", outline: "none" }), children: detail.files.map((entry) => (0, import_jsx_runtime5.jsxs)("button", { type: "button", role: "option", "aria-selected": file?.path === entry.path, disabled: entry.tooBig, title: entry.tooBig ? t("detailFileTooBig") : entry.path, onClick: () => {
    onSelectFile(entry.path);
  }, style: {
    display: "block",
    width: "100%",
    textAlign: "left",
    font: "inherit",
    fontSize: 12,
    fontFamily: token.mono,
    padding: "4px 8px",
    borderRadius: radius.sm,
    border: "none",
    cursor: entry.tooBig ? "default" : "pointer",
    opacity: entry.tooBig ? 0.5 : 1,
    background: file?.path === entry.path ? token.bgLayer2 : "transparent",
    color: token.labelPrimary,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  }, children: [entry.path, (0, import_jsx_runtime5.jsx)("span", { style: { color: token.labelSecondary, marginLeft: SPACE.sm }, children: fileSizeText(entry.size) })] }, entry.path)) }), (0, import_jsx_runtime5.jsxs)("div", { style: { minWidth: 0 }, children: [loading ? (0, import_jsx_runtime5.jsx)(Skeleton, { height: 280, count: 1 }) : null, error !== null ? (0, import_jsx_runtime5.jsx)(Notice, { title: t("errorTitle"), detail: error }) : null, file !== null && !loading ? (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: SPACE.sm }, children: [file.truncated ? (0, import_jsx_runtime5.jsx)(Pill, { tone: "warn", children: t("detailFileTruncated") }) : null, (0, import_jsx_runtime5.jsx)(SourceBlock, { text: file.content })] }) : null] })] });
}
function SecurityPane({ detail }) {
  const t = useT();
  const reports = (0, import_react6.useMemo)(() => detail.securityReports ?? [], [detail.securityReports]);
  return (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: SPACE.md }, children: [(0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: SPACE.sm }, children: [(0, import_jsx_runtime5.jsx)(Pill, { tone: securityTone2(detail.securityStatus), children: t(securityLabelKey2(detail.securityStatus)) }), (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: 12, color: token.labelSecondary }, children: t("securityCaveat") })] }), reports.length === 0 ? (0, import_jsx_runtime5.jsx)(Notice, { title: t("securityUnknown") }) : (0, import_jsx_runtime5.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: SPACE.sm }, children: reports.map((report) => (0, import_jsx_runtime5.jsxs)("div", { style: surfaceStyle({ padding: SPACE.md }), children: [(0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", gap: SPACE.sm, alignItems: "center", flexWrap: "wrap" }, children: [(0, import_jsx_runtime5.jsx)("strong", { style: { fontSize: 12 }, children: report.vendor }), (0, import_jsx_runtime5.jsx)(Pill, { tone: report.status.toLowerCase() === "benign" || report.status.toLowerCase() === "clean" ? "ok" : "warn", children: report.statusText }), report.reportUrl === void 0 ? null : (
    // Vendor report links can be signed and short-lived; the
    // reader is sent there now rather than the URL being kept.
    (0, import_jsx_runtime5.jsx)("a", { href: report.reportUrl, target: "_blank", rel: "noopener noreferrer", style: { fontSize: 12, color: token.brand, marginLeft: "auto" }, children: t("securityReport") })
  )] }), report.summary === void 0 ? null : (0, import_jsx_runtime5.jsx)("p", { style: { margin: `${SPACE.sm}px 0 0`, fontSize: 12, color: token.labelSecondary }, children: report.summary })] }, `${report.vendor}:${report.status}`)) })] });
}
function ChangelogPane({ detail }) {
  if (detail.changelog === void 0)
    return null;
  return (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: SPACE.sm }, children: [detail.changelog.version === void 0 ? null : (0, import_jsx_runtime5.jsxs)(Pill, { tone: "neutral", children: ["v", detail.changelog.version] }), (0, import_jsx_runtime5.jsx)(SourceBlock, { text: detail.changelog.text, wrap: true })] });
}

// lib/client/components/DiscoverPanel.js
var import_jsx_runtime6 = require("react/jsx-runtime");
var ROW_CATEGORY_LIMIT = 1;
var RANK_WIDTH = 18;
var METRIC_MIN_WIDTH = 64;
var ACTION_MIN_WIDTH = 62;
var DISCOVER_SKELETON_ROWS = 7;
var LABEL_KEY = {
  featured: "discoverFeatured",
  trending: "discoverTrending",
  official: "discoverOfficial",
  newest: "discoverNewest",
  installs: "discoverInstalls"
};
var HINT_KEY = {
  featured: "discoverFeaturedHint",
  trending: "discoverTrendingHint",
  official: "discoverOfficialHint",
  newest: "discoverNewestHint",
  installs: "discoverInstallsHint"
};
var RULE_KEY = {
  featured: "discoverFeaturedRule",
  trending: "discoverTrendingRule",
  official: "discoverOfficialRule",
  newest: "discoverNewestRule",
  installs: "discoverInstallsRule"
};
var METRIC_KEY = {
  downloads: "discoverColumnDownloads",
  installs: "discoverColumnInstalls",
  stars: "discoverColumnStars",
  updatedAt: "discoverColumnUpdated"
};
function metricText(skill, metric) {
  if (metric === "updatedAt")
    return shortDate(skill.updatedAt) ?? "\u2014";
  const value = metric === "installs" ? skill.stats.installs : metric === "stars" ? skill.stats.stars : skill.stats.downloads;
  return value === void 0 ? "\u2014" : countText(value);
}
function DiscoverSkeleton({ label }) {
  const bar = (width, height = 10) => (0, import_jsx_runtime6.jsx)("span", { style: {
    display: "block",
    width,
    height,
    borderRadius: radius.xs,
    // The theme's placeholder wash, not a surface colour: the light theme's
    // surfaces are white, so a placeholder painted with one is invisible.
    background: token.skeleton
  } });
  return (0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: SPACE.lg }, children: [(0, import_jsx_runtime6.jsx)(LoadingLine, { label }), (0, import_jsx_runtime6.jsxs)("div", { "aria-hidden": "true", style: { display: "flex", flexDirection: "column", gap: SPACE.lg }, children: [(0, import_jsx_runtime6.jsx)("div", { style: { display: "flex", gap: SPACE.lg, borderBottom: `1px solid ${token.borderL1}`, paddingBottom: SPACE.sm + 2 }, children: [34, 34, 34, 46, 58].map((width, index) => (0, import_jsx_runtime6.jsx)("span", { children: bar(width, 12) }, index)) }), bar("55%", 10), (0, import_jsx_runtime6.jsxs)("div", { style: surfaceStyle({ overflow: "hidden" }), children: [(0, import_jsx_runtime6.jsx)("div", { style: { padding: `${SPACE.sm}px ${SPACE.md}px`, borderBottom: `1px solid ${token.borderL1}` }, children: bar(48, 9) }), Array.from({ length: DISCOVER_SKELETON_ROWS }, (_, index) => (0, import_jsx_runtime6.jsxs)("div", { style: {
    display: "flex",
    gap: SPACE.md,
    alignItems: "center",
    padding: `${SPACE.sm + 2}px ${SPACE.md}px`,
    borderBottom: index === DISCOVER_SKELETON_ROWS - 1 ? "none" : `1px solid ${token.borderL1}`
  }, children: [(0, import_jsx_runtime6.jsx)("span", { style: { width: RANK_WIDTH, flex: "none" }, children: bar("100%", 9) }), (0, import_jsx_runtime6.jsxs)("span", { style: { flex: "1 1 auto", display: "flex", flexDirection: "column", gap: 6 }, children: [bar(`${58 - index * 4}%`, 11), bar("30%", 8)] }), (0, import_jsx_runtime6.jsx)("span", { style: { flex: "none", minWidth: METRIC_MIN_WIDTH, display: "flex", justifyContent: "flex-end" }, children: bar(38, 10) }), (0, import_jsx_runtime6.jsx)("span", { style: { flex: "none", minWidth: ACTION_MIN_WIDTH }, children: bar("100%", 24) })] }, index))] })] })] });
}
function DiscoverPanel(props) {
  const t = useT();
  const collection = props.collections.find((entry) => entry.id === props.active) ?? props.collections[0];
  if (props.loading && props.collections.length === 0)
    return (0, import_jsx_runtime6.jsx)(DiscoverSkeleton, { label: t("discoverLoading") });
  if (props.error !== null && props.collections.length === 0) {
    return (0, import_jsx_runtime6.jsx)(Notice, { title: t("errorTitle"), detail: props.error, action: (0, import_jsx_runtime6.jsx)(Button, { onClick: props.onRefresh, children: t("retry") }) });
  }
  if (collection === void 0) {
    return (0, import_jsx_runtime6.jsx)(Notice, { title: t("discoverEmpty"), detail: t("discoverEmptyHint") });
  }
  return (0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: SPACE.lg }, children: [(0, import_jsx_runtime6.jsx)(ShelfTabs, { collections: props.collections, active: collection.id, onSelect: props.onSelect }), props.loading ? (0, import_jsx_runtime6.jsx)(LoadingLine, { label: t("discoverLoading") }) : null, (0, import_jsx_runtime6.jsxs)("p", { style: { margin: 0, fontSize: 12, color: token.labelSecondary }, children: [t(HINT_KEY[collection.id]), (0, import_jsx_runtime6.jsx)(DegradedNote, { sources: props.sources })] }), props.error !== null && props.collections.length > 0 ? (0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", gap: SPACE.sm, alignItems: "center" }, children: [(0, import_jsx_runtime6.jsx)("span", { style: { fontSize: 12, color: token.error }, children: props.error }), (0, import_jsx_runtime6.jsx)(Button, { onClick: props.onRefresh, children: t("retry") })] }) : null, collection.items.length === 0 ? (0, import_jsx_runtime6.jsx)(Notice, { title: t("discoverShelfEmpty"), detail: t(RULE_KEY[collection.id]) }) : (0, import_jsx_runtime6.jsx)(SkillRowList, { skills: collection.items, metric: collection.metric, installingIds: props.installingIds, onOpen: props.onOpen, onInstall: props.onInstall }), (0, import_jsx_runtime6.jsx)("div", { style: { display: "flex", justifyContent: "center", paddingTop: SPACE.xs }, children: (0, import_jsx_runtime6.jsxs)(Button, { onClick: props.onFindMore, style: { padding: "7px 18px" }, children: [t("discoverFindMore"), " \u2192"] }) })] });
}
function ShelfTabs({ collections, active: active2, onSelect }) {
  const t = useT();
  return (0, import_jsx_runtime6.jsx)("div", { role: "tablist", "aria-label": t("discoverTitle"), style: { display: "flex", gap: SPACE.lg, borderBottom: `1px solid ${token.borderL1}`, flexWrap: "wrap" }, children: collections.map((collection) => {
    const selected = collection.id === active2;
    return (0, import_jsx_runtime6.jsx)("button", { role: "tab", type: "button", "aria-selected": selected, title: t(RULE_KEY[collection.id]), onClick: () => {
      onSelect(collection.id);
    }, style: {
      font: "inherit",
      fontSize: 13,
      padding: "6px 2px 8px",
      marginBottom: -1,
      border: "none",
      background: "transparent",
      cursor: "pointer",
      color: selected ? token.labelPrimary : token.labelSecondary,
      borderBottom: `2px solid ${selected ? token.brand : "transparent"}`,
      fontWeight: selected ? 600 : 400,
      transition: "color 150ms ease-out"
    }, children: t(LABEL_KEY[collection.id]) }, collection.id);
  }) });
}
function DegradedNote({ sources }) {
  const t = useT();
  if (sources === null)
    return null;
  const degraded = ["clawhub", "skillhub"].filter((source) => {
    const status = sources[source]?.status;
    return status === "failed" || status === "degraded";
  });
  if (degraded.length === 0)
    return null;
  return (0, import_jsx_runtime6.jsxs)("span", { style: { color: token.warn }, title: t("discoverDegradedHint"), children: [" \xB7 ", t("discoverDegraded"), " ", degraded.join(" / ")] });
}
function SkillRowList({ skills, metric, installingIds, onOpen, onInstall }) {
  const t = useT();
  return (0, import_jsx_runtime6.jsxs)("div", { style: surfaceStyle({ overflow: "hidden" }), children: [(0, import_jsx_runtime6.jsxs)("div", { "aria-hidden": "true", style: {
    display: "flex",
    gap: SPACE.md,
    alignItems: "center",
    padding: `${SPACE.sm}px ${SPACE.md}px`,
    borderBottom: `1px solid ${token.borderL1}`,
    fontSize: 10.5,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: token.labelSecondary
  }, children: [(0, import_jsx_runtime6.jsx)("span", { style: { width: RANK_WIDTH, flex: "none" } }), (0, import_jsx_runtime6.jsx)("span", { style: { flex: "1 1 auto" }, children: t("discoverColumnSkill") }), (0, import_jsx_runtime6.jsx)("span", { style: { flex: "none", minWidth: METRIC_MIN_WIDTH, textAlign: "right" }, children: t(METRIC_KEY[metric]) }), (0, import_jsx_runtime6.jsx)("span", { style: { flex: "none", minWidth: ACTION_MIN_WIDTH } })] }), (0, import_jsx_runtime6.jsx)("div", { role: "list", children: skills.map((skill, index) => (0, import_jsx_runtime6.jsx)(SkillRow, { skill, rank: index + 1, metric, last: index === skills.length - 1, busy: installingIds.includes(skill.id), onOpen: () => {
    onOpen(skill);
  }, onInstall: () => {
    onInstall(skill);
  } }, skill.id)) })] });
}
function SkillRow({ skill, rank, metric, last, busy, onOpen, onInstall }) {
  const t = useT();
  const locale = useLocale();
  const installed = skill.installState === "installed";
  const blocked = skill.installState === "not-installable";
  const categories = (skill.categories ?? []).slice(0, ROW_CATEGORY_LIMIT);
  return (0, import_jsx_runtime6.jsxs)("div", { role: "listitem", style: {
    display: "flex",
    gap: SPACE.md,
    alignItems: "center",
    padding: `${SPACE.sm + 2}px ${SPACE.md}px`,
    borderBottom: last ? "none" : `1px solid ${token.borderL1}`
  }, children: [(0, import_jsx_runtime6.jsx)("span", { "aria-hidden": "true", style: {
    width: RANK_WIDTH,
    flex: "none",
    fontSize: 11,
    color: token.labelSecondary,
    fontVariantNumeric: "tabular-nums"
  }, children: rank }), (0, import_jsx_runtime6.jsxs)("div", { style: { flex: "1 1 auto", minWidth: 0 }, children: [(0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", alignItems: "baseline", gap: SPACE.sm, minWidth: 0 }, children: [(0, import_jsx_runtime6.jsx)("button", { type: "button", onClick: onOpen, title: skill.name, style: {
    border: "none",
    background: "transparent",
    padding: 0,
    font: "inherit",
    fontSize: 13,
    fontWeight: 600,
    color: token.labelPrimary,
    cursor: "pointer",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0
  }, children: skill.name }), (0, import_jsx_runtime6.jsxs)("span", { style: {
    fontSize: 11,
    color: token.labelSecondary,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  }, children: ["@", skill.author.handle] })] }), (0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", gap: SPACE.xs, alignItems: "center", marginTop: 3, flexWrap: "wrap" }, children: [(0, import_jsx_runtime6.jsx)(Pill, { tone: "brand", children: skill.source }), skill.verified === true ? (0, import_jsx_runtime6.jsx)(Pill, { tone: "ok", children: t("discoverVerified") }) : null, categories.map((ref) => (0, import_jsx_runtime6.jsx)(Pill, { tone: "neutral", title: ref.key, children: categoryLabelText(ref, locale) }, ref.key)), installed ? (0, import_jsx_runtime6.jsx)(Pill, { tone: "ok", children: t("installed") }) : null] })] }), (0, import_jsx_runtime6.jsx)("span", { "aria-label": `${t(METRIC_KEY[metric])} ${metricText(skill, metric)}`, style: {
    flex: "none",
    minWidth: METRIC_MIN_WIDTH,
    textAlign: "right",
    fontSize: 12,
    color: token.labelPrimary,
    fontVariantNumeric: "tabular-nums"
  }, children: metricText(skill, metric) }), (0, import_jsx_runtime6.jsx)(Button, { variant: installed ? "ghost" : "primary", onClick: onInstall, disabled: busy || installed || blocked, title: blocked ? t("notInstallable") : void 0, style: { flex: "none", minWidth: ACTION_MIN_WIDTH, borderRadius: radius.md }, children: installed ? t("installed") : busy ? t("installing") : t("install") })] });
}

// lib/client/components/InstalledPanel.js
var import_jsx_runtime7 = require("react/jsx-runtime");
var import_react7 = require("react");
function sourceLabelOf(source, t) {
  return source === "local" ? t("installedSourceLocal") : source;
}
function filterInstalled(items, source, query) {
  const needle = query.trim().toLowerCase();
  return items.filter((item) => source === "all" || item.source === source).filter((item) => needle === "" || [
    item.name,
    item.dirName,
    item.slug,
    item.owner ?? "",
    item.summary ?? ""
  ].join(" ").toLowerCase().includes(needle));
}
function InstalledPanel(props) {
  const t = useT();
  const [query, setQuery] = (0, import_react7.useState)("");
  const [source, setSource] = (0, import_react7.useState)("all");
  const sourceOptions = (0, import_react7.useMemo)(() => {
    const present = new Set(props.items.map((item) => item.source));
    const known = [
      { value: "local", label: t("installedSourceLocal") },
      { value: "clawhub", label: "clawhub" },
      { value: "skillhub", label: "skillhub" }
    ];
    return [
      { value: "all", label: t("installedSourceAll") },
      ...known.filter((entry) => present.has(entry.value))
    ];
  }, [props.items, t]);
  if (props.detail !== null || props.detailLoading) {
    return (0, import_jsx_runtime7.jsx)(InstalledDetailView, { ...props });
  }
  const activeSource = sourceOptions.some((entry) => entry.value === source) ? source : "all";
  const visible = filterInstalled(props.items, activeSource, query);
  const filtered = activeSource !== "all" || query.trim() !== "";
  return (0, import_jsx_runtime7.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: SPACE.md }, children: [(0, import_jsx_runtime7.jsxs)("div", { style: { display: "flex", gap: SPACE.sm, alignItems: "center", flexWrap: "wrap" }, children: [(0, import_jsx_runtime7.jsx)("input", { type: "search", value: query, "aria-label": t("installedSearch"), placeholder: t("installedSearch"), onChange: (event) => {
    setQuery(event.currentTarget.value);
  }, style: {
    font: "inherit",
    fontSize: 13,
    flex: "1 1 200px",
    minWidth: 160,
    padding: "7px 10px",
    borderRadius: radius.md,
    border: `1px solid ${token.borderL2}`,
    background: token.bgLayer1,
    color: token.labelPrimary
  } }), (0, import_jsx_runtime7.jsx)(SelectField, { value: activeSource, options: sourceOptions, onChange: setSource, ariaLabel: t("installedFilterSource"), ariaDescription: t("installedFilterSourceHint") }), (0, import_jsx_runtime7.jsx)("span", { style: { fontSize: 12, color: token.labelSecondary }, children: filtered ? `${visible.length} / ${props.items.length}` : props.items.length }), (0, import_jsx_runtime7.jsx)(Button, { onClick: props.onRefresh, children: t("refresh") })] }), props.error === null ? null : (0, import_jsx_runtime7.jsx)(Notice, { title: t("errorTitle"), detail: props.error, action: (0, import_jsx_runtime7.jsx)(Button, { onClick: props.onRefresh, children: t("retry") }) }), props.loading && props.items.length === 0 ? (0, import_jsx_runtime7.jsx)(Skeleton, { height: 54, count: 4 }) : null, !props.loading && props.items.length === 0 && props.error === null ? (0, import_jsx_runtime7.jsx)(Notice, { title: t("installedEmpty"), detail: t("installedEmptyHint") }) : null, props.items.length > 0 && visible.length === 0 ? (0, import_jsx_runtime7.jsx)(Notice, { title: t("empty"), detail: t("emptyHint") }) : null, (0, import_jsx_runtime7.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: SPACE.sm }, children: visible.map((item) => (0, import_jsx_runtime7.jsx)(InstalledRow, { item, onOpen: () => {
    props.onOpen(item.key);
  }, onRemove: () => {
    props.onRequestRemove(item.key);
  } }, item.key)) })] });
}
function InstalledRow({ item, onOpen, onRemove }) {
  const t = useT();
  return (0, import_jsx_runtime7.jsxs)("div", { style: surfaceStyle({ padding: SPACE.md, display: "flex", gap: SPACE.md, alignItems: "center", flexWrap: "wrap" }), children: [(0, import_jsx_runtime7.jsxs)("div", { style: { flex: "1 1 260px", minWidth: 0 }, children: [(0, import_jsx_runtime7.jsxs)("div", { style: { display: "flex", gap: SPACE.sm, alignItems: "center", flexWrap: "wrap" }, children: [(0, import_jsx_runtime7.jsx)("button", { type: "button", onClick: onOpen, style: {
    border: "none",
    background: "transparent",
    padding: 0,
    font: "inherit",
    fontSize: 13,
    fontWeight: 600,
    color: token.labelPrimary,
    cursor: "pointer"
  }, children: item.name }), (0, import_jsx_runtime7.jsx)(Pill, { tone: item.source === "local" ? "muted" : "brand", title: t("installedFilterSourceHint"), children: sourceLabelOf(item.source, t) }), (0, import_jsx_runtime7.jsx)(Pill, { tone: item.managed ? "ok" : "muted", children: item.managed ? t("installedManaged") : t("installedLocal") }), item.linked ? (0, import_jsx_runtime7.jsx)(Pill, { tone: "muted", children: t("installedLinked") }) : null, item.version === void 0 ? null : (0, import_jsx_runtime7.jsxs)(Pill, { tone: "neutral", children: ["v", item.version] })] }), (0, import_jsx_runtime7.jsxs)("div", { style: { fontSize: 11, color: token.labelSecondary, marginTop: 2, wordBreak: "break-all" }, children: [item.dirPath, item.owner === void 0 ? "" : ` \xB7 ${item.owner}`] })] }), (0, import_jsx_runtime7.jsxs)("div", { style: { fontSize: 11, color: token.labelSecondary, textAlign: "right", whiteSpace: "nowrap" }, children: [item.fileCount, " ", t("detailFiles"), " \xB7 ", fileSizeText(item.bytes)] }), (0, import_jsx_runtime7.jsx)(Button, { onClick: onOpen, children: t("detailOverview") }), item.managed ? (0, import_jsx_runtime7.jsx)(Button, { onClick: onRemove, disabled: !item.removable, title: item.removable ? void 0 : t("uninstallDisabled"), children: t("uninstall") }) : null] });
}
function InstalledDetailView(props) {
  const t = useT();
  const [tab, setTab] = (0, import_react7.useState)("document");
  const headingRef = (0, import_react7.useRef)(null);
  (0, import_react7.useEffect)(() => {
    if (props.detail !== null)
      headingRef.current?.focus();
  }, [props.detail === null]);
  if (props.detailLoading && props.detail === null) {
    return (0, import_jsx_runtime7.jsx)(Skeleton, { height: 140, count: 2 });
  }
  if (props.detailError !== null && props.detail === null) {
    return (0, import_jsx_runtime7.jsx)(Notice, { title: t("errorTitle"), detail: props.detailError, action: (0, import_jsx_runtime7.jsx)(Button, { onClick: props.onCloseDetail, children: t("back") }) });
  }
  const detail = props.detail;
  if (detail === null)
    return null;
  return (0, import_jsx_runtime7.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: SPACE.lg }, children: [(0, import_jsx_runtime7.jsxs)("button", { type: "button", onClick: props.onCloseDetail, style: {
    alignSelf: "flex-start",
    border: "none",
    background: "transparent",
    color: token.labelSecondary,
    font: "inherit",
    fontSize: 12,
    cursor: "pointer",
    padding: 0
  }, children: ["\u2190 ", t("back")] }), (0, import_jsx_runtime7.jsx)("div", { style: surfaceStyle({ padding: SPACE.lg }), children: (0, import_jsx_runtime7.jsxs)("div", { style: { display: "flex", gap: SPACE.md, alignItems: "flex-start", flexWrap: "wrap" }, children: [(0, import_jsx_runtime7.jsxs)("div", { style: { flex: "1 1 300px", minWidth: 0 }, children: [(0, import_jsx_runtime7.jsx)("h2", { ref: headingRef, tabIndex: -1, style: { margin: 0, fontSize: 17, fontWeight: 600, outline: "none" }, children: detail.item.name }), (0, import_jsx_runtime7.jsxs)("div", { style: { display: "flex", gap: SPACE.xs, flexWrap: "wrap", marginTop: SPACE.sm }, children: [(0, import_jsx_runtime7.jsx)(Pill, { tone: detail.item.managed ? "ok" : "muted", children: detail.item.managed ? t("installedManaged") : t("installedLocal") }), detail.item.version === void 0 ? null : (0, import_jsx_runtime7.jsxs)(Pill, { tone: "neutral", children: ["v", detail.item.version] }), detail.item.linked ? (0, import_jsx_runtime7.jsx)(Pill, { tone: "muted", children: t("installedLinked") }) : null, detail.item.source === "local" ? null : (0, import_jsx_runtime7.jsx)(Pill, { tone: "brand", children: detail.item.source })] }), (0, import_jsx_runtime7.jsxs)("dl", { style: { margin: `${SPACE.md}px 0 0`, fontSize: 11, color: token.labelSecondary }, children: [(0, import_jsx_runtime7.jsx)("dt", { style: { margin: 0 }, children: t("installPath") }), (0, import_jsx_runtime7.jsx)("dd", { style: { margin: 0, wordBreak: "break-all", color: token.labelPrimary }, children: detail.item.dirPath })] })] }), detail.item.managed ? (0, import_jsx_runtime7.jsx)(Button, { onClick: () => {
    props.onRequestRemove(detail.item.key);
  }, disabled: !detail.item.removable, title: detail.item.removable ? void 0 : t("uninstallDisabled"), children: t("uninstall") }) : null] }) }), (0, import_jsx_runtime7.jsx)("div", { role: "tablist", style: { display: "flex", gap: SPACE.xs, borderBottom: `1px solid ${token.borderL1}`, paddingBottom: SPACE.xs }, children: [
    { id: "document", label: t("installedDocument") },
    { id: "files", label: t("detailFiles") }
  ].map((entry) => (0, import_jsx_runtime7.jsx)("button", { role: "tab", type: "button", "aria-selected": tab === entry.id, onClick: () => {
    setTab(entry.id);
  }, style: {
    font: "inherit",
    fontSize: 12,
    padding: "5px 12px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: tab === entry.id ? token.labelPrimary : token.labelSecondary,
    borderBottom: `2px solid ${tab === entry.id ? token.brand : "transparent"}`,
    fontWeight: tab === entry.id ? 600 : 400
  }, children: entry.label }, entry.id)) }), tab === "document" ? (0, import_jsx_runtime7.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: SPACE.md }, children: [detail.frontmatter === null ? null : (0, import_jsx_runtime7.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: SPACE.xs }, children: [(0, import_jsx_runtime7.jsx)("h3", { style: { margin: 0, fontSize: 12, color: token.labelSecondary }, children: t("installedHeader") }), (0, import_jsx_runtime7.jsx)(SourceBlock, { text: detail.frontmatter })] }), (0, import_jsx_runtime7.jsx)(SourceBlock, { text: detail.markdown, wrap: true })] }) : (0, import_jsx_runtime7.jsxs)("div", { style: { display: "grid", gridTemplateColumns: "minmax(180px, 240px) 1fr", gap: SPACE.md, alignItems: "start" }, children: [(0, import_jsx_runtime7.jsx)("div", { role: "listbox", "aria-label": t("detailFiles"), style: surfaceStyle({ padding: SPACE.sm, maxHeight: 420, overflowY: "auto" }), children: detail.files.map((entry) => (0, import_jsx_runtime7.jsxs)("button", { type: "button", role: "option", "aria-selected": props.file?.path === entry.path, onClick: () => {
    props.onSelectFile(entry.path);
  }, style: {
    display: "block",
    width: "100%",
    textAlign: "left",
    font: "inherit",
    fontSize: 12,
    fontFamily: token.mono,
    padding: "4px 8px",
    borderRadius: radius.sm,
    border: "none",
    cursor: "pointer",
    background: props.file?.path === entry.path ? token.bgLayer2 : "transparent",
    color: token.labelPrimary,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  }, children: [entry.path, (0, import_jsx_runtime7.jsx)("span", { style: { color: token.labelSecondary, marginLeft: SPACE.sm }, children: fileSizeText(entry.size) })] }, entry.path)) }), (0, import_jsx_runtime7.jsxs)("div", { style: { minWidth: 0 }, children: [props.fileLoading ? (0, import_jsx_runtime7.jsx)(Skeleton, { height: 240, count: 1 }) : null, props.fileError !== null ? (0, import_jsx_runtime7.jsx)(Notice, { title: t("errorTitle"), detail: props.fileError }) : null, props.file !== null && !props.fileLoading ? (0, import_jsx_runtime7.jsx)(SourceBlock, { text: props.file.content }) : null] })] })] });
}

// lib/client/components/Dialogs.js
var import_jsx_runtime8 = require("react/jsx-runtime");
var import_react8 = require("react");
var FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function DialogShell({ title, children, footer, onClose }) {
  const panelRef = (0, import_react8.useRef)(null);
  const titleId = (0, import_react8.useId)();
  (0, import_react8.useEffect)(() => {
    const panel = panelRef.current;
    if (panel === null)
      return;
    const first = panel.querySelector(FOCUSABLE);
    first?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab")
        return;
      const focusable = [...panel.querySelectorAll(FOCUSABLE)];
      if (focusable.length === 0)
        return;
      const head = focusable[0];
      const tail = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault();
        head.focus();
      }
    };
    panel.addEventListener("keydown", onKeyDown);
    return () => {
      panel.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);
  return (0, import_jsx_runtime8.jsx)("div", {
    style: {
      position: "fixed",
      inset: 0,
      zIndex: 60,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: SPACE.xl,
      background: "color-mix(in srgb, currentColor 24%, transparent)",
      backdropFilter: "blur(2px)"
    },
    // A click on the mask cancels; a click inside the panel must not.
    onMouseDown: (event) => {
      if (event.target === event.currentTarget)
        onClose();
    },
    children: (0, import_jsx_runtime8.jsxs)("div", { ref: panelRef, role: "dialog", "aria-modal": "true", "aria-labelledby": titleId, style: surfaceStyle({
      width: "min(520px, 100%)",
      maxHeight: "80vh",
      overflowY: "auto",
      padding: SPACE.lg,
      display: "flex",
      flexDirection: "column",
      gap: SPACE.md,
      background: token.bgOverlay,
      boxShadow: "0 12px 40px rgba(0,0,0,0.28)"
    }), children: [(0, import_jsx_runtime8.jsx)("h2", { id: titleId, style: { margin: 0, fontSize: 15, fontWeight: 600 }, children: title }), (0, import_jsx_runtime8.jsx)("div", { style: { fontSize: 12.5, color: token.labelPrimary, display: "flex", flexDirection: "column", gap: SPACE.sm }, children }), (0, import_jsx_runtime8.jsx)("div", { style: { display: "flex", justifyContent: "flex-end", gap: SPACE.sm }, children: footer })] })
  });
}
function Row({ label, value }) {
  return (0, import_jsx_runtime8.jsxs)("div", { style: { display: "flex", gap: SPACE.md }, children: [(0, import_jsx_runtime8.jsx)("span", { style: { color: token.labelSecondary, flex: "0 0 84px" }, children: label }), (0, import_jsx_runtime8.jsx)("span", { style: { wordBreak: "break-all" }, children: value })] });
}
function ConfirmInstallDialog(props) {
  const t = useT();
  const [acknowledged, setAcknowledged] = (0, import_react8.useState)(false);
  return (0, import_jsx_runtime8.jsxs)(DialogShell, { title: t("installTitle"), onClose: props.onCancel, footer: (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [(0, import_jsx_runtime8.jsx)(Button, { onClick: props.onCancel, children: t("cancel") }), (0, import_jsx_runtime8.jsx)(Button, { variant: "primary", disabled: !acknowledged || props.busy, onClick: props.onConfirm, children: props.busy ? t("installing") : t("installConfirm") })] }), children: [(0, import_jsx_runtime8.jsx)(Row, { label: t("installSource"), value: `${props.source} \xB7 ${props.owner}` }), (0, import_jsx_runtime8.jsx)(Row, { label: t("detailVersion"), value: props.version === void 0 ? "\u2014" : `v${props.version}` }), (0, import_jsx_runtime8.jsx)(Row, { label: t("installSecurity"), value: props.securityLabel }), props.requiresKey ? (0, import_jsx_runtime8.jsx)(Row, { label: t("detailRequiresKey"), value: t("installRequiresKeyHint") }) : null, (0, import_jsx_runtime8.jsxs)("label", { style: { display: "flex", gap: SPACE.sm, alignItems: "flex-start", marginTop: SPACE.sm, cursor: "pointer" }, children: [(0, import_jsx_runtime8.jsx)("input", { type: "checkbox", checked: acknowledged, onChange: (event) => {
    setAcknowledged(event.currentTarget.checked);
  }, style: { marginTop: 2 } }), (0, import_jsx_runtime8.jsx)("span", { children: t("installAcknowledge") })] }), (0, import_jsx_runtime8.jsx)("p", { style: { margin: 0, fontSize: 11.5, color: token.labelSecondary }, children: t("installHint") })] });
}
function ConfirmRemoveDialog(props) {
  const t = useT();
  return (0, import_jsx_runtime8.jsxs)(DialogShell, { title: t("uninstallTitle"), onClose: props.onCancel, footer: (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [(0, import_jsx_runtime8.jsx)(Button, { onClick: props.onCancel, children: t("cancel") }), (0, import_jsx_runtime8.jsx)(Button, { variant: "primary", disabled: props.busy, onClick: props.onConfirm, children: props.busy ? t("uninstalling") : t("uninstallConfirm") })] }), children: [(0, import_jsx_runtime8.jsx)(Row, { label: t("installedTitle"), value: props.name }), (0, import_jsx_runtime8.jsx)(Row, { label: t("installPath"), value: props.dirPath }), (0, import_jsx_runtime8.jsx)("p", { style: { margin: 0, color: token.error }, children: t("uninstallHint") })] });
}
function NoticeToast({ tone, text, onDismiss }) {
  const t = useT();
  return (0, import_jsx_runtime8.jsxs)("div", { role: "status", style: {
    position: "absolute",
    left: SPACE.xl,
    right: SPACE.xl,
    bottom: SPACE.lg,
    display: "flex",
    gap: SPACE.md,
    alignItems: "center",
    padding: `${SPACE.sm}px ${SPACE.md}px`,
    borderRadius: radius.md,
    border: `1px solid ${tone === "error" ? token.error : token.borderL1}`,
    background: token.bgOverlay,
    boxShadow: "0 6px 20px rgba(0,0,0,0.22)",
    fontSize: 12.5
  }, children: [(0, import_jsx_runtime8.jsx)("span", { style: { color: tone === "error" ? token.error : token.labelPrimary, flex: 1, wordBreak: "break-word" }, children: text }), (0, import_jsx_runtime8.jsx)(Button, { onClick: onDismiss, children: t("close") })] });
}

// lib/client/api.js
var API_BASE = "/api/skills-market-hub";
var SkillsMarketHubApiError = class extends Error {
  /** Host error code (`MARKET_*`, `BAD_REQUEST`, …) or a client-side code. */
  code;
  /** HTTP status; `0` when the request never reached the host. */
  status;
  constructor(code, status, message) {
    super(message);
    this.name = "SkillsMarketHubApiError";
    this.code = code;
    this.status = status;
  }
};
var NETWORK_ERROR_CODE = "NETWORK_ERROR";
var BAD_RESPONSE_CODE = "MARKET_UPSTREAM_BAD_RESPONSE";
function isAbortError(error) {
  return typeof error === "object" && error !== null && error.name === "AbortError";
}
async function send(url, init) {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (isAbortError(error))
      throw error;
    throw new SkillsMarketHubApiError(NETWORK_ERROR_CODE, 0, error instanceof Error ? error.message : String(error));
  }
}
async function toApiError(response) {
  let code = `HTTP_${response.status}`;
  let message = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
  try {
    const payload = await response.json();
    const envelope = payload?.error;
    if (envelope && typeof envelope.code === "string" && envelope.code !== "")
      code = envelope.code;
    if (envelope && typeof envelope.message === "string" && envelope.message !== "")
      message = envelope.message;
  } catch {
  }
  return new SkillsMarketHubApiError(code, response.status, message);
}
async function toJson(response) {
  try {
    return await response.json();
  } catch {
    throw new SkillsMarketHubApiError(BAD_RESPONSE_CODE, response.status, "The Skills Market returned a response that is not valid JSON");
  }
}
async function getJson(path, signal) {
  const response = await send(`${API_BASE}${path}`, {
    method: "GET",
    credentials: "same-origin",
    headers: { accept: "application/json" },
    ...signal === void 0 ? {} : { signal }
  });
  if (!response.ok)
    throw await toApiError(response);
  return toJson(response);
}
async function postJson(path, body) {
  const response = await send(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok)
    throw await toApiError(response);
  return toJson(response);
}
function parseMarketId(id) {
  const separator = id.indexOf(":");
  const source = separator > 0 ? id.slice(0, separator) : "";
  const slug = separator > 0 ? id.slice(separator + 1) : "";
  if ((source === "clawhub" || source === "skillhub") && slug !== "")
    return { source, slug };
  throw new SkillsMarketHubApiError("BAD_REQUEST", 400, `"${id}" is not a market skill id (expected "<source>:<slug>")`);
}
async function fetchMarketList(query, signal, options = {}) {
  const search = new URLSearchParams();
  const q = query.q?.trim();
  if (q)
    search.set("q", q);
  if (query.source !== "all")
    search.set("source", query.source);
  if (query.security !== "all")
    search.set("security", query.security);
  if (query.installed !== "all")
    search.set("installed", query.installed);
  if (query.cursor !== void 0 && query.cursor !== "")
    search.set("cursor", query.cursor);
  if (typeof query.limit === "number" && Number.isFinite(query.limit))
    search.set("limit", String(query.limit));
  if (options.refresh === true)
    search.set("refresh", "1");
  const suffix = search.toString();
  return getJson(`/skills${suffix === "" ? "" : `?${suffix}`}`, signal);
}
async function fetchSkillDetail(id, signal, options = {}) {
  const { source, slug } = parseMarketId(id);
  const search = new URLSearchParams();
  if (options.refresh === true)
    search.set("refresh", "1");
  if (options.owner)
    search.set("owner", options.owner);
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return getJson(`/skills/${source}/${encodeURIComponent(slug)}${suffix}`, signal);
}
async function fetchSkillFile(id, path, signal, owner) {
  const { source, slug } = parseMarketId(id);
  const ownerParam = owner ? `&owner=${encodeURIComponent(owner)}` : "";
  const payload = await getJson(`/skills/${source}/${encodeURIComponent(slug)}/file?path=${encodeURIComponent(path)}${ownerParam}`, signal);
  return payload.file;
}
function fetchDiscover(signal, options = {}) {
  const suffix = options.refresh === true ? "?refresh=1" : "";
  return getJson(`/discover${suffix}`, signal);
}
async function fetchInstalled(signal) {
  const payload = await getJson("/installed", signal);
  return payload.items;
}
async function installSkill(id, owner) {
  const payload = await postJson("/install", owner ? { id, owner } : { id });
  return { installedPath: payload.installedPath, skill: payload.skill };
}
function fetchInstalledDetail(key, signal) {
  return getJson(`/installed/detail?key=${encodeURIComponent(key)}`, signal);
}
async function fetchInstalledFile(key, path, signal) {
  const payload = await getJson(`/installed/file?key=${encodeURIComponent(key)}&path=${encodeURIComponent(path)}`, signal);
  return payload.file;
}
function removeInstalled(key) {
  return postJson("/installed/uninstall", { key });
}

// lib/client/state.js
var PAGE_SIZE = 24;
var SEARCH_DEBOUNCE_MS = 350;
var initialState = {
  section: "discover",
  filters: { q: "", source: "all", security: "all", installed: "all" },
  searchDraft: "",
  discover: [],
  discoverActive: "featured",
  discoverLoading: false,
  discoverError: null,
  discoverSources: null,
  items: [],
  sources: null,
  nextCursor: null,
  loading: false,
  loadingMore: false,
  error: null,
  /** Empty until the first response: the panel shows "unknown" rather than a guess. */
  itemStatuses: {},
  view: { kind: "list" },
  detail: null,
  detailOwner: null,
  detailLoading: false,
  detailError: null,
  detailTab: "overview",
  file: null,
  fileLoading: false,
  fileError: null,
  installingIds: [],
  confirmInstallId: null,
  inventory: [],
  inventoryLoading: false,
  inventoryError: null,
  installedDetail: null,
  installedDetailLoading: false,
  installedDetailError: null,
  confirmRemoveKey: null,
  notice: null
};
function messageOf(error) {
  if (error instanceof SkillsMarketHubApiError)
    return error.message;
  if (error instanceof Error)
    return error.message;
  return String(error);
}
var MarketController = class {
  state = initialState;
  listeners = /* @__PURE__ */ new Set();
  listAbort = null;
  detailAbort = null;
  fileAbort = null;
  installedAbort = null;
  discoverAbort = null;
  searchTimer = null;
  noticeTimer = null;
  /**
   * Which sections have already answered a read.
   *
   * The panel opens on Discover, so the market list is no longer fetched on mount
   * — a reader who never opens that tab never pays for it. That makes "has this
   * section been read yet" a real question, and it is tracked separately from the
   * data because an empty *successful* answer is a completed read, while a failed
   * one must be retried the next time the tab is entered rather than cached as a
   * blank page for the session.
   */
  loaded = { discover: false, market: false };
  /**
   * The author pinned by the confirmation the reader is looking at.
   *
   * Held outside the published state because it is not something the UI renders;
   * it is the answer to "which author did the reader mean", consumed once by
   * {@link confirmInstall}.
   */
  pendingOwner = null;
  // ── Store plumbing ────────────────────────────────────────────────────────
  getSnapshot = () => this.state;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  commit(patch) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners)
      listener();
  }
  /** Release every pending request and timer. Called when the panel unmounts. */
  dispose() {
    this.listAbort?.abort();
    this.detailAbort?.abort();
    this.fileAbort?.abort();
    this.installedAbort?.abort();
    this.discoverAbort?.abort();
    if (this.searchTimer !== null)
      clearTimeout(this.searchTimer);
    if (this.noticeTimer !== null)
      clearTimeout(this.noticeTimer);
    this.listeners.clear();
  }
  notify(tone, text) {
    if (this.noticeTimer !== null)
      clearTimeout(this.noticeTimer);
    this.commit({ notice: { tone, text } });
    this.noticeTimer = setTimeout(() => {
      this.commit({ notice: null });
    }, tone === "error" ? 8e3 : 4e3);
  }
  // ── Section ───────────────────────────────────────────────────────────────
  /**
   * Read whatever the panel's current section needs, once.
   *
   * Called on mount rather than from an effect that names a section: the panel
   * decides what to open on, and duplicating that choice here would be a second
   * place to keep in step.
   */
  start() {
    this.enter(this.state.section);
  }
  setSection(section) {
    if (this.state.section === section)
      return;
    this.commit({ section });
    this.enter(section);
  }
  /** Fetch the data a section needs, if it has not already been read. */
  enter(section) {
    if (section === "discover" && !this.loaded.discover)
      void this.loadDiscover();
    if (section === "market" && !this.loaded.market)
      void this.load();
    if (section === "installed")
      void this.loadInventory();
  }
  // ── Discover ──────────────────────────────────────────────────────────────
  /**
   * Read the shelves. Errors are reported, never thrown at the render path.
   *
   * @param options.refresh - ask the host to bypass its cache. The host caches the
   *   three upstream pages behind this endpoint, so without this a refresh would
   *   re-render the same shelves while claiming to have gone and looked.
   */
  async loadDiscover(options = {}) {
    this.discoverAbort?.abort();
    const controller = new AbortController();
    this.discoverAbort = controller;
    this.commit({ discoverLoading: true, discoverError: null });
    try {
      const result = await fetchDiscover(controller.signal, options);
      if (controller.signal.aborted)
        return;
      this.loaded.discover = true;
      this.commit({
        discover: result.collections,
        // A refresh can drop the shelf the reader was on — the host decides which
        // shelves exist — so the selection falls back to the first one rather than
        // pointing at nothing.
        discoverActive: result.collections.some((entry) => entry.id === this.state.discoverActive) ? this.state.discoverActive : result.collections[0]?.id ?? this.state.discoverActive,
        discoverLoading: false,
        discoverError: null,
        discoverSources: result.sources
      });
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted)
        return;
      this.commit({ discoverLoading: false, discoverError: messageOf(error) });
    }
  }
  setDiscoverActive(id) {
    if (this.state.discoverActive === id)
      return;
    this.commit({ discoverActive: id });
  }
  // ── List ──────────────────────────────────────────────────────────────────
  /** Load (or reload) the first page under the current filters. */
  async load(options = {}) {
    this.listAbort?.abort();
    const controller = new AbortController();
    this.listAbort = controller;
    this.commit({ loading: true, error: null, nextCursor: null });
    const query = {
      ...this.state.filters.q === "" ? {} : { q: this.state.filters.q },
      source: this.state.filters.source,
      security: this.state.filters.security,
      installed: this.state.filters.installed,
      limit: PAGE_SIZE
    };
    try {
      const result = await fetchMarketList(query, controller.signal, options.refresh === true ? { refresh: true } : {});
      if (controller.signal.aborted)
        return;
      this.loaded.market = true;
      this.commit({
        items: result.items,
        nextCursor: result.nextCursor,
        sources: result.sources,
        itemStatuses: result.sources,
        loading: false,
        error: null
      });
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted)
        return;
      this.commit({ loading: false, error: messageOf(error), items: [], nextCursor: null });
    }
  }
  /**
   * Append the next page.
   *
   * Guarded by the cursor rather than by the caller: a scroll handler that fires
   * several times during one fetch must not stack the same page into the list
   * three times.
   */
  async loadMore() {
    const cursor = this.state.nextCursor;
    if (cursor === null || this.state.loading || this.state.loadingMore)
      return;
    const controller = new AbortController();
    this.listAbort = controller;
    this.commit({ loadingMore: true, nextCursor: null });
    const query = {
      ...this.state.filters.q === "" ? {} : { q: this.state.filters.q },
      source: this.state.filters.source,
      security: this.state.filters.security,
      installed: this.state.filters.installed,
      limit: PAGE_SIZE,
      cursor
    };
    try {
      const result = await fetchMarketList(query, controller.signal);
      if (controller.signal.aborted)
        return;
      const known = new Set(this.state.items.map((item) => item.id));
      const appended = result.items.filter((item) => !known.has(item.id));
      this.commit({
        items: [...this.state.items, ...appended],
        nextCursor: result.nextCursor,
        sources: result.sources,
        itemStatuses: { ...this.state.itemStatuses, ...result.sources },
        loadingMore: false
      });
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted)
        return;
      this.commit({ loadingMore: false, nextCursor: cursor, error: messageOf(error) });
    }
  }
  /** Type into the search box; the query is committed after the debounce. */
  setSearchDraft(value) {
    this.commit({ searchDraft: value });
    if (this.searchTimer !== null)
      clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      if (this.state.filters.q === value.trim())
        return;
      this.commit({ filters: { ...this.state.filters, q: value.trim() } });
      void this.load();
    }, SEARCH_DEBOUNCE_MS);
  }
  /** Submit the search box immediately, skipping the debounce. */
  submitSearch() {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    const value = this.state.searchDraft.trim();
    if (this.state.filters.q === value)
      return;
    this.commit({ filters: { ...this.state.filters, q: value } });
    void this.load();
  }
  clearSearch() {
    this.setSearchDraft("");
  }
  setFilter(patch) {
    this.commit({ filters: { ...this.state.filters, ...patch } });
    void this.load();
  }
  clearFilters() {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.commit({
      searchDraft: "",
      filters: { q: "", source: "all", security: "all", installed: "all" }
    });
    void this.load();
  }
  /** Reload from upstream, bypassing the host's cache where the caller can. */
  refresh() {
    if (this.state.section === "installed") {
      void this.loadInventory();
      return;
    }
    if (this.state.section === "discover") {
      void this.loadDiscover({ refresh: true });
      return;
    }
    void this.load({ refresh: true });
  }
  // ── Detail ────────────────────────────────────────────────────────────────
  async openDetail(id, options = {}) {
    this.detailAbort?.abort();
    const controller = new AbortController();
    this.detailAbort = controller;
    this.commit({
      view: { kind: "detail", id },
      detail: null,
      // The pin is remembered even before the response arrives, so an install
      // triggered from a fast click still names the right author.
      detailOwner: options.owner ?? null,
      detailLoading: true,
      detailError: null,
      detailTab: "overview",
      file: null,
      fileError: null
    });
    try {
      const result = await fetchSkillDetail(id, controller.signal, options);
      if (controller.signal.aborted)
        return;
      this.commit({ detail: result.skill, detailLoading: false });
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted)
        return;
      this.commit({ detailLoading: false, detailError: messageOf(error) });
    }
  }
  /** Return to the list, cancelling any in-flight detail work. */
  closeDetail() {
    this.detailAbort?.abort();
    this.fileAbort?.abort();
    this.commit({
      view: { kind: "list" },
      detail: null,
      detailOwner: null,
      detailError: null,
      detailLoading: false,
      file: null,
      fileError: null,
      fileLoading: false
    });
  }
  setDetailTab(tab) {
    if (this.state.detailTab === tab)
      return;
    this.commit({ detailTab: tab, file: null, fileError: null });
    if (tab === "files") {
      const first = this.state.detail?.files.find((file) => !file.tooBig);
      if (first !== void 0)
        void this.selectMarketFile(first.path);
    }
  }
  /** Load one file of the skill currently open in the detail view. */
  async selectMarketFile(path) {
    const view = this.state.view;
    const detail = this.state.detail;
    if (view.kind !== "detail" || detail === null)
      return;
    if (this.state.file?.path === path && this.state.fileError === null)
      return;
    this.fileAbort?.abort();
    const controller = new AbortController();
    this.fileAbort = controller;
    this.commit({ fileLoading: true, fileError: null, file: null });
    try {
      const file = await fetchSkillFile(view.id, path, controller.signal, detail.author.handle);
      if (controller.signal.aborted)
        return;
      this.commit({ file, fileLoading: false });
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted)
        return;
      this.commit({ fileLoading: false, fileError: messageOf(error) });
    }
  }
  // ── Install ───────────────────────────────────────────────────────────────
  /** Ask for confirmation before writing anything to disk. */
  requestInstall(id, owner) {
    this.pendingOwner = owner ?? null;
    this.commit({ confirmInstallId: id });
  }
  cancelInstall() {
    this.pendingOwner = null;
    this.commit({ confirmInstallId: null });
  }
  /** Perform the install the reader confirmed. */
  async confirmInstall() {
    const id = this.state.confirmInstallId;
    if (id === null)
      return;
    const pinned = this.pendingOwner ?? this.state.detailOwner;
    const owner = pinned === null || pinned === void 0 || pinned === "" ? void 0 : pinned;
    this.pendingOwner = null;
    this.commit({
      confirmInstallId: null,
      installingIds: [...this.state.installingIds, id]
    });
    try {
      await installSkill(id, owner);
      this.notify("success", `\u5DF2\u5B89\u88C5 ${id}`);
      const asInstalled = (item) => item.id === id ? { ...item, installState: "installed", installedInfo: { dirName: item.slug } } : item;
      this.commit({
        items: this.state.items.map(asInstalled),
        // Discover is where most installs start now, and a shelf still offering
        // "Install" for something already on disk would invite a second attempt the
        // host refuses with a 409.
        discover: this.state.discover.map((collection) => ({
          ...collection,
          items: collection.items.map(asInstalled)
        })),
        detail: this.state.detail?.id === id ? { ...this.state.detail, installState: "installed", installedInfo: { dirName: this.state.detail.slug } } : this.state.detail,
        installingIds: this.state.installingIds.filter((candidate) => candidate !== id)
      });
    } catch (error) {
      this.commit({ installingIds: this.state.installingIds.filter((candidate) => candidate !== id) });
      this.notify("error", messageOf(error));
    }
  }
  // ── Installed inventory ───────────────────────────────────────────────────
  /** Read the local inventory from disk. */
  async loadInventory() {
    this.installedAbort?.abort();
    const controller = new AbortController();
    this.installedAbort = controller;
    this.commit({ inventoryLoading: true, inventoryError: null });
    try {
      const items = await fetchInstalled(controller.signal);
      if (controller.signal.aborted)
        return;
      this.commit({ inventory: items, inventoryLoading: false });
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted)
        return;
      this.commit({ inventoryLoading: false, inventoryError: messageOf(error) });
    }
  }
  /** Open one installed entry's document and file list. */
  async openInstalledDetail(key) {
    this.fileAbort?.abort();
    const controller = new AbortController();
    this.fileAbort = controller;
    this.commit({ installedDetailLoading: true, installedDetailError: null, installedDetail: null });
    try {
      const detail = await fetchInstalledDetail(key, controller.signal);
      if (controller.signal.aborted)
        return;
      this.commit({ installedDetail: detail, installedDetailLoading: false });
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted)
        return;
      this.commit({ installedDetailLoading: false, installedDetailError: messageOf(error) });
    }
  }
  closeInstalledDetail() {
    this.fileAbort?.abort();
    this.commit({ installedDetail: null, installedDetailError: null, installedDetailLoading: false });
  }
  /** Load one file of the installed entry currently open. */
  async selectInstalledFile(path) {
    const detail = this.state.installedDetail;
    if (detail === null)
      return;
    if (this.state.file?.path === path && this.state.fileError === null)
      return;
    this.fileAbort?.abort();
    const controller = new AbortController();
    this.fileAbort = controller;
    this.commit({ fileLoading: true, fileError: null, file: null });
    try {
      const file = await fetchInstalledFile(detail.item.key, path, controller.signal);
      if (controller.signal.aborted)
        return;
      this.commit({ file, fileLoading: false });
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted)
        return;
      this.commit({ fileLoading: false, fileError: messageOf(error) });
    }
  }
  requestRemove(key) {
    this.commit({ confirmRemoveKey: key });
  }
  cancelRemove() {
    this.commit({ confirmRemoveKey: null });
  }
  /** Remove the entry the reader confirmed, then re-read the inventory. */
  async confirmRemove() {
    const key = this.state.confirmRemoveKey;
    if (key === null)
      return;
    this.commit({ confirmRemoveKey: null });
    try {
      await removeInstalled(key);
      this.notify("success", "\u5DF2\u5378\u8F7D");
      this.commit({ installedDetail: null });
      await this.loadInventory();
    } catch (error) {
      this.notify("error", messageOf(error));
    }
  }
  dismissNotice() {
    if (this.noticeTimer !== null)
      clearTimeout(this.noticeTimer);
    this.commit({ notice: null });
  }
};
function createMarketController() {
  return new MarketController();
}

// lib/client/page/MarketPage.js
var SECTION_TABS = [
  { id: "discover", labelKey: "tabDiscover" },
  { id: "market", labelKey: "tabMarket" },
  { id: "installed", labelKey: "tabInstalled" }
];
function installTargetOf(state) {
  const id = state.confirmInstallId;
  if (id === null)
    return void 0;
  return state.discover.flatMap((collection) => collection.items).find((item) => item.id === id) ?? state.items.find((item) => item.id === id) ?? (state.detail?.id === id ? state.detail : void 0);
}
function MarketPage({ t }) {
  const locale = useMarketLocale();
  return (0, import_jsx_runtime9.jsx)(TranslateProvider, { t, locale, children: (0, import_jsx_runtime9.jsx)(MarketPanel, {}) });
}
function MarketPanel() {
  const t = useT();
  const controller = (0, import_react9.useMemo)(() => createMarketController(), []);
  const state = (0, import_react9.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const scrollRef = (0, import_react9.useRef)(null);
  (0, import_react9.useEffect)(() => {
    controller.start();
    return () => {
      controller.dispose();
    };
  }, [controller]);
  (0, import_react9.useEffect)(() => {
    if (state.section === "installed" && state.inventory.length === 0 && !state.inventoryLoading) {
      void controller.loadInventory();
    }
  }, [controller, state.section, state.inventory.length, state.inventoryLoading]);
  const onLoadMore = (0, import_react9.useCallback)(() => {
    void controller.loadMore();
  }, [controller]);
  const onOpen = (0, import_react9.useCallback)((skill) => {
    void controller.openDetail(skill.id, { owner: skill.author.handle });
  }, [controller]);
  const confirmTarget = installTargetOf(state);
  const removeTarget = state.inventory.find((item) => item.key === state.confirmRemoveKey) ?? (state.installedDetail?.item.key === state.confirmRemoveKey ? state.installedDetail.item : void 0);
  const showingDetail = state.view.kind === "detail" && state.section !== "installed";
  const busy = state.section === "discover" ? state.discoverLoading : state.section === "installed" ? state.inventoryLoading : state.loading;
  return (0, import_jsx_runtime9.jsxs)("div", { style: { ...shellStyle, position: "relative" }, children: [(0, import_jsx_runtime9.jsxs)("header", { style: headerStyle, children: [(0, import_jsx_runtime9.jsxs)("div", { style: { minWidth: 0 }, children: [(0, import_jsx_runtime9.jsx)("h1", { style: titleStyle, children: t("title") }), (0, import_jsx_runtime9.jsx)("p", { style: subtitleStyle, children: t("subtitle") })] }), (0, import_jsx_runtime9.jsx)(Button, { onClick: () => {
    controller.refresh();
  }, disabled: busy, title: busy ? t("loading") : void 0, children: busy ? t("loading") : t("refresh") })] }), (0, import_jsx_runtime9.jsx)("div", { style: { padding: `0 ${SPACE.xl}px ${SPACE.md}px` }, children: (0, import_jsx_runtime9.jsx)("div", { role: "tablist", style: { display: "flex", gap: SPACE.xs, borderBottom: `1px solid ${token.borderL1}` }, children: SECTION_TABS.map((entry) => (0, import_jsx_runtime9.jsx)("button", { role: "tab", type: "button", "aria-selected": state.section === entry.id, onClick: () => {
    controller.setSection(entry.id);
  }, style: {
    font: "inherit",
    fontSize: 13,
    padding: "6px 14px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: state.section === entry.id ? token.labelPrimary : token.labelSecondary,
    borderBottom: `2px solid ${state.section === entry.id ? token.brand : "transparent"}`,
    fontWeight: state.section === entry.id ? 600 : 400
  }, children: t(entry.labelKey) }, entry.id)) }) }), (0, import_jsx_runtime9.jsx)("div", { ref: scrollRef, style: bodyStyle, children: showingDetail ? (0, import_jsx_runtime9.jsx)(MarketDetail, { detail: state.detail, loading: state.detailLoading, error: state.detailError, tab: state.detailTab, file: state.file, fileLoading: state.fileLoading, fileError: state.fileError, busy: state.detail !== null && state.installingIds.includes(state.detail.id), onBack: () => {
    controller.closeDetail();
  }, onSetTab: (tab) => {
    controller.setDetailTab(tab);
  }, onSelectFile: (path) => {
    void controller.selectMarketFile(path);
  }, onInstall: () => {
    if (state.detail !== null)
      controller.requestInstall(state.detail.id, state.detailOwner ?? void 0);
  }, onRetry: () => {
    if (state.view.kind === "detail")
      void controller.openDetail(state.view.id);
  } }) : state.section === "installed" ? (0, import_jsx_runtime9.jsx)(InstalledPanel, { items: state.inventory, loading: state.inventoryLoading, error: state.inventoryError, detail: state.installedDetail, detailLoading: state.installedDetailLoading, detailError: state.installedDetailError, file: state.file, fileLoading: state.fileLoading, fileError: state.fileError, onRefresh: () => {
    void controller.loadInventory();
  }, onOpen: (key) => {
    void controller.openInstalledDetail(key);
  }, onCloseDetail: () => {
    controller.closeInstalledDetail();
  }, onSelectFile: (path) => {
    void controller.selectInstalledFile(path);
  }, onRequestRemove: (key) => {
    controller.requestRemove(key);
  } }) : state.section === "discover" ? (0, import_jsx_runtime9.jsx)(DiscoverPanel, {
    collections: state.discover,
    active: state.discoverActive,
    loading: state.discoverLoading,
    error: state.discoverError,
    installingIds: state.installingIds,
    sources: state.discoverSources,
    onSelect: (id) => {
      controller.setDiscoverActive(id);
    },
    onOpen,
    onInstall: (skill) => {
      controller.requestInstall(skill.id, skill.author.handle);
    },
    onRefresh: () => {
      controller.refresh();
    },
    // "Find more" hands the reader to the market *and* puts the
    // query back in its starting state: arriving from a shelf with
    // a stale search box would show them a filtered market they
    // never asked for.
    onFindMore: () => {
      controller.clearFilters();
      controller.setSection("market");
    }
  }) : (0, import_jsx_runtime9.jsx)(MarketList, { state, scrollRoot: scrollRef, onOpen, onInstall: (skill) => {
    controller.requestInstall(skill.id, skill.author.handle);
  }, onLoadMore, onSearchDraft: (value) => {
    controller.setSearchDraft(value);
  }, onSubmitSearch: () => {
    controller.submitSearch();
  }, onClearFilters: () => {
    controller.clearFilters();
  }, onSetSource: (source) => {
    controller.setFilter({ source });
  }, onSetSecurity: (security) => {
    controller.setFilter({ security });
  }, onSetInstalled: (installed) => {
    controller.setFilter({ installed });
  }, onRetry: () => {
    controller.refresh();
  } }) }), confirmTarget === void 0 ? null : (0, import_jsx_runtime9.jsx)(ConfirmInstallDialog, { name: confirmTarget.name, source: confirmTarget.source, owner: confirmTarget.author.handle, version: confirmTarget.version, securityLabel: t(securityLabelKeyOf(confirmTarget.securityStatus)), requiresKey: confirmTarget.requiresApiKey === true, busy: state.installingIds.includes(confirmTarget.id), onCancel: () => {
    controller.cancelInstall();
  }, onConfirm: () => {
    void controller.confirmInstall();
  } }), removeTarget === void 0 ? null : (0, import_jsx_runtime9.jsx)(ConfirmRemoveDialog, { name: removeTarget.name, dirPath: removeTarget.dirPath, busy: state.inventoryLoading, onCancel: () => {
    controller.cancelRemove();
  }, onConfirm: () => {
    void controller.confirmRemove();
  } }), state.notice === null ? null : (0, import_jsx_runtime9.jsx)(NoticeToast, { tone: state.notice.tone, text: state.notice.text, onDismiss: () => {
    controller.dismissNotice();
  } })] });
}
function securityLabelKeyOf(status) {
  if (status === "verified")
    return "securityVerified";
  if (status === "benign")
    return "securityBenign";
  if (status === "flagged")
    return "securityFlagged";
  return "securityUnknown";
}

// lib/client/icons.js
var import_jsx_runtime10 = require("react/jsx-runtime");
function SkillsMarketIcon({ size, active: active2 }) {
  return (0, import_jsx_runtime10.jsxs)("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: active2 ? 2 : 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", focusable: "false", children: [(0, import_jsx_runtime10.jsx)("path", { d: "M3.6 9.2 5.1 4.6h13.8l1.5 4.6" }), (0, import_jsx_runtime10.jsx)("path", { d: "M3.6 9.2c0 1.5 1.2 2.6 2.7 2.6s2.7-1.1 2.7-2.6c0 1.5 1.2 2.6 2.7 2.6s2.7-1.1 2.7-2.6c0 1.5 1.2 2.6 2.7 2.6s2.7-1.1 2.7-2.6" }), (0, import_jsx_runtime10.jsx)("path", { d: "M5.4 13.4v6.1h13.2v-6.1" }), (0, import_jsx_runtime10.jsx)("path", { d: "M9.4 19.5v-4.4h5.2v4.4" })] });
}

// lib/client/locales.js
var NS = "skillsMarketHub";
var zh = {
  panel: "\u6280\u80FD\u5E02\u573A",
  title: "\u6280\u80FD\u5E02\u573A",
  subtitle: "\u6D4F\u89C8\u5E76\u5B89\u88C5 ClawHub \u4E0E SkillHub \u4E0A\u7684\u7B2C\u4E09\u65B9\u6280\u80FD",
  tabDiscover: "\u53D1\u73B0",
  tabMarket: "\u5E02\u573A",
  tabInstalled: "\u5DF2\u5B89\u88C5",
  discoverTitle: "\u53D1\u73B0",
  discoverFeatured: "\u7CBE\u9009",
  discoverTrending: "\u70ED\u95E8",
  discoverOfficial: "\u5B98\u65B9",
  discoverNewest: "\u65B0\u53D1\u5E03",
  discoverInstalls: "\u88C5\u673A\u6700\u591A",
  // Two keys per shelf, and the split is deliberate: the line under the tabs is a
  // signpost and has to stay one line, while the rule behind the ranking is what
  // the reader needs when they doubt the shelf — so it lives on the tab's tooltip
  // and in the empty state, where someone is actually asking "why?".
  discoverFeaturedHint: "\u4E09\u4E2A\u7EF4\u5EA6\u91CC\u8FDB\u4E24\u4E2A\u624D\u4E0A\u699C",
  discoverFeaturedRule: "\u5728\u300C\u4E0B\u8F7D\u300D\u300C\u5B89\u88C5\u300D\u300C\u6536\u85CF\u300D\u4E09\u4E2A\u6392\u5E8F\u91CC\u90FD\u6392\u8FDB\u524D\u5217\u7684\u6280\u80FD\uFF1A\u6BCF\u8FDB\u4E00\u6B21\u524D 20 \u540D\u5F97\u4E00\u7968\uFF0C\u4E24\u7968\u624D\u4E0A\u699C\uFF0C\u5148\u6309\u7968\u6570\u3001\u518D\u6309\u6700\u597D\u540D\u6B21\u6392\u3002\u6240\u4EE5\u5B83\u662F\u300C\u88AB\u53D6\u8D70\u3001\u88AB\u7528\u8D77\u6765\u3001\u88AB\u7559\u4E0B\u6765\u300D\u90FD\u6210\u7ACB\u7684\u90A3\u4E00\u6279 \u2014\u2014 \u8FD9\u662F\u5BF9\u6CE8\u518C\u8868\u5DF2\u516C\u5E03\u6570\u5B57\u7684\u6C47\u603B\uFF0C\u4E0D\u662F\u7F16\u8F91\u6311\u9009\u3002",
  discoverTrendingHint: "\u5404\u6CE8\u518C\u8868\u81EA\u5DF1\u7684\u70ED\u5EA6\u699C\uFF0C\u4E24\u8FB9\u4EA4\u66FF",
  discoverTrendingRule: "ClawHub \u7528\u5B83\u53D1\u5E03\u7684 trending \u7D22\u5F15\uFF1BSkillHub \u7684\u5217\u8868\u63A5\u53E3\u6CA1\u6709\u6392\u5E8F\u53C2\u6570\uFF0C\u56E0\u6B64\u6309\u5B89\u88C5\u91CF\u6392\u5217\u3002\u4E24\u4E2A\u6CE8\u518C\u8868\u7684\u7ED3\u679C\u4EA4\u66FF\u5C55\u793A\uFF0C\u8C01\u4E5F\u4E0D\u6392\u5728\u8C01\u540E\u9762\u3002",
  discoverOfficialHint: "\u6CE8\u518C\u8868\u81EA\u5DF1\u6807\u8BB0\u4E3A\u300C\u5DF2\u8BA4\u8BC1\u300D",
  discoverOfficialRule: "\u6765\u6E90\u662F\u6CE8\u518C\u8868\u81EA\u5DF1\u7684\u8BA4\u8BC1\u6807\u8BB0\u3002\u4E24\u4E2A\u6CE8\u518C\u8868\u90FD\u6781\u5C11\u7ED9\u51FA\u5B83 \u2014\u2014 SkillHub \u9996\u9875\u7EA6\u767E\u4E2D\u6709\u4E00\uFF0CClawHub \u53EA\u5728\u641C\u7D22\u63A5\u53E3\u58F0\u660E\u3001\u5217\u8868\u63A5\u53E3\u5B8C\u5168\u4E0D\u8FD4\u56DE\uFF0C\u4E5F\u6CA1\u6709\u7AEF\u70B9\u80FD\u679A\u4E3E\u5B98\u65B9\u53D1\u5E03\u8005\u3002\u6240\u4EE5\u8FD9\u4E00\u680F\u5E38\u5E38\u5F88\u77ED\u751A\u81F3\u4E3A\u7A7A\uFF0C\u8FD9\u662F\u6CE8\u518C\u8868\u7684\u4E8B\u5B9E\uFF0C\u4E0D\u7528\u8FD1\u4F3C\u6761\u76EE\u51D1\u6570\u3002",
  discoverNewestHint: "\u5404\u6CE8\u518C\u8868\u6700\u65B0\u53D1\u5E03\uFF0C\u4E24\u8FB9\u4EA4\u66FF",
  discoverNewestRule: "ClawHub \u7528\u5B83\u53D1\u5E03\u7684 newest \u7D22\u5F15\uFF1BSkillHub \u6309\u6700\u540E\u66F4\u65B0\u65F6\u95F4\u6392\u5217\u3002\u4E24\u4E2A\u6CE8\u518C\u8868\u7684\u7ED3\u679C\u4EA4\u66FF\u5C55\u793A\u3002",
  discoverInstallsHint: "\u6309\u6CE8\u518C\u8868\u516C\u5E03\u7684\u5B89\u88C5\u91CF",
  discoverInstallsRule: "\u4E0B\u8F7D\u91CF\u8BB0\u5F55\u300C\u53D6\u8D70\u526F\u672C\u7684\u4EBA\u300D\uFF0C\u5B89\u88C5\u91CF\u8BB0\u5F55\u300C\u771F\u7684\u628A\u5B83\u7528\u8D77\u6765\u7684\u4EBA\u300D\u2014\u2014 \u540E\u8005\u662F\u552F\u4E00\u4E00\u4E2A\u4E24\u4E2A\u6CE8\u518C\u8868\u90FD\u53D1\u5E03\u3001\u53C8\u80FD\u6A2A\u8DE8\u4E24\u8FB9\u6BD4\u8F83\u7684\u6D41\u91CF\u6307\u6807\u3002",
  discoverColumnSkill: "\u6280\u80FD",
  discoverColumnDownloads: "\u4E0B\u8F7D\u91CF",
  discoverColumnInstalls: "\u5B89\u88C5\u91CF",
  discoverColumnStars: "\u6536\u85CF",
  discoverColumnUpdated: "\u66F4\u65B0\u4E8E",
  discoverVerified: "\u5DF2\u8BA4\u8BC1",
  discoverLoading: "\u6B63\u5728\u4ECE\u4E24\u4E2A\u6CE8\u518C\u8868\u8BFB\u53D6\u699C\u5355\u2026",
  discoverFindMore: "\u5230\u5E02\u573A\u91CC\u67E5\u627E\u66F4\u591A",
  discoverShelfEmpty: "\u8FD9\u4E00\u680F\u6682\u65F6\u662F\u7A7A\u7684",
  discoverEmpty: "\u6682\u65F6\u6CA1\u6709\u53EF\u63A8\u8350\u7684\u5185\u5BB9",
  discoverEmptyHint: "\u6CE8\u518C\u8868\u6CA1\u6709\u8FD4\u56DE\u4EFB\u4F55\u6761\u76EE\uFF0C\u53EF\u4EE5\u70B9\u4E0A\u9762\u7684\u300C\u5237\u65B0\u300D\u91CD\u8BD5\uFF0C\u6216\u76F4\u63A5\u5230\u300C\u5E02\u573A\u300D\u91CC\u6D4F\u89C8\u3002",
  discoverDegraded: "\u4E0A\u6E38\u672A\u6B63\u5E38\u54CD\u5E94\uFF1A",
  discoverDegradedHint: "\u8BE5\u6CE8\u518C\u8868\u8FD9\u6B21\u6CA1\u6709\u6B63\u5E38\u8FD4\u56DE\uFF0C\u6240\u4EE5\u8FD9\u91CC\u7684\u7ED3\u679C\u53EF\u80FD\u6BD4\u5E73\u65F6\u5C11\u3002",
  search: "\u641C\u7D22\u6280\u80FD\u2026",
  refresh: "\u5237\u65B0",
  loading: "\u52A0\u8F7D\u4E2D\u2026",
  retry: "\u91CD\u8BD5",
  empty: "\u6CA1\u6709\u627E\u5230\u5339\u914D\u7684\u6280\u80FD",
  emptyHint: "\u6362\u4E2A\u5173\u952E\u8BCD\uFF0C\u6216\u6E05\u7A7A\u7B5B\u9009\u6761\u4EF6\u8BD5\u8BD5\u3002",
  clearFilters: "\u6E05\u7A7A\u7B5B\u9009",
  errorTitle: "\u52A0\u8F7D\u5931\u8D25",
  filterSource: "\u6765\u6E90",
  filterSecurity: "\u5B89\u5168",
  filterInstalled: "\u5B89\u88C5\u72B6\u6001",
  sourceAll: "\u5168\u90E8\u6765\u6E90",
  securityAll: "\u5168\u90E8\u5B89\u5168\u7B49\u7EA7",
  securityVerified: "\u5DF2\u6838\u9A8C",
  securityBenign: "\u672A\u89C1\u5F02\u5E38",
  securityUnknown: "\u672A\u77E5",
  securityFlagged: "\u6709\u98CE\u9669",
  installedAll: "\u5168\u90E8\u5B89\u88C5\u72B6\u6001",
  installedOnly: "\u5DF2\u5B89\u88C5",
  installedInstallable: "\u672A\u5B89\u88C5",
  filterSourceHint: "\u53EA\u770B\u67D0\u4E00\u4E2A\u6CE8\u518C\u8868\uFF1AClawHub \u6216 SkillHub\u3002",
  filterSecurityHint: "\u6309\u4E0A\u6E38\u6CE8\u518C\u8868\u7ED9\u51FA\u7684\u5B89\u5168\u7ED3\u8BBA\u7B5B\u9009\uFF1B\u300C\u672A\u77E5\u300D\u8868\u793A\u6CE8\u518C\u8868\u6CA1\u6709\u53D1\u5E03\u626B\u63CF\u7ED3\u679C\u3002",
  filterInstalledHint: "\u6309\u672C\u673A\u662F\u5426\u5DF2\u7ECF\u88C5\u4E86\u5B83\u6765\u7B5B\u9009\u3002",
  install: "\u5B89\u88C5",
  installing: "\u5B89\u88C5\u4E2D\u2026",
  installed: "\u5DF2\u5B89\u88C5",
  notInstallable: "\u4E0D\u53EF\u5B89\u88C5",
  uninstall: "\u5378\u8F7D",
  uninstalling: "\u5378\u8F7D\u4E2D\u2026",
  uninstallDisabled: "\u5F53\u524D\u914D\u7F6E\u7981\u6B62\u5378\u8F7D",
  cancel: "\u53D6\u6D88",
  confirm: "\u786E\u8BA4",
  close: "\u5173\u95ED",
  back: "\u8FD4\u56DE",
  installTitle: "\u5B89\u88C5\u6280\u80FD",
  installConfirm: "\u786E\u8BA4\u5B89\u88C5",
  uninstallTitle: "\u5378\u8F7D\u6280\u80FD",
  uninstallConfirm: "\u786E\u8BA4\u5378\u8F7D",
  installSource: "\u6765\u6E90",
  installSecurity: "\u5B89\u5168\u7ED3\u8BBA",
  installPath: "\u5B89\u88C5\u4F4D\u7F6E",
  installRequiresKeyHint: "\u8BE5\u6280\u80FD\u8FD0\u884C\u9700\u8981\u81EA\u5907 API Key",
  installAcknowledge: "\u6211\u4E86\u89E3\u8FD9\u662F\u7B2C\u4E09\u65B9\u6280\u80FD\uFF0C\u5176\u5185\u5BB9\u4F1A\u8FDB\u5165\u6A21\u578B\u4E0A\u4E0B\u6587\uFF0C\u4E14\u6211\u4F1A\u81EA\u884C\u5224\u65AD\u662F\u5426\u9075\u5FAA\u5176\u4E2D\u7684\u6307\u4EE4\u3002",
  installHint: "\u5B89\u88C5\u53EA\u4F1A\u628A\u6587\u4EF6\u5199\u5165\u6280\u80FD\u76EE\u5F55\uFF0C\u4E0D\u4F1A\u6267\u884C\u6280\u80FD\u91CC\u7684\u4EFB\u4F55\u811A\u672C\u3002",
  installedTitle: "\u5DF2\u5B89\u88C5\u6280\u80FD",
  installedSearch: "\u641C\u7D22\u672C\u673A\u6280\u80FD\u2026",
  installedManaged: "\u5E02\u573A\u5B89\u88C5",
  installedLocal: "\u672C\u5730",
  installedLinked: "\u94FE\u63A5",
  installedDocument: "\u6587\u6863",
  installedHeader: "\u5143\u6570\u636E",
  installedEmpty: "\u672C\u673A\u8FD8\u6CA1\u6709\u5B89\u88C5\u4EFB\u4F55\u6280\u80FD\u3002",
  installedEmptyHint: "\u5230\u300C\u5E02\u573A\u300D\u91CC\u6311\u4E00\u4E2A\u88C5\u8FDB\u6765\uFF0C\u6216\u624B\u52A8\u653E\u5230\u6280\u80FD\u76EE\u5F55\u3002",
  uninstallHint: "\u5378\u8F7D\u4F1A\u5220\u9664\u8FD9\u4E2A\u6280\u80FD\u7684\u76EE\u5F55\uFF0C\u4E14\u4E0D\u53EF\u64A4\u9500\u3002",
  installedFilterSource: "\u6309\u6765\u6E90\u7B5B\u9009",
  installedSourceAll: "\u5168\u90E8\u6765\u6E90",
  installedSourceLocal: "\u672C\u5730",
  installedFilterSourceHint: "\u6765\u6E90\u53D6\u81EA\u5B89\u88C5\u65F6\u5199\u5165\u7684\u6EAF\u6E90\u6587\u4EF6\uFF1B\u624B\u52A8\u653E\u5165\u7684\u6280\u80FD\u5F52\u4E3A\u300C\u672C\u5730\u300D\u3002",
  detailOverview: "\u6982\u89C8",
  detailFiles: "\u6587\u4EF6",
  detailSecurity: "\u5B89\u5168",
  detailChangelog: "\u66F4\u65B0\u65E5\u5FD7",
  detailAbout: "\u6280\u80FD\u8BF4\u660E",
  detailCategories: "\u5206\u7C7B",
  detailTags: "\u6807\u7B7E",
  detailVersion: "\u7248\u672C",
  detailDownloads: "\u4E0B\u8F7D",
  detailStars: "\u6536\u85CF",
  detailInstalls: "\u5B89\u88C5",
  detailDownloadsHint: "\u4E0A\u6E38\u6CE8\u518C\u8868\u8BB0\u5F55\u7684\u4E0B\u8F7D\u6B21\u6570\u3002",
  detailStarsHint: "\u4E0A\u6E38\u6CE8\u518C\u8868\u8BB0\u5F55\u7684\u6536\u85CF\uFF08star\uFF09\u6570\uFF1BSkillHub \u4E0A\u591A\u6570\u6280\u80FD\u4E3A 0\uFF0C\u90A3\u662F\u6CE8\u518C\u8868\u672C\u8EAB\u7684\u6570\u636E\u3002",
  detailUpdated: "\u66F4\u65B0",
  detailFileEmpty: "\u8FD9\u4E2A\u6280\u80FD\u6CA1\u6709\u53EF\u9884\u89C8\u7684\u6587\u4EF6",
  detailFileTooBig: "\u6587\u4EF6\u8D85\u8FC7\u9884\u89C8\u4F53\u79EF\u4E0A\u9650",
  detailFileTruncated: "\u5185\u5BB9\u5DF2\u622A\u65AD",
  detailPage: "\u5728\u5E02\u573A\u4E2D\u67E5\u770B",
  detailRequiresKey: "\u9700\u8981 API Key",
  detailNoDescription: "\u8BE5\u6280\u80FD\u6CA1\u6709\u63D0\u4F9B\u8BF4\u660E\u6B63\u6587",
  detailNoDescriptionHint: "\u53EF\u4EE5\u5230\u300C\u6587\u4EF6\u300D\u91CC\u76F4\u63A5\u67E5\u770B\u5B83\u7684 SKILL.md\u3002",
  securityReport: "\u67E5\u770B\u62A5\u544A",
  securityCaveat: "\u7ED3\u8BBA\u6765\u81EA\u4E0A\u6E38\u6CE8\u518C\u8868\uFF0C\u672C\u63D2\u4EF6\u4E0D\u4EE3\u4E3A\u80CC\u4E66\u3002"
};
var en = {
  panel: "Skills Market",
  title: "Skills Market",
  subtitle: "Browse and install third-party skills from ClawHub and SkillHub",
  tabDiscover: "Discover",
  tabMarket: "Market",
  tabInstalled: "Installed",
  discoverTitle: "Discover",
  discoverFeatured: "Featured",
  discoverTrending: "Trending",
  discoverOfficial: "Official",
  discoverNewest: "New",
  discoverInstalls: "Most installed",
  discoverFeaturedHint: "Two of three rankings, or it does not appear",
  discoverFeaturedRule: "Skills that place near the top of the downloads, installs and stars rankings at once: one vote per ranking they reach the top 20 of, two votes to appear, ordered by votes and then by best placement. It is a consensus over the numbers the registries publish \u2014 not an editor\u2019s pick.",
  discoverTrendingHint: "Each registry\u2019s own hot list, alternating",
  discoverTrendingRule: "ClawHub\u2019s published trending index; SkillHub\u2019s list endpoint takes no sort parameter at all, so its entries are ordered by installs. The two registries alternate, and neither is placed behind the other.",
  discoverOfficialHint: "Marked verified by the registry itself",
  discoverOfficialRule: "Sourced from the registry\u2019s own verification flag, which both publish rarely \u2014 roughly one entry in a hundred of SkillHub\u2019s top page, and ClawHub states it only on search results, never on the list endpoint this plugin browses. There is also no endpoint that enumerates official publishers. So this shelf is often short or empty; that is the registry\u2019s fact, and it is not padded.",
  discoverNewestHint: "Newest from each registry, alternating",
  discoverNewestRule: "ClawHub\u2019s published newest index; SkillHub ordered by last update. The two registries alternate.",
  discoverInstallsHint: "By the install count the registry publishes",
  discoverInstallsRule: "Downloads count everyone who took a copy; installs count those who put it to work. It is the only flow measure both registries publish and the only one comparable across the two.",
  discoverColumnSkill: "Skill",
  discoverColumnDownloads: "Downloads",
  discoverColumnInstalls: "Installs",
  discoverColumnStars: "Stars",
  discoverColumnUpdated: "Updated",
  discoverVerified: "Verified",
  discoverLoading: "Reading the shelves from both registries\u2026",
  discoverFindMore: "Find more in the market",
  discoverShelfEmpty: "This shelf is empty right now",
  discoverEmpty: "Nothing to recommend yet",
  discoverEmptyHint: "The registries returned nothing. Use Refresh above to try again, or browse the Market tab directly.",
  discoverDegraded: "Upstream not answering:",
  discoverDegradedHint: "That registry did not answer properly this time, so these shelves may be shorter than usual.",
  search: "Search skills\u2026",
  refresh: "Refresh",
  loading: "Loading\u2026",
  retry: "Retry",
  empty: "No matching skills",
  emptyHint: "Try another keyword, or clear the filters.",
  clearFilters: "Clear filters",
  errorTitle: "Failed to load",
  filterSource: "Source",
  filterSecurity: "Security",
  filterInstalled: "Install state",
  sourceAll: "All sources",
  securityAll: "Any verdict",
  securityVerified: "Verified",
  securityBenign: "No findings",
  securityUnknown: "Unknown",
  securityFlagged: "Flagged",
  installedAll: "Any state",
  installedOnly: "Installed",
  installedInstallable: "Not installed",
  filterSourceHint: "Show one registry only: ClawHub or SkillHub.",
  filterSecurityHint: 'Filter by the verdict the upstream registry published; "Unknown" means it published no scan.',
  filterInstalledHint: "Filter by whether this machine already has the skill.",
  install: "Install",
  installing: "Installing\u2026",
  installed: "Installed",
  notInstallable: "Not installable",
  uninstall: "Uninstall",
  uninstalling: "Uninstalling\u2026",
  uninstallDisabled: "Removal is disabled by configuration",
  cancel: "Cancel",
  confirm: "Confirm",
  close: "Close",
  back: "Back",
  installTitle: "Install skill",
  installConfirm: "Install",
  uninstallTitle: "Uninstall skill",
  uninstallConfirm: "Uninstall",
  installSource: "Source",
  installSecurity: "Security verdict",
  installPath: "Install location",
  installRequiresKeyHint: "This skill needs its own API key to run",
  installAcknowledge: "I understand this is a third-party skill, that its content enters the model context, and that following its instructions is my own decision.",
  installHint: "Installing only writes files into the skills directory; it never runs scripts from the skill.",
  installedTitle: "Installed skills",
  installedSearch: "Search local skills\u2026",
  installedManaged: "From market",
  installedLocal: "Local",
  installedLinked: "Linked",
  installedDocument: "Document",
  installedHeader: "Metadata",
  installedEmpty: "No skills are installed on this machine yet.",
  installedEmptyHint: "Install one from the Market tab, or drop one into the skills directory.",
  uninstallHint: "Uninstalling deletes this skill directory and cannot be undone.",
  installedFilterSource: "Filter by source",
  installedSourceAll: "All sources",
  installedSourceLocal: "Local",
  installedFilterSourceHint: 'The source comes from the provenance file written at install time; a skill dropped in by hand is "Local".',
  detailOverview: "Overview",
  detailFiles: "Files",
  detailSecurity: "Security",
  detailChangelog: "Changelog",
  detailAbout: "About this skill",
  detailCategories: "Categories",
  detailTags: "Tags",
  detailVersion: "Version",
  detailDownloads: "Downloads",
  detailStars: "Stars",
  detailInstalls: "Installs",
  detailDownloadsHint: "Downloads as the upstream registry counts them.",
  detailStarsHint: "Stars as the upstream registry counts them; most SkillHub entries are 0, which is the registry\u2019s own figure.",
  detailUpdated: "Updated",
  detailFileEmpty: "This skill has no previewable files",
  detailFileTooBig: "This file is over the preview size limit",
  detailFileTruncated: "Content truncated",
  detailPage: "View in market",
  detailRequiresKey: "Requires an API key",
  detailNoDescription: "This skill publishes no description body",
  detailNoDescriptionHint: "Open the Files tab to read its SKILL.md directly.",
  securityReport: "View report",
  securityCaveat: "Verdicts come from the upstream registry; this plugin does not endorse them."
};

// lib/client/index.js
var name = "skills-market-hub-client";
var inject = ["slots", "locale"];
var PANEL_ID = "skills-market-hub";
function apply(ctx) {
  const slots = ctx.slots;
  const locale = ctx.locale;
  ctx.effect(() => {
    const offZh = locale.register(NS, "zh", zh);
    const offEn = locale.register(NS, "en", en);
    installMarketLocale(locale.getLocale === void 0 || locale.subscribe === void 0 ? void 0 : {
      getLocale: () => locale.getLocale(),
      getSnapshot: () => locale.getSnapshot?.() ?? locale.getLocale(),
      subscribe: (fn) => locale.subscribe(fn)
    });
    return () => {
      resetMarketLocale();
      offEn();
      offZh();
    };
  }, "skills-market-hub: dictionaries");
  slots.inject("main", function* () {
    yield slots.register({ name: "main", key: PANEL_ID, locale: NS }, MarketPage);
  });
  slots.inject("sidebar.panellist", () => slots.register({ name: "sidebar.panellist", id: PANEL_ID, order: 20, locale: NS, label: () => PANEL_LABEL }, SkillsMarketIcon));
}
var PANEL_LABEL = "\u6280\u80FD\u5E02\u573A";
return module.exports; } });
//# sourceMappingURL=client.cjs.map

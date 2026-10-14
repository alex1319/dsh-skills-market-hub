/**
 * Panel chrome: the surfaces, fields, and controls every Skills Market view is
 * built from.
 *
 * Every colour, radius, and font here comes from a `--dsw-*` theme token, so the
 * panel follows the host's light and dark themes without shipping a stylesheet.
 * That is the reason the plugin has no CSS build step at all: a stylesheet would
 * need a compiler, a hashed class map kept byte-stable in version control, and a
 * runtime that injects it — three moving parts bought for zero visual gain over
 * inline styles built from the same tokens.
 *
 * `scripts/verify.mjs` fails the build on a hard-coded colour in this directory,
 * because a literal hex value cannot follow the theme.
 */
import { type CSSProperties, type ReactNode } from 'react';
export declare const token: {
    readonly bgBase: "var(--dsw-alias-bg-base)";
    readonly bgLayer1: "var(--dsw-alias-bg-layer-1)";
    readonly bgLayer2: "var(--dsw-alias-bg-layer-2)";
    readonly bgOverlay: "var(--dsw-alias-bg-overlay)";
    readonly borderL1: "var(--dsw-alias-border-l1)";
    readonly borderL2: "var(--dsw-alias-border-l2)";
    readonly labelPrimary: "var(--dsw-alias-label-primary)";
    readonly labelSecondary: "var(--dsw-alias-label-secondary)";
    readonly brand: "var(--dsw-alias-brand-primary)";
    readonly success: "var(--dsw-alias-state-success-primary)";
    readonly warn: "var(--dsw-alias-state-warn-primary)";
    readonly error: "var(--dsw-alias-state-error-primary)";
    readonly idle: "var(--dsw-alias-state-idle-primary)";
    readonly mono: "var(--dsw-font-mono)";
};
export declare const radius: {
    readonly xs: 4;
    readonly sm: 6;
    readonly md: 8;
    readonly lg: 14;
};
export declare const SPACE: {
    readonly xs: 4;
    readonly sm: 8;
    readonly md: 12;
    readonly lg: 16;
    readonly xl: 24;
};
export declare const shellStyle: CSSProperties;
export declare const headerStyle: CSSProperties;
export declare const titleStyle: CSSProperties;
export declare const subtitleStyle: CSSProperties;
export declare const bodyStyle: CSSProperties;
/** A raised surface: the card, the notice, the dialog body. */
export declare function surfaceStyle(overrides?: CSSProperties): CSSProperties;
export interface ButtonProps {
    children: ReactNode;
    onClick?: () => void;
    /** `primary` is the one confirming action on a surface; everything else is `ghost`. */
    variant?: 'primary' | 'ghost';
    disabled?: boolean;
    title?: string;
    type?: 'button' | 'submit';
    style?: CSSProperties;
}
/**
 * A panel button.
 *
 * A plain `<button>` with token-derived inline styles, rather than the shared
 * primitive kit: that kit's entry module statically imports a syntax highlighter,
 * a TeX renderer, and three dozen stylesheets, so pulling one button out of it
 * would put all of that in this plugin's bundle.
 */
export declare function Button({ children, onClick, variant, disabled, title, type, style }: ButtonProps): import("react").JSX.Element;
export interface TextFieldProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    onEnter?: () => void;
    ariaLabel: string;
    style?: CSSProperties;
}
/** One single-line text input. */
export declare function TextField({ value, onChange, placeholder, onEnter, ariaLabel, style }: TextFieldProps): import("react").JSX.Element;
export interface SelectFieldProps<T extends string> {
    value: T;
    options: ReadonlyArray<{
        value: T;
        label: string;
    }>;
    onChange: (value: T) => void;
    ariaLabel: string;
}
/** One closed-set dropdown, used for the filter bar. */
export declare function SelectField<T extends string>({ value, options, onChange, ariaLabel }: SelectFieldProps<T>): import("react").JSX.Element;
/** A small status pill: install state, security verdict, source. */
export declare function Pill({ children, tone, title }: {
    children: ReactNode;
    tone?: 'neutral' | 'ok' | 'warn' | 'error' | 'brand' | 'muted';
    title?: string;
}): import("react").JSX.Element;
/** A centred notice: empty list, failed load, or a hint. */
export declare function Notice({ title, detail, action }: {
    title: string;
    detail?: string;
    action?: ReactNode;
}): import("react").JSX.Element;
/**
 * A pulsing placeholder block.
 *
 * The pulse is driven by a CSS animation injected once per document, because an
 * inline style cannot express a keyframe. It is the only stylesheet this plugin
 * writes, and it carries no colour of its own.
 */
export declare function Skeleton({ height, count }: {
    height?: number;
    count?: number;
}): import("react").JSX.Element;
/** Monospace block for source text. */
export declare function SourceBlock({ text, wrap }: {
    text: string;
    wrap?: boolean;
}): import("react").JSX.Element;
/** Format a byte count the way a reader expects to read it. */
export declare function fileSizeText(bytes: number): string;
/** Format an epoch-millisecond timestamp as a short local date. */
export declare function shortDate(at: number | undefined): string | undefined;
/** Format a large count compactly (1.2k, 3.4M). */
export declare function countText(value: number): string;
//# sourceMappingURL=ui.d.ts.map
/**
 * The confirmation dialogs.
 *
 * Both dialogs exist because the action behind them touches the disk in a way the
 * user cannot undo from the panel: an install writes a directory, a removal
 * deletes one. Each names the exact thing it will act on — the registry and
 * author for an install, the absolute path for a removal — because "uninstall
 * demo" is ambiguous when two roots can both hold a `demo` directory.
 *
 * Focus is moved into the dialog on open, Tab is trapped inside it, and Escape
 * cancels. The trap is what keeps a keyboard user from reaching the install
 * button behind the mask.
 */
export interface ConfirmInstallDialogProps {
    name: string;
    source: string;
    owner: string;
    version?: string;
    securityLabel: string;
    requiresKey: boolean;
    busy: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}
export declare function ConfirmInstallDialog(props: ConfirmInstallDialogProps): import("react").JSX.Element;
export interface ConfirmRemoveDialogProps {
    name: string;
    dirPath: string;
    busy: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}
export declare function ConfirmRemoveDialog(props: ConfirmRemoveDialogProps): import("react").JSX.Element;
/** A transient toast pinned to the bottom of the panel. */
export declare function NoticeToast({ tone, text, onDismiss }: {
    tone: 'success' | 'error';
    text: string;
    onDismiss: () => void;
}): import("react").JSX.Element;
//# sourceMappingURL=Dialogs.d.ts.map
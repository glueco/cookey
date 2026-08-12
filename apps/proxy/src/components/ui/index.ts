// ============================================
// SHARED UI KIT
// One import surface for the design-system primitives. Pages should
// reach for these before writing bespoke markup — that's what keeps
// spacing, focus rings and dark mode consistent across the app.
// ============================================

export { ToastProvider, useToast, type ToastTone } from "./Toast";
export { useConfirm, type ConfirmOptions } from "./ConfirmDialog";
export {
  Field,
  Segmented,
  Switch,
  CheckCard,
  NumberField,
  TagInput,
  PillSelect,
  useSlashFocus,
} from "./controls";
export {
  PageHeader,
  Section,
  EmptyState,
  StatTile,
  Sparkline,
  CopyButton,
  RelativeTime,
  formatRelative,
  UsageMeter,
  Spinner,
  LoadingRows,
  ErrorState,
} from "./display";

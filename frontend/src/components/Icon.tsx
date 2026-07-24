import {
  ShieldCheck, FileCog, UserCog, Contact, User, Users, Workflow, FileText,
  Files, Database, History, GitCompare, RefreshCw, Settings, PanelLeft,
  ChevronRight, UserCircle, LogOut, ExternalLink, ArrowRight, ArrowLeft,
  LayoutGrid, Activity, Building2, Info, AlertCircle, AlertTriangle, Loader2,
  Search, PanelsTopLeft, LayoutDashboard, CheckCircle2, X, Plus, Inbox,
  RotateCw, GitBranch, CircleDot, FileCheck2, FileX2, GitCommitVertical,
  PlusCircle, Filter, FilePlus2, Paperclip, Save, Lock, Trash2,
  Download, Globe, UserSearch, FileSearch, FileBadge, Stamp,
  GitFork, ZoomIn, ZoomOut, Maximize, Printer,
  Library, Megaphone, PauseCircle, XCircle, FileDown, Link as LinkIcon,
  Eye, Upload, FileSpreadsheet, Sheet, Shield, Pencil, Sparkles,
  UploadCloud, Link2Off, ChevronDown, ChevronUp, CornerDownRight, HardDrive,
  Pin, List,
  Clock, FileDiff, FileStack, FileWarning, KeyRound, Layers, Loader,
  MinusCircle, ScanText, Spline,
  UserPlus, UserX, Check,
  type LucideIcon,
} from 'lucide-react';

/**
 * Lucide 圖示解析器：領域層（roles/menu）以 kebab-case 字串保存圖示名稱（沿用
 * prototype 之 data-lucide 值、保持純資料可測），UI 層在此對映為 lucide-react 元件。
 * 註冊表僅收本專案實際使用之圖示。
 */
const REGISTRY: Record<string, LucideIcon> = {
  'shield-check': ShieldCheck,
  'file-cog': FileCog,
  'user-cog': UserCog,
  contact: Contact,
  user: User,
  users: Users,
  workflow: Workflow,
  'file-text': FileText,
  files: Files,
  database: Database,
  history: History,
  'git-compare': GitCompare,
  'refresh-cw': RefreshCw,
  settings: Settings,
  'panel-left': PanelLeft,
  'chevron-right': ChevronRight,
  'user-circle': UserCircle,
  'log-out': LogOut,
  'external-link': ExternalLink,
  'arrow-right': ArrowRight,
  'arrow-left': ArrowLeft,
  'layout-grid': LayoutGrid,
  activity: Activity,
  'building-2': Building2,
  info: Info,
  'alert-circle': AlertCircle,
  'alert-triangle': AlertTriangle,
  'loader-2': Loader2,
  search: Search,
  'panels-top-left': PanelsTopLeft,
  'layout-dashboard': LayoutDashboard,
  'check-circle-2': CheckCircle2,
  x: X,
  plus: Plus,
  inbox: Inbox,
  'rotate-cw': RotateCw,
  'git-branch': GitBranch,
  'circle-dot': CircleDot,
  'file-check-2': FileCheck2,
  'file-x-2': FileX2,
  'git-commit-vertical': GitCommitVertical,
  'plus-circle': PlusCircle,
  filter: Filter,
  'file-plus-2': FilePlus2,
  paperclip: Paperclip,
  save: Save,
  lock: Lock,
  'trash-2': Trash2,
  download: Download,
  globe: Globe,
  'user-search': UserSearch,
  'file-search': FileSearch,
  'file-badge': FileBadge,
  stamp: Stamp,
  'git-fork': GitFork,
  'zoom-in': ZoomIn,
  'zoom-out': ZoomOut,
  maximize: Maximize,
  printer: Printer,
  library: Library,
  megaphone: Megaphone,
  'pause-circle': PauseCircle,
  'x-circle': XCircle,
  'file-down': FileDown,
  link: LinkIcon,
  eye: Eye,
  upload: Upload,
  'file-spreadsheet': FileSpreadsheet,
  sheet: Sheet,
  shield: Shield,
  pencil: Pencil,
  sparkles: Sparkles,
  'upload-cloud': UploadCloud,
  'link-2-off': Link2Off,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  'corner-down-right': CornerDownRight,
  'hard-drive': HardDrive,
  // prototype 03（前台清單）之置頂區/其他文件區標題圖示。
  pin: Pin,
  list: List,
  // 以下 10 枚由 Icon.registry.test.tsx 守門測試揪出：頁面已使用但漏註冊，
  // 先前於測試與正式環境皆靜默渲染為 null。
  clock: Clock, // DocumentListPage；F006 提示卡「待確認」pill 亦用
  'file-diff': FileDiff, // ChangeHistoryPage
  'file-stack': FileStack, // ChangeHistoryPage
  'file-warning': FileWarning, // DocIndexPage
  'key-round': KeyRound, // LoginPage
  layers: Layers, // ChangeHistoryPage
  loader: Loader, // DocIndexPage（建置中狀態；與既有 loader-2 為不同圖示）
  'minus-circle': MinusCircle, // ChangeHistoryPage、DocIndexPage
  'scan-text': ScanText, // DocIndexPage
  spline: Spline, // ChangeHistoryPage
  // F006 組織人員異動管理（prototype 09 之 KPI 卡與提示卡圖示）
  'user-plus': UserPlus,
  'user-x': UserX,
  check: Check,
};

export interface IconProps {
  name: string;
  className?: string;
  'aria-hidden'?: boolean;
}

export function Icon({ name, className, ...rest }: IconProps): JSX.Element | null {
  const Cmp = REGISTRY[name];
  if (!Cmp) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[Icon] 未註冊圖示：${name}`);
    }
    return null;
  }
  return <Cmp className={className} aria-hidden {...rest} />;
}

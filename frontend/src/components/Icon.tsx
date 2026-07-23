import {
  ShieldCheck, FileCog, UserCog, Contact, User, Users, Workflow, FileText,
  Files, Database, History, GitCompare, RefreshCw, Settings, PanelLeft,
  ChevronRight, UserCircle, LogOut, ExternalLink, ArrowRight, ArrowLeft,
  LayoutGrid, Activity, Building2, Info, AlertCircle, AlertTriangle, Loader2,
  Search, PanelsTopLeft, LayoutDashboard, CheckCircle2, X, Plus, Inbox,
  RotateCw, GitBranch, CircleDot, FileCheck2, FileX2, GitCommitVertical,
  PlusCircle, Filter, FilePlus2, Paperclip, Save, Lock, Trash2,
  Download, Globe, UserSearch, FileSearch, FileBadge, Stamp, type LucideIcon,
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

import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  ChartNoAxesCombined,
  MessageCircle,
  ShieldCheck,
  Repeat2,
  Landmark,
} from 'lucide-react';
export const menu = [
  { id: 'dashboard', label: 'ภาพรวมการเงิน', icon: LayoutDashboard },
  { id: 'transactions', label: 'รายการทั้งหมด', icon: ArrowLeftRight },
  { id: 'budgets', label: 'งบประมาณ', icon: ChartNoAxesCombined },
  { id: 'accounts', label: 'บัญชีและกระเป๋า', icon: Wallet },
  { id: 'recurring', label: 'รายการประจำ', icon: Repeat2 },
  { id: 'integrations', label: 'LINE & AI', icon: MessageCircle },
  { id: 'linejs', label: 'LINEJS · ธนาคาร', icon: Landmark },
  { id: 'security', label: 'บัญชีและความปลอดภัย', icon: ShieldCheck },
];
export const pagePaths = {
  dashboard: '/dashboard',
  transactions: '/transactions',
  budgets: '/budgets',
  accounts: '/accounts',
  recurring: '/recurring',
  integrations: '/line-ai',
  linejs: '/linejs',
  security: '/settings',
} as const;
export type PageId = keyof typeof pagePaths;
export const toPagePath = (id: string): string => pagePaths[id as PageId] || '/dashboard';
export const activePage = (pathname: string): PageId | '' => {
  if (pathname === '/demo') return 'dashboard';
  return (Object.keys(pagePaths) as PageId[]).find((id) => pagePaths[id] === pathname) || '';
};

export type Entry = {
  id: string;
  kind: string;
  amount_satang: string | number;
  merchant: string;
  note: string;
  category_id: string;
  category_name: string;
  account_id: string;
  account_name: string;
  transacted_at: string;
  to_account_id?: string;
};
export type Account = {
  id: string;
  name: string;
  kind: string;
  balance_satang: string;
  opening_satang: string;
  color: string;
};
export type Cat = { id: string; name: string; kind: string; color: string };
export type Profile = {
  id: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  google_linked: boolean;
  line_connected: boolean;
  email_login_enabled: boolean;
  password_set: boolean;
  onboarding_state?: 'pending' | 'completed' | 'skipped';
};
export type Data = {
  accounts: Account[];
  categories: Cat[];
  transactions: Entry[];
  budgets: any[];
  recurring: any[];
  lineConnected: boolean;
  month: string;
  profile?: Profile;
};
export const amount = (n: any) => Number(n || 0) / 100;
export const baht = (n: number) =>
  new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 2,
  }).format(n);
export const short = (n: number) =>
  '฿' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
export const thDate = (d: string) =>
  new Date(d).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Bangkok',
  });
export const currentMonth = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
export const demo: Data = {
  month: currentMonth(),
  lineConnected: false,
  accounts: [
    {
      id: 'a',
      name: 'บัญชีหลัก',
      kind: 'bank',
      balance_satang: '0',
      opening_satang: '0',
      color: '#20aa85',
    },
    {
      id: 'b',
      name: 'เงินสด',
      kind: 'cash',
      balance_satang: '0',
      opening_satang: '0',
      color: '#eaa25f',
    },
    {
      id: 'c',
      name: 'วอลเล็ต',
      kind: 'wallet',
      balance_satang: '0',
      opening_satang: '0',
      color: '#7e8deb',
    },
  ],
  categories: [
    { id: 'f', name: 'อาหาร', kind: 'expense', color: '#16a37d' },
    { id: 't', name: 'เดินทาง', kind: 'expense', color: '#7d8fed' },
    { id: 's', name: 'ช้อปปิ้ง', kind: 'expense', color: '#f4b75e' },
    { id: 'r', name: 'บิลและที่พัก', kind: 'expense', color: '#ee897f' },
    { id: 'h', name: 'สุขภาพ', kind: 'expense', color: '#b87dc1' },
    { id: 'o', name: 'อื่นๆ', kind: 'expense', color: '#84969b' },
    { id: 'i', name: 'เงินเดือน', kind: 'income', color: '#16a37d' },
  ],
  transactions: [],
  budgets: [],
  recurring: [],
};

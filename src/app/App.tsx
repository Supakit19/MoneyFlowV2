import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import FinanceModal from '../FinanceModal';
import { ToastHost, pushToast, type FeedbackType } from '../feedback';
import { askConfirm } from '../ConfirmDialog';
import { validateAiText, type FinanceModalType, type FinanceKind } from '../validation';
import { type FinanceOverview } from '../MoneyWellness';
import { demoFinanceOverview } from './demoOverview';
import { type Data, type Entry, amount, currentMonth, demo } from '../lib/finance';
import { api, ApiError } from '../lib/api';
import { activePage, toPagePath } from './navigation';
import { websiteDestinationAfterLogin } from './entry-routes';
import { FinancePageProvider } from './FinanceContext';
import TransactionRow from '../components/TransactionRow';
import SessionLoading from '../components/SessionLoading';
import SessionError from '../components/SessionError';
import WorkspaceLayout from '../components/layout/WorkspaceLayout';
import LoginPage from '../pages/LoginPage';
import WelcomePage from '../pages/WelcomePage';
const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const TransactionsPage = lazy(() => import('../pages/TransactionsPage'));
const FinanceInboxPage = lazy(() => import('../pages/FinanceInboxPage'));
const BudgetsPage = lazy(() => import('../pages/BudgetsPage'));
const AccountsPage = lazy(() => import('../pages/AccountsPage'));
const RecurringPage = lazy(() => import('../pages/RecurringPage'));
const LineAiPage = lazy(() => import('../pages/LineAiPage'));
const LineJsPage = lazy(() => import('../pages/LineJsPage'));
const SecurityPage = lazy(() => import('../pages/SecurityPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));

type AuthStatus = 'checking' | 'authenticated' | 'guest' | 'error';
export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const view = activePage(location.pathname);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [realtime, setRealtime] = useState<'online' | 'offline' | 'connecting'>('connecting');
  const [demoMode, setDemoMode] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [month, setMonth] = useState(currentMonth());
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('expense');
  const [pair, setPair] = useState('');
  const [parseText, setParseText] = useState('');
  const [parseError, setParseError] = useState('');
  const [parsed, setParsed] = useState<any>(null);
  const [lineStatus, setLineStatus] = useState<any>(null);
  const notify = (message: string, type: FeedbackType = 'success') => pushToast(type, message);
  const setView = (id: string) => {
    setMenuOpen(false);
    setSearch('');
    navigate(toPagePath(id));
  };
  const reload = async (): Promise<Data> => {
    try {
      const [financeData, profile, finance] = await Promise.all([
        api('/data'),
        api('/me'),
        api('/finance/overview'),
      ]);
      const next = { ...financeData, profile } as Data;
      setData(next);
      setOverview(finance);
      return next;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setData(null);
        setOverview(null);
        setAuthStatus('guest');
      }
      throw e;
    }
  };
  const bootstrap = async () => {
    setAuthStatus('checking');
    try {
      const next = await reload();
      setAuthStatus('authenticated');
      if (next.profile?.onboarding_state === 'pending' && location.pathname !== '/welcome') {
        navigate(websiteDestinationAfterLogin(next.profile?.onboarding_state), { replace: true });
      }
    } catch (e) {
      setAuthStatus(e instanceof ApiError && e.status === 401 ? 'guest' : 'error');
    }
  };
  useEffect(() => {
    void bootstrap();
  }, []);
  useEffect(() => {
    if (view === 'integrations' && !demoMode && data) {
      api('/line/status')
        .then(setLineStatus)
        .catch(() => setLineStatus(null));
    }
  }, [view, demoMode, !!data]);
  useEffect(() => {
    if (!data || demoMode) {
      setRealtime('offline');
      return;
    }
    let closed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let reconnectDelay = 800;
    let lastRefresh = 0;
    const host = window.location.host;
    const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const connect = () => {
      if (closed) return;
      setRealtime('connecting');
      socket = new WebSocket(scheme + '//' + host + '/ws/live');
      socket.onopen = () => {
        setRealtime('online');
        reconnectDelay = 800;
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data));
          if (['finance.changed', 'settings.changed', 'line.connected'].includes(message.type)) {
            if (Date.now() - lastRefresh > 300) {
              lastRefresh = Date.now();
              reload().catch(() => {});
            }
          }
        } catch {}
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        if (closed) return;
        setRealtime('offline');
        reconnectTimer = window.setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(20000, Math.ceil(reconnectDelay * 1.75));
      };
    };
    connect();
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload().catch(() => {});
    };
    const onOnline = () => {
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [!!data, demoMode]);
  const live = demoMode ? demo : data;
  const currentName = live?.profile?.display_name || 'MoneyFlow';
  const currentEmail = live?.profile?.email || (demoMode ? 'บัญชีตัวอย่าง' : 'บัญชี Google');
  const avatar = (className: string) =>
    live?.profile?.avatar_url ? (
      <img className={className} src={live.profile.avatar_url} alt="Profile" />
    ) : (
      <span className={className}>{currentName.trim().slice(0, 1).toUpperCase() || 'M'}</span>
    );
  const transactions = (live?.transactions || []).filter(
    (t) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
      }).format(new Date(t.transacted_at)) === month,
  );
  const expenses = transactions.filter((t) => t.kind === 'expense'),
    incomes = transactions.filter((t) => t.kind === 'income');
  const income = incomes.reduce((s, t) => s + amount(t.amount_satang), 0),
    expense = expenses.reduce((s, t) => s + amount(t.amount_satang), 0);
  const balance = (live?.accounts || []).reduce((s, a) => s + amount(a.balance_satang), 0);
  const spentCats = (live?.categories || [])
    .filter((c) => c.kind === 'expense')
    .map((c) => ({
      ...c,
      total: expenses
        .filter((t) => t.category_id === c.id)
        .reduce((s, t) => s + amount(t.amount_satang), 0),
    }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);
  const chart = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(Number(month.split('-')[0]), Number(month.split('-')[1]) - 1, 1);
    const day = Math.min(28, 1 + i * 4);
    const date = new Date(start.getFullYear(), start.getMonth(), day).toISOString().slice(0, 10);
    return {
      day: String(day).padStart(2, '0'),
      income: transactions
        .filter((t) => t.kind === 'income' && new Date(t.transacted_at).getDate() <= day)
        .reduce((s, t) => s + amount(t.amount_satang), 0),
      expense: transactions
        .filter((t) => t.kind === 'expense' && new Date(t.transacted_at).getDate() <= day)
        .reduce((s, t) => s + amount(t.amount_satang), 0),
    };
  });
  const switchMonth = (d: number) => {
    const [y, m] = month.split('-').map(Number);
    const x = new Date(y, m - 1 + d, 1);
    setMonth(x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'));
  };
  const open = (name: string, k = 'expense') => {
    setKind(k);
    setModal(name);
  };
  const saveModal = async (mode: FinanceModalType, payload: Record<string, unknown>) => {
    if (demoMode) throw Error('โหมดตัวอย่างยังบันทึกข้อมูลจริงไม่ได้');
    if (mode === 'transaction') await api('/transactions', 'POST', payload);
    else if (mode === 'account') await api('/accounts', 'POST', payload);
    else if (mode === 'budget') await api('/budgets', 'PUT', payload);
    else if (mode === 'recurring') await api('/recurring', 'POST', payload);
    try {
      await reload();
    } catch {
      notify('บันทึกสำเร็จแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณากดรีเฟรช', 'warning');
    }
  };
  const del = async (t: Entry) => {
    if (demoMode) return notify('โหมดตัวอย่างยังลบข้อมูลจริงไม่ได้', 'warning');
    if (
      !(await askConfirm({
        title: 'ลบรายการนี้?',
        description:
          'รายการที่ลบแล้วจะไม่แสดงในบัญชีและรายงานการเงินอีก และไม่สามารถกู้คืนจากหน้านี้ได้',
        confirmLabel: 'ลบรายการ',
        tone: 'danger',
      }))
    )
      return;
    try {
      await api('/transactions/' + t.id, 'DELETE');
      await reload();
      notify('ลบรายการเรียบร้อยแล้ว');
    } catch (e: any) {
      notify(e.message || 'ลบรายการไม่สำเร็จ', 'error');
    }
  };
  const delRecurring = async (id: string) => {
    if (demoMode) return notify('โหมดตัวอย่างยังลบข้อมูลจริงไม่ได้', 'warning');
    if (
      !(await askConfirm({
        title: 'ลบรายการประจำ?',
        description:
          'ระบบจะหยุดใช้รายการนี้สำหรับการบันทึกครั้งต่อไป แต่รายการใช้จ่ายที่เคยบันทึกไว้จะยังคงอยู่',
        confirmLabel: 'ลบรายการประจำ',
        tone: 'danger',
      }))
    )
      return;
    try {
      await api('/recurring/' + id, 'DELETE');
      await reload();
      notify('ลบรายการประจำเรียบร้อยแล้ว');
    } catch (e: any) {
      notify(e.message || 'ลบรายการประจำไม่สำเร็จ', 'error');
    }
  };
  const logout = async () => {
    if (demoMode) {
      onExitDemo();
      return;
    }
    try {
      await api('/auth/logout', 'POST');
      setData(null);
      setOverview(null);
      setAuthStatus('guest');
      navigate('/login', { replace: true });
      notify('ออกจากระบบเรียบร้อยแล้ว');
    } catch (e: any) {
      notify(e.message || 'ออกจากระบบไม่สำเร็จ', 'error');
    }
  };
  const parseWithAi = async () => {
    const validation = validateAiText(parseText);
    setParseError(validation || '');
    if (validation) {
      notify(validation, 'error');
      return;
    }
    if (demoMode) return notify('กรุณาเข้าสู่ระบบก่อนทดลองใช้ AI', 'warning');
    try {
      const result = await api('/ai/parse', 'POST', { text: parseText.trim() });
      setParsed(result);
      notify(
        result.items?.length
          ? 'AI อ่านข้อมูลได้ ' + result.items.length + ' รายการ (ยังไม่ได้บันทึก)'
          : 'AI วิเคราะห์ข้อความแล้ว แต่ไม่พบรายการรายรับหรือรายจ่าย',
        'info',
      );
    } catch (e: any) {
      notify(e.message || 'ไม่สามารถวิเคราะห์ข้อความได้', 'error');
    }
  };
  const row = (entry: Entry) => <TransactionRow key={entry.id} entry={entry} />;
  const onExitDemo = () => {
    setDemoMode(false);
    setData(null);
    setOverview(null);
    setAuthStatus('guest');
    navigate('/login', { replace: true });
  };
  const onPreview = () => {
    setDemoMode(true);
    setModal('');
    navigate('/demo');
  };
  const onAuthenticated = async (message: string) => {
    const next = await reload();
    setAuthStatus('authenticated');
    setDemoMode(false);
    setError('');
    setModal('');
    navigate(websiteDestinationAfterLogin(next.profile?.onboarding_state), { replace: true });
    notify(message);
  };

  if (authStatus === 'checking') return <SessionLoading />;
  if (authStatus === 'error') return <SessionError onRetry={() => void bootstrap()} />;
  if (authStatus === 'guest' && !demoMode) {
    return (
      <Routes>
        <Route
          path="/login"
          element={
            <LoginPage
              error={error}
              onError={setError}
              onAuthenticated={onAuthenticated}
              onPreview={onPreview}
            />
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  if (!live) return <SessionLoading />;

  if (!demoMode && location.pathname === '/welcome') {
    return (
      <WelcomePage
        data={live}
        overview={overview}
        notify={notify}
        onFinish={async (state) => {
          await api('/onboarding/state', 'POST', { state });
          await reload();
          navigate('/dashboard', { replace: true });
          notify(
            state === 'skipped'
              ? 'ข้ามการตั้งค่าแล้ว คุณกลับมาเริ่มใหม่ได้จากหน้าบัญชีและความปลอดภัย'
              : 'ตั้งค่าบัญชีเรียบร้อยแล้ว ยินดีต้อนรับสู่ MoneyFlow!',
            'success',
          );
        }}
      />
    );
  }

  if (!demoMode && live.profile?.onboarding_state === 'pending') {
    return <Navigate to="/welcome" replace />;
  }

  const page = {
    live,
    demoMode,
    overview: demoMode ? demoFinanceOverview : overview,
    realtime,
    view,
    month,
    search,
    pair,
    parseText,
    parseError,
    parsed,
    lineStatus,
    transactions,
    expenses,
    incomes,
    income,
    expense,
    balance,
    spentCats,
    chart,
    setView,
    switchMonth,
    open,
    row,
    setSearch,
    setPair,
    setParseText,
    setParseError,
    setParsed,
    setLineStatus,
    menuOpen,
    setMenuOpen,
    notify,
    reload,
    api,
    del,
    delRecurring,
    logout,
    parseWithAi,
    onExitDemo,
  };
  return (
    <FinancePageProvider value={page}>
      <WorkspaceLayout>
        <Suspense
          fallback={
            <div className="route-loading" role="status" aria-label="กำลังโหลดหน้า">
              <span className="session-spinner" />
              กำลังโหลดหน้า...
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Navigate to="/dashboard" replace />} />
            <Route path="/demo" element={<DashboardPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/inbox" element={<FinanceInboxPage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/recurring" element={<RecurringPage />} />
            <Route path="/line-ai" element={<LineAiPage />} />
            <Route path="/linejs" element={<LineJsPage />} />
            <Route path="/settings" element={<SecurityPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </WorkspaceLayout>
      {modal && (
        <FinanceModal
          key={modal + '-' + kind}
          modal={modal as FinanceModalType}
          initialKind={kind as FinanceKind}
          accounts={live.accounts}
          categories={live.categories}
          month={month}
          demo={demoMode}
          onClose={() => setModal('')}
          onSaved={saveModal}
        />
      )}
    </FinancePageProvider>
  );
}

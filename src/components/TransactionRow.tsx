import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Trash2 } from 'lucide-react';
import { type Entry, amount, baht, thDate } from '../lib/finance';
import { useFinancePage } from '../app/FinanceContext';
export default function TransactionRow({ entry: t }: { entry: Entry }) {
  const { del } = useFinancePage();
  return (
    <div className="transaction-row">
      <div
        className={
          'tx-symbol ' +
          (t.kind === 'income' ? 'incoming' : t.kind === 'transfer' ? 'transfer' : 'outgoing')
        }
      >
        {t.kind === 'income' ? (
          <ArrowDownLeft size={20} />
        ) : t.kind === 'transfer' ? (
          <ArrowLeftRight size={20} />
        ) : (
          <ArrowUpRight size={20} />
        )}
      </div>
      <div className="tx-desc">
        <strong>{t.merchant || t.category_name || 'โอนเงิน'}</strong>
        <span>
          {t.category_name || 'โอนระหว่างบัญชี'} · {thDate(t.transacted_at)} · {t.account_name}
        </span>
      </div>
      <div className={'tx-money ' + (t.kind === 'income' ? 'positive' : '')}>
        {t.kind === 'income' ? '+' : t.kind === 'transfer' ? '' : '−'}
        {baht(amount(t.amount_satang))}
      </div>
      <button
        type="button"
        className="iconbtn delete"
        onClick={() => del(t)}
        aria-label={'ลบรายการ ' + (t.merchant || t.category_name || 'โอนเงิน')}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

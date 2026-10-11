import { useEffect, useState } from 'react';
import { MessageCircle, QrCode, ShieldCheck } from 'lucide-react';
import LineCodeLogin from './LineCodeLogin';
import LineQrLogin from './LineQrLogin';
import './LineWebLogin.css';

type Props = {
  onAuthenticated: (message: string) => Promise<void>;
  onError: (message: string) => void;
};

/** Never show LINE QR OAuth before the server reports a complete channel. */
export default function LineWebLogin(props: Props) {
  const [oauthReady, setOauthReady] = useState(false);
  const [method, setMethod] = useState<'qr' | 'code'>('code');

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/auth/line/qr/config', {
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((config) => {
        if (controller.signal.aborted) return;
        if (config?.enabled === true) {
          setOauthReady(true);
          setMethod('qr');
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return (
    <div className="mf-line-web-login">
      {oauthReady && (
        <div className="mf-line-web-switch" aria-label="เลือกวิธียืนยัน LINE">
          <button type="button" aria-pressed={method === 'qr'} onClick={() => setMethod('qr')}>
            <QrCode size={15} /> ยืนยันด้วย QR
          </button>
          <button type="button" aria-pressed={method === 'code'} onClick={() => setMethod('code')}>
            <MessageCircle size={15} /> ใช้รหัสในแชต
          </button>
        </div>
      )}
      {oauthReady && method === 'qr' ? <LineQrLogin {...props} /> : <LineCodeLogin {...props} />}
      {oauthReady && (
        <p className="mf-line-web-security">
          <ShieldCheck size={15} /> ยืนยันใน LINE แล้วกลับเข้าหน้าเว็บ ไม่เปิดสมุดเงินมือถือแทน
        </p>
      )}
    </div>
  );
}

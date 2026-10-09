import React, { useEffect, useState } from 'react';
import { useFinancePage } from '../app/FinanceContext';
import LineJsLocalAgent from './LineJsLocalAgent';
import LineJsHostedAgent from './LineJsHostedAgent';

export default function LineJsConnectorAgent({
  onConnected,
  onCandidate,
}: {
  onConnected?: () => Promise<void>;
  onCandidate?: (mid: string) => void;
}) {
  const { api, demoMode } = useFinancePage();
  const [provider, setProvider] = useState<'loading' | 'local' | 'hosted'>('loading');
  useEffect(() => {
    if (demoMode) return;
    let mounted = true;
    void (async () => {
      try {
        const [hosted, local] = await Promise.all([
          api('/bank/linejs/connector/status'),
          api('/bank/linejs/local/status'),
        ]);
        if (!mounted) return;
        const legacyIsOwner =
          local.agent?.available === true &&
          (local.agent?.linked === true || local.agent?.running === true);
        // Never replace the already functioning original Mac connection.
        const chosen =
          hosted.connectorMode === 'hosted'
            ? 'hosted'
            : legacyIsOwner
              ? 'local'
              : hosted.agent?.available
                ? 'hosted'
                : local.agent?.available
                  ? 'local'
                  : 'hosted';
        setProvider(chosen);
      } catch {
        if (mounted) setProvider('hosted');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [demoMode]);
  if (demoMode) return null;
  if (provider === 'loading')
    return <p className="mf-agent-footnote">กำลังตรวจวิธีเชื่อมต่อ LINE ที่เหมาะกับบัญชีของคุณ...</p>;
  return provider === 'local' ? (
    <LineJsLocalAgent onConnected={onConnected} onCandidate={onCandidate} />
  ) : (
    <LineJsHostedAgent onConnected={onConnected} onCandidate={onCandidate} />
  );
}

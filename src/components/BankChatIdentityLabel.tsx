import React from 'react';
import { abbreviatedBankChatId, bankChatIdentity } from './bankChatCandidates';
import './BankChatIdentityLabel.css';

/** Render friendly sender names without treating a user-reported label as verified. */
export default function BankChatIdentityLabel({ mid }: { mid: string }) {
  const identity = bankChatIdentity(mid);
  return (
    <div className="mf-bank-chat-identity">
      <div className="mf-bank-chat-identity-heading">
        <strong>{identity.name}</strong>
        <span className={'mf-bank-chat-identity-status is-' + identity.status}>
          {identity.status === 'user-reported'
            ? 'ผู้ใช้ระบุชื่อ'
            : identity.status === 'tentative'
              ? 'ยังไม่ยืนยัน'
              : 'ไม่ทราบผู้ส่ง'}
        </span>
      </div>
      <p>{identity.note}</p>
      <details>
        <summary>รหัสแชต {abbreviatedBankChatId(mid)} · ดูรหัสเต็ม</summary>
        <code>{mid}</code>
      </details>
    </div>
  );
}

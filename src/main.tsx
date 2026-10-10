import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './app/App';
const MiniApp = lazy(() => import('./pages/MiniApp'));
import { ToastHost } from './feedback';
import { ConfirmDialogHost } from './ConfirmDialog';
import './style.css';
import './app/routing.css';
import './ux-polish.css';
import './google-auth-redesign.css';
import './line-qr-login.css';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Suspense fallback={<div role="status" style={{ padding: 28 }}>กำลังเปิด MoneyFlow...</div>}>
      <Routes>
        <Route path="/mini/*" element={<MiniApp />} />
        <Route path="*" element={<App />} />
      </Routes>
    </Suspense>
    <ToastHost />
    <ConfirmDialogHost />
  </BrowserRouter>,
);

import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './app/App';
const MiniApp = lazy(() => import('./pages/MiniApp'));
const MoneyFlowSite = lazy(() => import('./pages/MoneyFlowSite'));
const CompanyPage = lazy(() =>
  import('./pages/MoneyFlowSite').then((m) => ({ default: m.CompanyPage })),
);
import FlowLoader from './components/FlowLoader';
import { ToastHost } from './feedback';
import { ConfirmDialogHost } from './ConfirmDialog';
import './style.css';
import './app/routing.css';
import './ux-polish.css';
import './google-auth-redesign.css';
import './line-qr-login.css';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Suspense fallback={<FlowLoader compact message="กำลังเตรียมหน้า MoneyFlow" />}>
      <Routes>
        <Route path="/mini/*" element={<MiniApp />} />
        <Route path="/" element={<MoneyFlowSite />} />
        <Route path="/company" element={<CompanyPage />} />
        <Route path="*" element={<App />} />
      </Routes>
    </Suspense>
    <ToastHost />
    <ConfirmDialogHost />
  </BrowserRouter>,
);

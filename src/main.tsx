import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { ToastHost } from './feedback';
import { ConfirmDialogHost } from './ConfirmDialog';
import './style.css';
import './app/routing.css';
import './ux-polish.css';
import './google-auth-redesign.css';
import './line-qr-login.css';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
    <ToastHost />
    <ConfirmDialogHost />
  </BrowserRouter>,
);

import type { ReactNode } from 'react';
export const sectionTitle = (title: string, sub: string, action?: ReactNode) => (
  <div className="section-title">
    <div>
      <h2>{title}</h2>
      <p>{sub}</p>
    </div>
    {action}
  </div>
);

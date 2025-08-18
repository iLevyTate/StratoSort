import React from 'react';

export default function AppShell({ header, subheader, footer, children }) {
  return (
    <div className="min-h-screen gradient-bg modern-scrollbar flex flex-col">
      {header}
      {/* Add padding-top to account for fixed header */}
      <div className="pt-16">
        {subheader}
        <main className="container-enhanced py-[21px] animate-fade-in flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      {footer}
    </div>
  );
}

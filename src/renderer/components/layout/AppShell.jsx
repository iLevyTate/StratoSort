import React from 'react';

export default function AppShell({ header, subheader, children }) {
  return (
    <div className="min-h-screen gradient-bg modern-scrollbar flex flex-col">
      {header}
      {subheader}
      <main className="container-centered py-fib-21 animate-fade-in flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}



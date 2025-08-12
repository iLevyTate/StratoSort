import React from 'react';

export default function AppShell({ header, subheader, children }) {
  return (
    <div className="min-h-screen gradient-bg modern-scrollbar">
      {header}
      {subheader}
      <main className="container-centered py-fib-21 animate-fade-in">
        {children}
      </main>
    </div>
  );
}



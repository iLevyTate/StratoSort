import React, { createContext, useCallback, useContext } from "react";
import { ToastContainer, useToast } from "../components/Toast";

const NotificationContext = createContext(null);

function NotificationProvider({ children }) {
  const { toasts, addToast, removeToast, showSuccess, showError, showWarning, showInfo } = useToast();

  const addNotification = useCallback((message, severity = 'info', duration = 3000) => {
    return addToast(message, severity, duration);
  }, [addToast]);

  const removeNotification = useCallback((id) => {
    removeToast(id);
  }, [removeToast]);

  return (
    <NotificationContext.Provider value={{
      notifications: toasts,
      addNotification,
      removeNotification,
      showSuccess,
      showError,
      showWarning,
      showInfo
    }}>
      {children}
      <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
    </NotificationContext.Provider>
  );
}

function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
}

export { NotificationProvider, useNotification, NotificationContext };

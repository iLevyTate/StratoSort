import React, { useEffect, useRef, useCallback } from 'react';

function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'medium',
  closeOnOverlayClick = true,
  showCloseButton = true,
  className = ''
}) {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Store the previously focused element when modal opens
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
    }
  }, [isOpen]);

  // Handle ESC key press
  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Escape' && isOpen) {
      onClose();
    }
  }, [isOpen, onClose]);

  // Focus management
  useEffect(() => {
    if (isOpen && modalRef.current) {
      // Focus the modal container
      modalRef.current.focus();
      
      // Add event listener for ESC key
      document.addEventListener('keydown', handleKeyDown);
      
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
      
      return () => {
        // Cleanup
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'unset';
        
        // Restore focus to previously focused element
        if (previousFocusRef.current) {
          previousFocusRef.current.focus();
        }
      };
    }
  }, [isOpen, handleKeyDown]);

  // Handle overlay click
  const handleOverlayClick = (event) => {
    if (closeOnOverlayClick && event.target === event.currentTarget) {
      onClose();
    }
  };

  // Focus trap within modal
  const handleTabKey = (event) => {
    if (!modalRef.current) return;

    const focusableElements = modalRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        lastElement.focus();
        event.preventDefault();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        firstElement.focus();
        event.preventDefault();
      }
    }
  };

  const handleModalKeyDown = (event) => {
    if (event.key === 'Escape') {
      onClose();
      event.preventDefault();
    } else if (event.key === 'Tab') {
      handleTabKey(event);
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'small':
        return 'max-w-md';
      case 'large':
        return 'max-w-4xl';
      case 'full':
        return 'max-w-7xl';
      case 'medium':
      default:
        return 'max-w-2xl';
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-modal-backdrop"
      style={{ position: 'fixed', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '21px', zIndex: 2147483646 }}
      onClick={handleOverlayClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-modal-backdrop" />
      
      {/* Modal */}
      <div
        ref={modalRef}
        className={`
          relative glass-card-strong rounded-2xl shadow-2xl
          w-full ${getSizeClasses()} max-h-[90vh] overflow-hidden
          animate-modal-enter ${className}
        `}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        tabIndex={-1}
        onKeyDown={handleModalKeyDown}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between p-8 border-b border-white/20">
            {title && (
              <h2 id="modal-title" className="text-xl font-bold text-on-glass">
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="glass-button w-10 h-10 flex items-center justify-center hover:scale-105 transition-all duration-300"
                aria-label="Close modal"
              >
                <span className="text-lg">×</span>
              </button>
            )}
          </div>
        )}
        
        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-8rem)]">
          {children}
        </div>
      </div>
    </div>
  );
}

// Enhanced Confirmation Modal with modern design
export function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default', // default, danger, warning, info
  fileName = null // For file operations
}) {
  const getConfirmButtonClass = () => {
    switch (variant) {
      case 'danger':
        return 'btn-danger';
      case 'warning':
        return 'btn-warning';
      case 'info':
        return 'btn-info';
      default:
        return 'btn-primary';
    }
  };

  const getCancelButtonClass = () => {
    return 'btn-secondary';
  };

  const getIcon = () => {
    const iconBaseClass = 'w-12 h-12 rounded-full flex items-center justify-center';
    switch (variant) {
      case 'danger':
        return <div className={`${iconBaseClass} bg-danger/10 text-danger text-2xl`}>!</div>;
      case 'warning':
        return <div className={`${iconBaseClass} bg-warning/10 text-warning text-2xl`}>⚠️</div>;
      case 'info':
        return <div className={`${iconBaseClass} bg-info/10 text-info text-2xl`}>ℹ️</div>;
      default:
        return <div className={`${iconBaseClass} bg-blue-600/10 text-blue-600 text-2xl`}>?</div>;
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="small" closeOnOverlayClick={false}>
      <div className="p-8 text-center">
        <div className="mx-auto mb-6">
          {getIcon()}
        </div>
        <h3 className="text-lg font-semibold mb-3">{title}</h3>
        {fileName && <p className="text-sm text-gray-500 font-mono mb-4 truncate" title={fileName}>{fileName}</p>}
        <p className="text-text-secondary mb-6">
          {message || 'Are you sure you want to proceed? This action may not be reversible.'}
        </p>
        <div className="flex justify-center gap-4">
          <button onClick={onClose} className={getCancelButtonClass()}>
            {cancelText}
          </button>
          <button onClick={onConfirm} className={getConfirmButtonClass()}>
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default Modal; 
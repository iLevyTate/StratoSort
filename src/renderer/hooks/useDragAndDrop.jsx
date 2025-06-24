import { useState, useCallback, useRef, useEffect } from 'react';

const useDragAndDrop = ({ 
  onFilesDropped, 
  acceptedTypes = [], 
  maxFiles = null,
  maxFileSize = null, // in bytes
  disabled = false 
}) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [isDragAccept, setIsDragAccept] = useState(false);
  const [isDragReject, setIsDragReject] = useState(false);
  const [dropZoneErrors, setDropZoneErrors] = useState([]);
  const [dragCounter, setDragCounter] = useState(0);
  const dropRef = useRef(null);

  // Validate files
  const validateFiles = useCallback((files) => {
    const errors = [];
    const validFiles = [];

    // Check max files limit
    if (maxFiles && files.length > maxFiles) {
      errors.push(`Too many files. Maximum ${maxFiles} files allowed.`);
      return { validFiles: [], errors };
    }

    files.forEach((file, index) => {
      const fileErrors = [];

      // Check file type
      if (acceptedTypes.length > 0) {
        const isAccepted = acceptedTypes.some(type => {
          if (type.startsWith('.')) {
            // Extension check
            return file.name.toLowerCase().endsWith(type.toLowerCase());
          } else if (type.includes('/')) {
            // MIME type check
            return file.type.match(type);
          }
          return false;
        });

        if (!isAccepted) {
          fileErrors.push(`File type not supported: ${file.name}`);
        }
      }

      // Check file size
      if (maxFileSize && file.size > maxFileSize) {
        const sizeMB = Math.round(maxFileSize / 1024 / 1024);
        fileErrors.push(`File too large: ${file.name} (max ${sizeMB}MB)`);
      }

      if (fileErrors.length === 0) {
        validFiles.push(file);
      } else {
        errors.push(...fileErrors);
      }
    });

    return { validFiles, errors };
  }, [acceptedTypes, maxFiles, maxFileSize]);

  // Check if dragged items are acceptable
  const checkDragAcceptance = useCallback((dataTransfer) => {
    if (disabled) return false;
    
    if (!dataTransfer.types.includes('Files')) return false;

    // If we have accepted types, try to validate
    if (acceptedTypes.length > 0) {
      // We can't fully validate during drag, but we can check some basics
      const items = Array.from(dataTransfer.items);
      return items.some(item => {
        if (item.kind === 'file') {
          return acceptedTypes.some(type => {
            if (type.includes('/')) {
              return item.type.match(type);
            }
            return true; // Can't check extensions during drag
          });
        }
        return false;
      });
    }

    return true;
  }, [acceptedTypes, disabled]);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();

    setDragCounter(prev => prev + 1);

    if (e.dataTransfer) {
      const isAcceptable = checkDragAcceptance(e.dataTransfer);
      setIsDragActive(true);
      setIsDragAccept(isAcceptable);
      setIsDragReject(!isAcceptable);
      
      // Set drag effect
      e.dataTransfer.dropEffect = isAcceptable ? 'copy' : 'none';
    }
  }, [checkDragAcceptance]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();

    setDragCounter(prev => {
      const newCounter = prev - 1;
      if (newCounter === 0) {
        setIsDragActive(false);
        setIsDragAccept(false);
        setIsDragReject(false);
        setDropZoneErrors([]);
      }
      return newCounter;
    });
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer) {
      const isAcceptable = checkDragAcceptance(e.dataTransfer);
      e.dataTransfer.dropEffect = isAcceptable ? 'copy' : 'none';
    }
  }, [checkDragAcceptance]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragActive(false);
    setIsDragAccept(false);
    setIsDragReject(false);
    setDragCounter(0);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const { validFiles, errors } = validateFiles(files);
    setDropZoneErrors(errors);

    if (validFiles.length > 0) {
      onFilesDropped?.(validFiles);
    }
  }, [disabled, validateFiles, onFilesDropped]);

  // Set up drag and drop event listeners
  useEffect(() => {
    const element = dropRef.current;
    if (!element) return;

    element.addEventListener('dragenter', handleDragEnter);
    element.addEventListener('dragleave', handleDragLeave);
    element.addEventListener('dragover', handleDragOver);
    element.addEventListener('drop', handleDrop);

    return () => {
      element.removeEventListener('dragenter', handleDragEnter);
      element.removeEventListener('dragleave', handleDragLeave);
      element.removeEventListener('dragover', handleDragOver);
      element.removeEventListener('drop', handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  // Clear errors after some time
  useEffect(() => {
    if (dropZoneErrors.length > 0) {
      const timer = setTimeout(() => {
        setDropZoneErrors([]);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [dropZoneErrors]);

  // Generate accepted types display text
  const getAcceptedTypesText = useCallback(() => {
    if (acceptedTypes.length === 0) return 'any files';
    
    const extensions = acceptedTypes.filter(type => type.startsWith('.'));
    const mimeTypes = acceptedTypes.filter(type => type.includes('/'));
    
    const parts = [];
    if (extensions.length > 0) {
      parts.push(extensions.join(', '));
    }
    if (mimeTypes.length > 0) {
      const friendlyTypes = mimeTypes.map(type => {
        if (type.startsWith('image/')) return 'images';
        if (type.startsWith('video/')) return 'videos';
        if (type.startsWith('audio/')) return 'audio';
        if (type.startsWith('text/')) return 'text files';
        return type;
      });
      parts.push(...friendlyTypes);
    }
    
    return parts.join(', ');
  }, [acceptedTypes]);

  // Get drop zone class names
  const getDropZoneClassName = useCallback((baseClassName = '') => {
    const classes = [baseClassName];
    
    if (disabled) {
      classes.push('opacity-50 cursor-not-allowed');
    } else if (isDragActive) {
      if (isDragAccept) {
        classes.push('border-green-400 bg-green-50/50 ring-2 ring-green-400/50');
      } else if (isDragReject) {
        classes.push('border-red-400 bg-red-50/50 ring-2 ring-red-400/50');
      } else {
        classes.push('border-blue-400 bg-blue-50/50 ring-2 ring-blue-400/50');
      }
    } else {
      classes.push('border-dashed border-gray-300 hover:border-gray-400');
    }
    
    return classes.filter(Boolean).join(' ');
  }, [disabled, isDragActive, isDragAccept, isDragReject]);

  // Enhanced drop zone component
  const DropZone = useCallback(({ 
    children, 
    className = '', 
    showInstructions = true,
    instructionText,
    ...props 
  }) => {
    const defaultInstructionText = instructionText || 
      `Drop ${getAcceptedTypesText()} here${maxFiles ? ` (max ${maxFiles})` : ''}`;

    return (
      <div
        ref={dropRef}
        className={getDropZoneClassName(`
          relative border-2 rounded-lg transition-all duration-200 ease-in-out
          min-h-[120px] flex flex-col items-center justify-center p-6
          ${className}
        `)}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={`Drop zone for ${getAcceptedTypesText()}`}
        aria-describedby="drop-zone-instructions"
        {...props}
      >
        {/* Visual feedback overlay */}
        {isDragActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-lg z-10">
            <div className="text-center space-y-2">
              <div className="text-4xl">
                {isDragAccept ? '✅' : isDragReject ? '❌' : '📁'}
              </div>
              <p className="font-semibold text-lg">
                {isDragAccept ? 'Drop files here!' : 
                 isDragReject ? 'Files not supported' : 
                 'Drop to upload'}
              </p>
            </div>
          </div>
        )}

        {/* Default content */}
        {children || (
          <div className="text-center space-y-3">
            <div className="text-4xl text-gray-400">
              📁
            </div>
            {showInstructions && (
              <div id="drop-zone-instructions" className="space-y-2">
                <p className="text-lg font-medium text-gray-700">
                  {defaultInstructionText}
                </p>
                <p className="text-sm text-gray-500">
                  or click to browse files
                </p>
                {maxFileSize && (
                  <p className="text-xs text-gray-400">
                    Max file size: {Math.round(maxFileSize / 1024 / 1024)}MB
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Error messages */}
        {dropZoneErrors.length > 0 && (
          <div className="absolute bottom-2 left-2 right-2 bg-red-100 border border-red-300 rounded p-2 text-xs text-red-700 space-y-1">
            {dropZoneErrors.map((error, index) => (
              <div key={index} className="flex items-center gap-1">
                <span aria-hidden="true">⚠️</span>
                {error}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }, [
    dropRef, 
    getDropZoneClassName, 
    getAcceptedTypesText, 
    maxFiles, 
    maxFileSize, 
    disabled, 
    isDragActive, 
    isDragAccept, 
    isDragReject, 
    dropZoneErrors
  ]);

  return {
    dropRef,
    isDragActive,
    isDragAccept,
    isDragReject,
    dropZoneErrors,
    getDropZoneClassName,
    DropZone,
    // Helper functions
    validateFiles,
    getAcceptedTypesText,
    // State setters for manual control
    setDropZoneErrors
  };
};

export default useDragAndDrop;

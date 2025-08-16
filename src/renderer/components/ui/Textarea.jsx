import React, { forwardRef } from 'react';

const Textarea = forwardRef(function Textarea(
  { className = '', invalid = false, autoExpand = false, ...rest },
  ref,
) {
  const invalidClass = invalid
    ? 'border-system-red focus:ring-system-red/20'
    : '';
  const autoExpandClass = autoExpand ? 'auto-expand' : '';
  const classes =
    `form-textarea-enhanced ${invalidClass} ${autoExpandClass} ${className}`.trim();
  return <textarea ref={ref} className={classes} {...rest} />;
});

export default Textarea;

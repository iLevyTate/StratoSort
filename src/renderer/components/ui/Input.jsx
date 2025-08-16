import React, { forwardRef } from 'react';

const Input = forwardRef(function Input(
  { className = '', invalid = false, ...rest },
  ref,
) {
  const invalidClass = invalid
    ? 'border-system-red focus:ring-system-red/20'
    : '';
  const classes = `form-input-enhanced ${invalidClass} ${className}`.trim();
  return <input ref={ref} className={classes} {...rest} />;
});

export default Input;

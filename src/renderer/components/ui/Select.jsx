import React, { forwardRef } from 'react';

const Select = forwardRef(function Select(
  { className = '', invalid = false, children, ...rest },
  ref
) {
  const invalidClass = invalid ? 'border-system-red focus:ring-system-red/20' : '';
  const classes = `form-input-enhanced ${invalidClass} ${className}`.trim();
  return (
    <select ref={ref} className={classes} {...rest}>
      {children}
    </select>
  );
});

export default Select;



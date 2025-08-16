module.exports = function sanitizeHtml(input, _options = {}) {
  if (typeof input !== 'string') return input;
  // Remove script/style blocks entirely (including their content)
  let output = input.replace(
    /<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
    '',
  );
  // Strip all remaining tags and attributes
  output = output.replace(/<[^>]*>/g, '');
  return output;
};

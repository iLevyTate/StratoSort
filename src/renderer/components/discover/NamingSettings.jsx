import React from 'react';
import Select from '../ui/Select';
import Input from '../ui/Input';

function NamingSettings({
  namingConvention,
  setNamingConvention,
  dateFormat,
  setDateFormat,
  caseConvention,
  setCaseConvention,
  separator,
  setSeparator
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
      <div>
        <label className="block text-xs font-medium text-system-gray-700 mb-2">Convention</label>
        <Select value={namingConvention} onChange={(e) => setNamingConvention(e.target.value)}>
          <option value="subject-date">subject-date</option>
          <option value="date-subject">date-subject</option>
          <option value="project-subject-date">project-subject-date</option>
          <option value="category-subject">category-subject</option>
          <option value="keep-original">keep-original</option>
        </Select>
      </div>
      <div>
        <label className="block text-xs font-medium text-system-gray-700 mb-2">Date format</label>
        <Select value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}>
          <option value="YYYY-MM-DD">YYYY-MM-DD</option>
          <option value="MM-DD-YYYY">MM-DD-YYYY</option>
          <option value="DD-MM-YYYY">DD-MM-YYYY</option>
          <option value="YYYYMMDD">YYYYMMDD</option>
        </Select>
      </div>
      <div>
        <label className="block text-xs font-medium text-system-gray-700 mb-2">Case</label>
        <Select value={caseConvention} onChange={(e) => setCaseConvention(e.target.value)}>
          <option value="kebab-case">kebab-case</option>
          <option value="snake_case">snake_case</option>
          <option value="camelCase">camelCase</option>
          <option value="PascalCase">PascalCase</option>
          <option value="lowercase">lowercase</option>
          <option value="UPPERCASE">UPPERCASE</option>
        </Select>
      </div>
      <div>
        <label className="block text-xs font-medium text-system-gray-700 mb-2">Separator</label>
        <Input value={separator} onChange={(e) => setSeparator(e.target.value)} placeholder="-" />
      </div>
    </div>
  );
}

export default NamingSettings;



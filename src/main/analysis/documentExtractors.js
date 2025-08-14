const fs = require('fs').promises;
const pdf = require('pdf-parse');
const sharp = require('sharp');
const tesseract = require('node-tesseract-ocr');
const mammoth = require('mammoth');
const officeParser = require('officeparser');
const XLSX = require('xlsx-populate');

const { FileProcessingError } = require('../errors/AnalysisError');

async function extractTextFromPdf(filePath, fileName) {
  const dataBuffer = await fs.readFile(filePath);
  const pdfData = await pdf(dataBuffer);
  if (!pdfData.text || pdfData.text.trim().length === 0) {
    throw new FileProcessingError('PDF_NO_TEXT_CONTENT', fileName, { suggestion: 'PDF may be image-based or corrupted' });
  }
  return pdfData.text;
}

async function ocrPdfIfNeeded(filePath) {
  try {
    const pdfBuffer = await fs.readFile(filePath);
    const rasterPng = await sharp(pdfBuffer, { density: 200 }).png().toBuffer();
    const ocrText = await tesseract.recognize(rasterPng, { lang: 'eng', oem: 1, psm: 3 });
    return ocrText && ocrText.trim().length > 0 ? ocrText : '';
  } catch {
    return '';
  }
}

async function extractTextFromDoc(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || '';
  } catch {
    return await fs.readFile(filePath, 'utf8');
  }
}

async function extractTextFromDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  if (!result.value || result.value.trim().length === 0) throw new Error('No text content in DOCX');
  return result.value;
}

async function extractTextFromXlsx(filePath) {
  const workbook = await XLSX.fromFileAsync(filePath);
  const sheets = workbook.sheets();
  let allText = '';
  for (const sheet of sheets) {
    const usedRange = sheet.usedRange();
    if (usedRange) {
      const values = usedRange.value();
      if (Array.isArray(values)) {
        for (const row of values) {
          if (Array.isArray(row)) {
            allText += row.filter(cell => cell !== null && cell !== undefined).join(' ') + '\n';
          }
        }
      }
    }
  }
  allText = allText.trim();
  if (!allText) throw new Error('No text content in XLSX');
  return allText;
}

async function extractTextFromPptx(filePath) {
  const text = await officeParser.parseOfficeAsync(filePath);
  if (!text || text.trim().length === 0) throw new Error('No text content in PPTX');
  return text;
}

function extractPlainTextFromRtf(rtf) {
  try {
    const decoded = rtf.replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => {
      try { return String.fromCharCode(parseInt(hex, 16)); } catch { return ''; }
    });
    const noGroups = decoded.replace(/[{}]/g, '');
    const noControls = noGroups.replace(/\\[a-zA-Z]+-?\d* ?/g, '');
    return noControls.replace(/\s+/g, ' ').trim();
  } catch {
    return rtf;
  }
}

function extractPlainTextFromHtml(html) {
  try {
    const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    const withoutStyles = withoutScripts.replace(/<style[\s\S]*?<\/style>/gi, '');
    const withoutTags = withoutStyles.replace(/<[^>]+>/g, ' ');
    const entitiesDecoded = withoutTags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'");
    return entitiesDecoded.replace(/\s+/g, ' ').trim();
  } catch {
    return html;
  }
}

module.exports = {
  extractTextFromPdf,
  ocrPdfIfNeeded,
  extractTextFromDoc,
  extractTextFromDocx,
  extractTextFromXlsx,
  extractTextFromPptx,
  extractPlainTextFromRtf,
  extractPlainTextFromHtml,
};



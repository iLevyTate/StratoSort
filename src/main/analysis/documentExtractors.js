const fs = require('fs').promises;
const path = require('path');
const pdf = require('pdf-parse');
const sharp = require('sharp');
const tesseract = require('node-tesseract-ocr');
const mammoth = require('mammoth');
const officeParser = require('officeparser');
const XLSX = require('xlsx-populate');
const AdmZip = require('adm-zip');

const { FileProcessingError } = require('../errors/AnalysisError');

async function extractTextFromPdf(filePath, fileName) {
  const dataBuffer = await fs.readFile(filePath);
  const pdfData = await pdf(dataBuffer);
  if (!pdfData.text || pdfData.text.trim().length === 0) {
    throw new FileProcessingError('PDF_NO_TEXT_CONTENT', fileName, {
      suggestion: 'PDF may be image-based or corrupted',
    });
  }
  return pdfData.text;
}

async function ocrPdfIfNeeded(filePath) {
  try {
    const pdfBuffer = await fs.readFile(filePath);
    const rasterPng = await sharp(pdfBuffer, { density: 200 }).png().toBuffer();
    const ocrText = await tesseract.recognize(rasterPng, {
      lang: 'eng',
      oem: 1,
      psm: 3,
    });
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
  if (!result.value || result.value.trim().length === 0)
    throw new Error('No text content in DOCX');
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
            allText +=
              row
                .filter((cell) => cell !== null && cell !== undefined)
                .join(' ') + '\n';
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
  const result = await officeParser.parseOfficeAsync(filePath);
  const text =
    typeof result === 'string' ? result : (result && result.text) || '';
  if (!text || text.trim().length === 0)
    throw new Error('No text content in PPTX');
  return text;
}

function extractPlainTextFromRtf(rtf) {
  try {
    const decoded = rtf.replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return '';
      }
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
    const withoutStyles = withoutScripts.replace(
      /<style[\s\S]*?<\/style>/gi,
      '',
    );
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

// Generic ODF extractor: reads content.xml from ZIP and strips tags
async function extractTextFromOdfZip(filePath) {
  const zip = new AdmZip(filePath);
  const entry = zip.getEntry('content.xml');
  if (!entry) return '';
  const xml = entry.getData().toString('utf8');
  return extractPlainTextFromHtml(xml);
}

async function extractTextFromEpub(filePath) {
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();
  let text = '';
  for (const e of entries) {
    const name = e.entryName.toLowerCase();
    if (
      name.endsWith('.xhtml') ||
      name.endsWith('.html') ||
      name.endsWith('.htm')
    ) {
      try {
        const html = e.getData().toString('utf8');
        text += extractPlainTextFromHtml(html) + '\n';
      } catch {}
    }
  }
  return text.trim();
}

async function extractTextFromEml(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parts = raw.split(/\r?\n\r?\n/);
  const headers = parts[0] || '';
  const body = parts.slice(1).join('\n\n');
  const subject = (headers.match(/^Subject:\s*(.*)$/im) || [])[1] || '';
  const from = (headers.match(/^From:\s*(.*)$/im) || [])[1] || '';
  const to = (headers.match(/^To:\s*(.*)$/im) || [])[1] || '';
  return [subject, from, to, body].filter(Boolean).join('\n');
}

async function extractTextFromMsg(filePath) {
  // Best-effort using officeparser; if unavailable, return empty string
  try {
    const result = await officeParser.parseOfficeAsync(filePath);
    const text =
      typeof result === 'string' ? result : (result && result.text) || '';
    return text || '';
  } catch {
    return '';
  }
}

async function extractTextFromKml(filePath) {
  const xml = await fs.readFile(filePath, 'utf8');
  return extractPlainTextFromHtml(xml);
}

async function extractTextFromKmz(filePath) {
  const zip = new AdmZip(filePath);
  const kmlEntry =
    zip.getEntry('doc.kml') ||
    zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith('.kml'));
  if (!kmlEntry) return '';
  const xml = kmlEntry.getData().toString('utf8');
  return extractPlainTextFromHtml(xml);
}

async function extractTextFromXls(filePath) {
  try {
    const result = await officeParser.parseOfficeAsync(filePath);
    const text =
      typeof result === 'string' ? result : (result && result.text) || '';
    if (text && text.trim()) return text;
  } catch {}
  return '';
}

async function extractTextFromPpt(filePath) {
  try {
    const result = await officeParser.parseOfficeAsync(filePath);
    const text =
      typeof result === 'string' ? result : (result && result.text) || '';
    return text || '';
  } catch {
    return '';
  }
}

module.exports = {
  extractTextFromPdf,
  ocrPdfIfNeeded,
  extractTextFromDoc,
  extractTextFromDocx,
  extractTextFromXlsx,
  extractTextFromPptx,
  extractTextFromXls,
  extractTextFromPpt,
  extractTextFromOdfZip,
  extractTextFromEpub,
  extractTextFromEml,
  extractTextFromMsg,
  extractTextFromKml,
  extractTextFromKmz,
  extractPlainTextFromRtf,
  extractPlainTextFromHtml,
};

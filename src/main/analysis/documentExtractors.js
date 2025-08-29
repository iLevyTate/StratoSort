const fs = require('fs').promises;
const path = require('path');
const pdf = require('pdf-parse');
const sharp = require('sharp');
const tesseract = require('node-tesseract-ocr');
const mammoth = require('mammoth');
const officeParser = require('officeparser');
const XLSX = require('xlsx-populate');
const AdmZip = require('adm-zip');

const { logger } = require('../../shared/logger');
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
  } catch (error) {
    // Log OCR failure with details for debugging
    logger.warn(
      `[OCR] Failed to extract text from PDF ${path.basename(filePath)}:`,
      {
        error: error.message,
        stack: error.stack,
        suggestion:
          'OCR may be unavailable or PDF may be corrupted. Consider installing Tesseract OCR or checking PDF integrity.',
      },
    );

    // Return empty string on OCR failure as expected by tests
    return '';
  }
}

async function extractTextFromDoc(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value && result.value.trim() ? result.value : '';
  } catch (mammothError) {
    logger.debug(
      `[DOC-EXTRACT] Mammoth extraction failed for ${path.basename(filePath)}, trying fallback:`,
      mammothError.message,
    );

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const textContent = content.toString('utf8');
      if (textContent && textContent.trim()) {
        logger.info(
          `[DOC-EXTRACT] Successfully extracted text using fallback method for ${path.basename(filePath)}`,
        );
        return textContent;
      } else {
        throw new Error(
          'File appears to be binary or contains no readable text',
        );
      }
    } catch (fallbackError) {
      logger.warn(
        `[DOC-EXTRACT] Both primary and fallback extraction failed for ${path.basename(filePath)}:`,
        {
          mammothError: mammothError.message,
          fallbackError: fallbackError.message,
          suggestion:
            'DOC file may be corrupted, password-protected, or in an unsupported format.',
        },
      );

      throw new FileProcessingError(
        'DOC_PROCESSING_FAILURE',
        path.basename(filePath),
        {
          originalError: mammothError.message,
          fallbackError: fallbackError.message,
          suggestion:
            'DOC file extraction failed. File may be corrupted, password-protected, or in an unsupported format.',
        },
      );
    }
  }
}

async function extractTextFromDocx(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    if (!result.value || result.value.trim().length === 0) {
      throw new FileProcessingError('DOCX_NO_TEXT', path.basename(filePath), {
        suggestion: 'Ensure the DOCX has readable text content',
      });
    }
    return result.value;
  } catch (error) {
    if (error instanceof FileProcessingError) throw error;
    throw new FileProcessingError(
      'DOCX_PROCESSING_FAILURE',
      path.basename(filePath),
      { originalError: error.message },
    );
  }
}

async function extractTextFromXlsx(filePath) {
  try {
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
    if (!allText) {
      throw new FileProcessingError('XLSX_NO_TEXT', path.basename(filePath), {
        suggestion: 'Ensure the XLSX file contains readable text content',
      });
    }
    return allText;
  } catch (error) {
    if (error instanceof FileProcessingError) throw error;
    throw new FileProcessingError(
      'XLSX_PROCESSING_FAILURE',
      path.basename(filePath),
      { originalError: error.message },
    );
  }
}

async function extractTextFromPptx(filePath) {
  try {
    const result = await officeParser.parseOfficeAsync(filePath);
    const text =
      typeof result === 'string' ? result : (result && result.text) || '';
    if (!text || text.trim().length === 0) {
      throw new FileProcessingError('PPTX_NO_TEXT', path.basename(filePath), {
        suggestion: 'Ensure the PPTX file contains readable text content',
      });
    }
    return text;
  } catch (error) {
    if (error instanceof FileProcessingError) throw error;
    throw new FileProcessingError(
      'PPTX_PROCESSING_FAILURE',
      path.basename(filePath),
      { originalError: error.message },
    );
  }
}

function extractPlainTextFromRtf(rtf) {
  try {
    const decoded = rtf.replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch (hexError) {
        logger.debug(
          '[RTF-EXTRACT] Failed to decode hex sequence:',
          hexError.message,
        );
        return '';
      }
    });
    const noGroups = decoded.replace(/[{}]/g, '');
    const noControls = noGroups.replace(/\\[a-zA-Z]+-?\d* ?/g, '');
    return noControls.replace(/\s+/g, ' ').trim();
  } catch (error) {
    logger.debug(
      '[RTF-EXTRACT] Failed to extract plain text from RTF:',
      error.message,
    );
    return rtf; // Return original as fallback
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
  } catch (error) {
    logger.debug(
      '[HTML-EXTRACT] Failed to extract plain text from HTML:',
      error.message,
    );
    return html; // Return original as fallback
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
      } catch (entryError) {
        logger.debug(
          `[EPUB-EXTRACT] Failed to extract text from entry ${e.entryName}:`,
          entryError.message,
        );
        // Continue processing other entries rather than failing completely
      }
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
  } catch (error) {
    // Log the error but don't throw - MSG files are often problematic
    logger.warn(
      `[MSG-EXTRACT] Failed to extract text from ${path.basename(filePath)}: ${error.message}`,
    );
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
    throw new Error('No text content found in XLS file');
  } catch (error) {
    throw new FileProcessingError(
      'XLS_PROCESSING_FAILURE',
      path.basename(filePath),
      {
        originalError: error.message,
        suggestion: 'File may be corrupted or password-protected',
      },
    );
  }
}

async function extractTextFromPpt(filePath) {
  try {
    const result = await officeParser.parseOfficeAsync(filePath);
    const text =
      typeof result === 'string' ? result : (result && result.text) || '';
    if (text && text.trim()) return text;
    throw new Error('No text content found in PPT file');
  } catch (error) {
    throw new FileProcessingError(
      'PPT_PROCESSING_FAILURE',
      path.basename(filePath),
      {
        originalError: error.message,
        suggestion: 'File may be corrupted or password-protected',
      },
    );
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
  FileProcessingError,
};

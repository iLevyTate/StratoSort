const fs = require('fs').promises;
const path = require('path');
const { Ollama } = require('ollama');
const SettingsService = require('../services/SettingsService');

// Enforce required dependency for AI-first operation
const pdf = require('pdf-parse');
const sharp = require('sharp');
const tesseract = require('node-tesseract-ocr');
const mammoth = require('mammoth');
const officeParser = require('officeparser');
const XLSX = require('xlsx-populate');

// Import error handling system
const { 
  AnalysisError, 
  ModelMissingError, 
  FileProcessingError,
  OllamaConnectionError 
} = require('../errors/AnalysisError');
const ModelVerifier = require('../services/ModelVerifier');

// App configuration (simplified) - Optimized for speed
const AppConfig = {
  ai: {
    textAnalysis: {
      defaultModel: 'llama3.2:latest', // Fastest 2GB model instead of 3.3GB gemma3:4b
      defaultHost: 'http://127.0.0.1:11434',
      timeout: 60000, // Reduced to 1 minute for faster model
      maxContentLength: 12000,
      temperature: 0.1,
      maxTokens: 800,
    }
  }
};

// Initialize Ollama client with verification
const settingsServiceDoc = new SettingsService();
let ollamaClient = null;
async function getOllamaClient() {
  if (!ollamaClient) {
    const host = (await settingsServiceDoc.getSettings()).ollamaHost || AppConfig.ai.textAnalysis.defaultHost;
    ollamaClient = new Ollama({ host });
  }
  return ollamaClient;
}
const modelVerifier = new ModelVerifier();

async function analyzeTextWithOllama(textContent, originalFileName, smartFolders = []) {
  try {
    console.log(`Analyzing document content with Ollama model: ${AppConfig.ai.textAnalysis.defaultModel}`);
    
    // Build folder categories string for the prompt with validation
    let folderCategoriesStr = '';
    if (smartFolders && smartFolders.length > 0) {
      // Validate that smart folders exist and have valid names
      const validFolders = smartFolders.filter(f => 
        f && 
        f.name && 
        typeof f.name === 'string' && 
        f.name.trim().length > 0 &&
        f.name.length < 50 // Reasonable name length limit
      );
      
      if (validFolders.length > 0) {
        const folderList = validFolders
          .map(f => `"${f.name.trim()}"`)
          .slice(0, 10) // Limit to 10 folders to avoid prompt bloat
          .join(', ');
        
        folderCategoriesStr = `\n\nCRITICAL: The user has these smart folders configured: ${folderList}. You MUST choose the category from this exact list. Do NOT create new categories. If the document doesn't clearly fit any of these folders, choose the closest match or use the first folder as a fallback.`;
      }
    }
    
    const prompt = `You are an expert document analyzer. Analyze the ACTUAL TEXT CONTENT below (not just the filename) and extract structured information based on what the document actually contains.

IMPORTANT: Base your analysis on the CONTENT, not the filename "${originalFileName}". Read through the text carefully to understand the document's true purpose, topics, and themes.

Your response MUST be a valid JSON object with ALL these fields:
{
  "date": "YYYY-MM-DD format if found in content, otherwise today's date",
  "project": "main subject/project from content (2-5 words)",
  "purpose": "document's purpose based on content (5-10 words)",
  "category": "most appropriate category"${folderCategoriesStr},
  "keywords": ["keyword1", "keyword2", "keyword3"], // REQUIRED: 3-7 keywords from the ACTUAL CONTENT
  "confidence": 85, // number between 60-100
  "suggestedName": "descriptive_name_based_on_content" // underscores, max 50 chars
}

CRITICAL REQUIREMENTS:
1. The keywords array MUST contain 3-7 keywords extracted from the document content
2. Keywords should be specific terms, concepts, or topics mentioned in the text
3. Do NOT return an empty keywords array
4. Base ALL fields on the actual document content, not the filename

Document content (${textContent.length} characters):
${textContent.substring(0, AppConfig.ai.textAnalysis.maxContentLength)}`;

    const client = await getOllamaClient();
    const model = (await settingsServiceDoc.getSettings()).textModel || AppConfig.ai.textAnalysis.defaultModel;
    const response = await client.generate({
      model,
      prompt,
      options: {
        temperature: AppConfig.ai.textAnalysis.temperature,
        num_predict: AppConfig.ai.textAnalysis.maxTokens,
      },
      format: 'json',
    });

    if (response.response) {
      try {
        console.log(`[AI-RAW-RESPONSE] Raw JSON from Ollama: ${response.response}`);
        const parsedJson = JSON.parse(response.response);
        
        // Validate and structure the date
        if (parsedJson.date) {
          try {
            parsedJson.date = new Date(parsedJson.date).toISOString().split('T')[0];
          } catch (e) {
            delete parsedJson.date;
            console.warn('Ollama returned an invalid date for document, omitting.');
          }
        }
        
        // Ensure array fields are initialized if undefined
        const finalKeywords = Array.isArray(parsedJson.keywords) ? parsedJson.keywords : [];
        
        // Log what we got for keywords
        console.log(`[AI-KEYWORDS-CHECK] Keywords from AI: ${JSON.stringify(parsedJson.keywords)} -> Final: ${JSON.stringify(finalKeywords)}`);
        
        // Ensure confidence is a reasonable number
        if (!parsedJson.confidence || parsedJson.confidence < 60 || parsedJson.confidence > 100) {
          parsedJson.confidence = Math.floor(Math.random() * 30) + 70; // 70-100%
        }

        return {
          rawText: textContent.substring(0, 2000),
          ...parsedJson,
          keywords: finalKeywords,
        };
      } catch (e) {
        console.error('Error parsing Ollama JSON response for document:', e.message);
        return { 
          error: 'Failed to parse document analysis from Ollama.', 
          keywords: [],
          confidence: 65
        };
      }
    }
    
    return { 
      error: 'No content in Ollama response for document', 
      keywords: [],
      confidence: 60
    };
  } catch (error) {
    console.error('Error calling Ollama API for document:', error.message);
    return { 
      error: `Ollama API error for document: ${error.message}`, 
      keywords: [],
      confidence: 60
    };
  }
}

async function analyzeDocumentFile(filePath, smartFolders = []) {
  console.log(`Analyzing document file: ${filePath}`);
  const fileExtension = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  // Pre-flight checks for AI-first operation
  try {
    const connectionCheck = await modelVerifier.checkOllamaConnection();
    if (!connectionCheck.connected) {
      throw new Error(`Ollama connection failed: ${connectionCheck.error}`);
    }
  } catch (error) {
    console.error('Pre-flight verification failed:', error.message);
    throw error;
  }

  try {
    let extractedText = null;

    if (fileExtension === '.pdf') {
      const dataBuffer = await fs.readFile(filePath);
      try {
        const pdfData = await pdf(dataBuffer);
        extractedText = pdfData.text;
        
        if (!extractedText || extractedText.trim().length === 0) {
          throw new FileProcessingError('PDF_NO_TEXT_CONTENT', fileName, {
            suggestion: 'PDF may be image-based or corrupted'
          });
        }
      } catch (pdfError) {
        console.error(`Error parsing PDF ${fileName}:`, pdfError.message);
        throw new FileProcessingError('PDF_PROCESSING_FAILURE', fileName, {
          originalError: pdfError.message,
          suggestion: 'PDF may be corrupted, password-protected, or image-based'
        });
      }
    } else if (['.txt', '.md', '.rtf', '.json', '.csv', '.xml', '.html', '.htm', '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.css', '.scss', '.sass', '.less', '.sql', '.sh', '.bat', '.ps1', '.yaml', '.yml', '.ini', '.conf', '.log', '.doc'].includes(fileExtension)) {
      // Read text files directly
      try {
        if (fileExtension === '.doc') {
          // Handle legacy .doc files - try mammoth first, fallback to text
          try {
            const result = await mammoth.extractRawText({ path: filePath });
            extractedText = result.value;
            console.log(`Extracted ${extractedText.length} characters from .doc file using mammoth`);
          } catch (docError) {
            console.warn(`Mammoth failed for .doc file, trying text extraction:`, docError.message);
            extractedText = await fs.readFile(filePath, 'utf8');
          }
        } else {
          // Regular text file reading with basic format-aware cleanup
          const raw = await fs.readFile(filePath, 'utf8');
          if (fileExtension === '.rtf') {
            extractedText = extractPlainTextFromRtf(raw);
          } else if (fileExtension === '.html' || fileExtension === '.htm' || fileExtension === '.xml') {
            extractedText = extractPlainTextFromHtml(raw);
          } else {
            extractedText = raw;
          }
        }
        
        if (!extractedText || extractedText.trim().length === 0) {
          throw new FileProcessingError('FILE_EMPTY', fileName, {
            suggestion: 'File appears to be empty or unreadable'
          });
        }
        
        console.log(`Successfully extracted ${extractedText.length} characters from ${fileName}`);
        
      } catch (textError) {
        console.error(`Error reading text file ${fileName}:`, textError.message);
        throw new FileProcessingError('DOCUMENT_ANALYSIS_FAILURE', fileName, {
          originalError: textError.message,
          suggestion: 'File may be corrupted or access denied'
        });
      }
    } else if (fileExtension === '.docx' || fileExtension === '.xlsx' || fileExtension === '.pptx') {
      // Extract content from Office documents
      try {
        console.log(`Extracting content from Office document: ${fileName}`);
        
        if (fileExtension === '.docx') {
          // Extract text from Word document using mammoth
          const result = await mammoth.extractRawText({ path: filePath });
          extractedText = result.value;
          
          if (!extractedText || extractedText.trim().length === 0) {
            throw new Error('No text content found in Word document');
          }
        } else if (fileExtension === '.xlsx') {
          // Extract text from Excel using xlsx-populate
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
          
          extractedText = allText.trim();
          
          if (!extractedText || extractedText.length === 0) {
            throw new Error('No text content found in Excel document');
          }
        } else if (fileExtension === '.pptx') {
          // Extract text from PowerPoint using officeparser
          extractedText = await officeParser.parseOfficeAsync(filePath);
          
          if (!extractedText || extractedText.trim().length === 0) {
            throw new Error('No text content found in PowerPoint document');
          }
        }
        
        console.log(`Successfully extracted ${extractedText.length} characters from ${fileName}`);
        
      } catch (officeError) {
        console.error(`Error extracting content from ${fileName}:`, officeError.message);
        
        // Fall back to intelligent filename-based analysis
      const intelligentCategory = getIntelligentCategory(fileName, fileExtension, smartFolders);
      const intelligentKeywords = getIntelligentKeywords(fileName, fileExtension);
      
        let purpose = 'Office document (content extraction failed)';
        let confidence = 70;
      
      if (fileExtension === '.docx') {
          purpose = 'Word document - content extraction failed, using filename analysis';
      } else if (fileExtension === '.xlsx') {
          purpose = 'Excel spreadsheet - content extraction failed, using filename analysis';
      } else if (fileExtension === '.pptx') {
          purpose = 'PowerPoint presentation - content extraction failed, using filename analysis';
      }
      
      return {
        purpose,
        project: fileName.replace(fileExtension, ''),
        category: intelligentCategory,
        date: new Date().toISOString().split('T')[0],
        keywords: intelligentKeywords,
        confidence,
          suggestedName: fileName.replace(fileExtension, '').replace(/[^a-zA-Z0-9_-]/g, '_'),
          extractionError: officeError.message
      };
      }
    } else if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(fileExtension)) {
      // Archive metadata inspection (best-effort)
      const archiveInfo = await tryExtractArchiveMetadata(filePath);
      const keywords = archiveInfo.keywords?.slice(0, 7) || getIntelligentKeywords(fileName, fileExtension);
      const category = 'archive';
      return {
        purpose: archiveInfo.summary || 'Archive file',
        project: fileName.replace(fileExtension, ''),
        category,
        date: new Date().toISOString().split('T')[0],
        keywords,
        confidence: 70,
        suggestedName: fileName.replace(fileExtension, '').replace(/[^a-zA-Z0-9_-]/g, '_'),
        extractionMethod: 'archive'
      };
    } else {
      // Placeholder for other document types
      console.warn(`[FILENAME-FALLBACK] No content parser for ${fileExtension}. Using filename-only analysis for ${fileName}.`);
      
      // Intelligent category detection based on filename and extension
      const intelligentCategory = getIntelligentCategory(fileName, fileExtension, smartFolders);
      const intelligentKeywords = getIntelligentKeywords(fileName, fileExtension);
      
      return {
        purpose: `${intelligentCategory.charAt(0).toUpperCase() + intelligentCategory.slice(1)} document`,
        project: fileName.replace(fileExtension, ''),
        category: intelligentCategory,
        date: new Date().toISOString().split('T')[0],
        keywords: intelligentKeywords,
        confidence: 75, // Higher confidence for pattern-based detection
        suggestedName: fileName.replace(fileExtension, '').replace(/[^a-zA-Z0-9_-]/g, '_'),
        extractionMethod: 'filename' // Mark that this used filename-only analysis
      };
    }

    // If PDF had no extractable text, attempt OCR on a rasterized page
    if (fileExtension === '.pdf' && (!extractedText || extractedText.trim().length === 0)) {
      try {
        const pdfBuffer = await fs.readFile(filePath);
        try {
          // Try to rasterize (this may be unsupported depending on libvips build)
          const rasterPng = await sharp(pdfBuffer, { density: 200 })
            .png()
            .toBuffer();
          const ocrText = await tesseract.recognize(rasterPng, { lang: 'eng', oem: 1, psm: 3 });
          if (ocrText && ocrText.trim().length > 0) {
            extractedText = ocrText;
          }
        } catch (rasterErr) {
          console.warn('[PDF-OCR] Rasterization not available in this environment, skipping OCR');
        }
      } catch (ocrErr) {
        console.warn('[PDF-OCR] OCR attempt failed:', ocrErr.message);
      }
    }

    if (extractedText && extractedText.trim().length > 0) {
      console.log(`[CONTENT-ANALYSIS] Processing ${fileName}: ${extractedText.length} chars extracted, sending to AI...`);
      console.log(`[CONTENT-PREVIEW] First 200 chars: "${extractedText.substring(0, 200)}..."`);
      
      const analysis = await analyzeTextWithOllama(extractedText, fileName, smartFolders);
      
      if (analysis && !analysis.error) {
        console.log(`[AI-ANALYSIS-SUCCESS] ${fileName}: category="${analysis.category}", keywords=[${analysis.keywords?.join(', ')}]`);
        return {
          ...analysis,
          keywords: Array.isArray(analysis.keywords) ? analysis.keywords : [],
          category: analysis.category || 'document',
          contentLength: extractedText.length, // Add metadata about content extraction
          extractionMethod: 'content'
        };
      }
      
      console.warn(`[AI-ANALYSIS-FAILED] ${fileName}: Content extracted but AI analysis failed`);
      return {
        rawText: extractedText.substring(0, 500),
        keywords: Array.isArray(analysis.keywords) ? analysis.keywords : ['document', 'analysis_failed'],
        purpose: 'Text extracted, but Ollama analysis failed.',
        project: fileName,
        date: new Date().toISOString().split('T')[0],
        category: 'document',
        confidence: 60,
        error: analysis?.error || 'Ollama analysis failed for document content.',
        contentLength: extractedText.length,
        extractionMethod: 'content'
      };
    }

    console.error(`[EXTRACTION-FAILED] ${fileName}: Could not extract any text content`);
    return {
      error: 'Could not extract text or analyze document.',
      project: fileName,
      category: 'document',
      date: new Date().toISOString().split('T')[0],
      keywords: [],
      confidence: 50,
      extractionMethod: 'failed'
    };

  } catch (error) {
    console.error(`Error processing document ${filePath}:`, error.message);
    
    // Re-throw operational errors with context
    if (error.isOperational) {
      throw error;
    }
    
    // Wrap unexpected errors
    throw new FileProcessingError('DOCUMENT_ANALYSIS_FAILURE', fileName, {
      originalError: error.message,
      suggestion: 'Unexpected error during document processing'
    });
  }
}

// Basic RTF to text converter (best-effort)
function extractPlainTextFromRtf(rtf) {
  try {
    // Decode hex escapes like \'xx to characters
    const decoded = rtf.replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => {
      try { return String.fromCharCode(parseInt(hex, 16)); } catch { return ''; }
    });
    // Remove RTF groups and control words
    const noGroups = decoded.replace(/[{}]/g, '');
    const noControls = noGroups.replace(/\\[a-zA-Z]+-?\d* ?/g, '');
    // Collapse whitespace
    return noControls.replace(/\s+/g, ' ').trim();
  } catch {
    return rtf;
  }
}

// Basic HTML to text (strip tags and decode common entities)
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

// Best-effort archive metadata extraction (ZIP only without external deps)
async function tryExtractArchiveMetadata(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const info = { keywords: [], summary: '' };
  if (ext === '.zip') {
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries().slice(0, 50);
      const names = entries.map(e => e.entryName);
      info.keywords = deriveKeywordsFromFilenames(names);
      info.summary = `ZIP archive with ${zip.getEntries().length} entries`;
      return info;
    } catch (e) {
      info.summary = 'ZIP archive (content listing unavailable)';
      info.keywords = [];
      return info;
    }
  }
  info.summary = `${ext.substring(1).toUpperCase()} archive`;
  info.keywords = [];
  return info;
}

function deriveKeywordsFromFilenames(names) {
  const exts = {};
  const tokens = new Set();
  names.forEach(n => {
    const b = n.split('/').pop();
    const e = (b.includes('.') ? b.split('.').pop() : '').toLowerCase();
    if (e) exts[e] = (exts[e] || 0) + 1;
    b.replace(/[^a-zA-Z0-9]+/g, ' ').toLowerCase().split(' ').forEach(w => {
      if (w && w.length > 2 && w.length < 20) tokens.add(w);
    });
  });
  const topExts = Object.entries(exts).sort((a,b) => b[1]-a[1]).slice(0,3).map(([k]) => k);
  return [...topExts, ...Array.from(tokens)].slice(0, 15);
}

// Intelligent fallback analysis for unsupported file types
function getIntelligentCategory(fileName, extension, smartFolders = []) {
  const lowerFileName = fileName.toLowerCase();
  
  // Enhanced smart folder matching with LLM-like scoring
  if (smartFolders && smartFolders.length > 0) {
    const validFolders = smartFolders.filter(f => 
      f && f.name && typeof f.name === 'string' && f.name.trim().length > 0
    );
    
    // Advanced score-based matching for better accuracy
    let bestMatch = null;
    let bestScore = 0;
    
    for (const folder of validFolders) {
      const folderNameLower = folder.name.toLowerCase();
      let score = 0;
      
      // Direct name match (highest priority - 10 points)
      if (lowerFileName.includes(folderNameLower)) {
        score += 10;
      }
      
      // Partial name matching (8 points)
      const folderWords = folderNameLower.split(/[\s_-]+/).filter(w => w.length > 2);
      for (const word of folderWords) {
        if (lowerFileName.includes(word)) {
          score += 8;
        }
      }
      
      // Description keyword matching (6 points per keyword)
      if (folder.description) {
        const descWords = folder.description.toLowerCase()
          .split(/[\s,.-]+/)
          .filter(word => word.length > 3);
        
        for (const word of descWords) {
          if (lowerFileName.includes(word)) {
            score += 6;
          }
        }
      }
      
      // Semantic tags matching (5 points per tag)
      if (folder.semanticTags && Array.isArray(folder.semanticTags)) {
        for (const tag of folder.semanticTags) {
          if (lowerFileName.includes(tag.toLowerCase())) {
            score += 5;
          }
        }
      }
      
      // Keywords matching (4 points per keyword)
      if (folder.keywords && Array.isArray(folder.keywords)) {
        for (const keyword of folder.keywords) {
          if (lowerFileName.includes(keyword.toLowerCase())) {
            score += 4;
          }
        }
      }
      
      // File path context matching (3 points)
      if (folder.path) {
        const pathParts = folder.path.toLowerCase().split(/[/\\]/).filter(p => p.length > 2);
        for (const part of pathParts) {
          if (lowerFileName.includes(part)) {
            score += 3;
          }
        }
      }
      
      // Category matching (2 points)
      if (folder.category) {
        const categoryWords = folder.category.toLowerCase().split(/[\s_-]+/);
        for (const word of categoryWords) {
          if (word.length > 2 && lowerFileName.includes(word)) {
            score += 2;
          }
        }
      }
      
      // Related folders boost (1 point each)
      if (folder.relatedFolders && Array.isArray(folder.relatedFolders)) {
        for (const relatedName of folder.relatedFolders) {
          if (lowerFileName.includes(relatedName.toLowerCase())) {
            score += 1;
          }
        }
      }
      
      // Confidence score boost
      if (folder.confidenceScore && folder.confidenceScore > 0.8) {
        score *= 1.2; // 20% boost for high-confidence folders
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = folder.name;
      }
    }
    
    // Return best match if score is meaningful (threshold: 5 points)
    if (bestScore >= 5) {
      console.log(`[SMART-FOLDER-MATCH] Matched "${fileName}" to "${bestMatch}" with score ${bestScore}`);
      return bestMatch;
    }
  }
  
  // Enhanced pattern-based categorization with more patterns
  const patterns = {
    // Financial patterns
    financial: [
      'invoice', 'receipt', 'tax', 'financial', 'payment', 'bank', 'budget', 
      'expense', 'income', 'billing', 'statement', 'transaction', 'payroll',
      'accounting', 'audit', 'revenue', 'profit', 'loss', 'balance'
    ],
    
    // Legal patterns
    legal: [
      'contract', 'agreement', 'legal', 'terms', 'policy', 'license', 'patent',
      'trademark', 'copyright', 'compliance', 'regulation', 'law', 'court',
      'litigation', 'settlement', 'clause', 'liability', 'warranty'
    ],
    
    // Project patterns
    project: [
      'project', 'spec', 'requirement', 'proposal', 'plan', 'design', 'scope',
      'milestone', 'deliverable', 'timeline', 'roadmap', 'charter', 'brief',
      'kickoff', 'retrospective', 'sprint', 'agile', 'scrum'
    ],
    
    // Personal patterns
    personal: [
      'resume', 'cv', 'personal', 'letter', 'diary', 'journal', 'notes',
      'family', 'vacation', 'travel', 'health', 'medical', 'insurance',
      'passport', 'certificate', 'diploma', 'education'
    ],
    
    // Technical patterns
    technical: [
      'manual', 'guide', 'technical', 'instruction', 'documentation', 'api',
      'code', 'software', 'hardware', 'system', 'architecture', 'database',
      'server', 'network', 'security', 'backup', 'config', 'setup'
    ],
    
    // Research patterns
    research: [
      'research', 'study', 'analysis', 'report', 'findings', 'data', 'survey',
      'experiment', 'hypothesis', 'methodology', 'results', 'conclusion',
      'whitepaper', 'thesis', 'dissertation', 'publication'
    ],
    
    // Marketing patterns
    marketing: [
      'marketing', 'campaign', 'advertisement', 'promotion', 'brand', 'logo',
      'social', 'media', 'content', 'strategy', 'analytics', 'metrics',
      'conversion', 'lead', 'customer', 'segment', 'target'
    ],
    
    // HR patterns
    hr: [
      'employee', 'staff', 'hiring', 'recruitment', 'onboarding', 'training',
      'performance', 'review', 'evaluation', 'benefits', 'policy', 'handbook',
      'job', 'position', 'salary', 'compensation', 'leave'
    ]
  };
  
  // Score each category
  const categoryScores = {};
  for (const [category, keywords] of Object.entries(patterns)) {
    let score = 0;
    for (const keyword of keywords) {
      if (lowerFileName.includes(keyword)) {
        score += keyword.length; // Longer keywords get higher scores
      }
    }
    if (score > 0) {
      categoryScores[category] = score;
    }
  }
  
  // Return highest scoring category
  if (Object.keys(categoryScores).length > 0) {
    const bestCategory = Object.keys(categoryScores).reduce((a, b) => 
      categoryScores[a] > categoryScores[b] ? a : b
    );
    console.log(`[PATTERN-MATCH] Matched "${fileName}" to "${bestCategory}" with patterns`);
    return bestCategory;
  }
  
  // File extension based categorization (fallback)
  const extensionCategories = {
    '.pdf': 'document',
    '.doc': 'document',
    '.docx': 'document',
    '.txt': 'text',
    '.md': 'documentation',
    '.png': 'image',
    '.jpg': 'image',
    '.jpeg': 'image',
    '.gif': 'image',
    '.svg': 'image',
    '.mp3': 'audio',
    '.wav': 'audio',
    '.mp4': 'video',
    '.avi': 'video',
    '.xlsx': 'spreadsheet',
    '.xls': 'spreadsheet',
    '.csv': 'data',
    '.json': 'data',
    '.xml': 'data',
    '.zip': 'archive',
    '.rar': 'archive',
    '.7z': 'archive'
  };
  
  const category = extensionCategories[extension] || 'document';
  console.log(`[EXTENSION-MATCH] Matched "${fileName}" to "${category}" by extension`);
  return category;
}

function getIntelligentKeywords(fileName, extension) {
  const category = getIntelligentCategory(fileName, extension);
  const lowerFileName = fileName.toLowerCase();
  
  const baseKeywords = {
    'financial': ['financial', 'money', 'business'],
    'legal': ['legal', 'official', 'formal'],
    'project': ['project', 'work', 'development'],
    'personal': ['personal', 'individual', 'private'],
    'technical': ['technical', 'manual', 'guide'],
    'document': ['document', 'file', 'text'],
    'image': ['image', 'visual', 'graphic']
  };
  
  let keywords = baseKeywords[category] || ['file', 'document'];
  
  // Add filename-based keywords
  if (lowerFileName.includes('report')) keywords.push('report');
  if (lowerFileName.includes('summary')) keywords.push('summary');
  if (lowerFileName.includes('analysis')) keywords.push('analysis');
  if (lowerFileName.includes('proposal')) keywords.push('proposal');
  if (lowerFileName.includes('presentation')) keywords.push('presentation');
  
  // Add extension-based keyword
  if (extension) {
    keywords.push(extension.replace('.', ''));
  }
  
  return keywords.slice(0, 7); // Limit to 7 keywords
}

module.exports = {
  analyzeDocumentFile
}; 
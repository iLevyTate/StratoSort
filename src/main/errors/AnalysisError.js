/**
 * Structured Error System for AI-First Document Analysis
 * Provides operational error handling with actionable user guidance
 */

class AnalysisError extends Error {
  constructor(code, metadata = {}) {
    super();
    this.name = 'AnalysisError';
    this.code = code;
    this.metadata = metadata;
    this.isOperational = true;
    this.timestamp = new Date().toISOString();

    // Set error message based on code
    this.message = this.generateMessage();
  }

  generateMessage() {
    const messages = {
      PDF_PROCESSING_FAILURE: 'Failed to extract text from PDF document',
      IMAGE_ANALYSIS_FAILURE: 'Failed to analyze image content',
      AUDIO_ANALYSIS_FAILURE: 'Failed to process audio file',
      MODEL_NOT_INSTALLED: `AI model not found: ${this.metadata.requiredModel}`,
      OLLAMA_CONNECTION_FAILURE: 'Cannot connect to Ollama AI service',
      DOCUMENT_ANALYSIS_FAILURE: 'Document analysis failed',
      PDF_NO_TEXT_CONTENT: 'PDF contains no extractable text',
      MODEL_VERIFICATION_FAILED: 'Failed to verify AI model availability',
      DEPENDENCY_MISSING: `Required dependency missing: ${this.metadata.dependency}`,
      FILE_TYPE_UNSUPPORTED: `Unsupported file type: ${this.metadata.fileType}`,
      FILE_SIZE_EXCEEDED: 'File size exceeds processing limits',
    };

    return messages[this.code] || 'Unknown analysis error';
  }

  getUserFriendlyMessage() {
    const userMessages = {
      PDF_PROCESSING_FAILURE:
        "This PDF file couldn't be processed. It may be corrupted or password-protected.",
      IMAGE_ANALYSIS_FAILURE:
        "This image couldn't be analyzed. Please check the file format and try again.",
      AUDIO_ANALYSIS_FAILURE:
        "This audio file couldn't be processed. Please verify the format is supported.",
      MODEL_NOT_INSTALLED: `Missing AI model: ${this.metadata.requiredModel}. Please install it to continue.`,
      OLLAMA_CONNECTION_FAILURE:
        'Cannot connect to AI service. Please start Ollama and try again.',
      DOCUMENT_ANALYSIS_FAILURE:
        'Failed to analyze this document. Please check the file format.',
      PDF_NO_TEXT_CONTENT:
        'This PDF appears to be image-based. Try using image analysis instead.',
      MODEL_VERIFICATION_FAILED:
        'AI model verification failed. Please check your Ollama installation.',
      DEPENDENCY_MISSING: `System component missing: ${this.metadata.dependency}. Please reinstall the application.`,
      FILE_TYPE_UNSUPPORTED: `File type "${this.metadata.fileType}" is not supported for AI analysis.`,
      FILE_SIZE_EXCEEDED:
        'File is too large for processing. Please use a smaller file.',
    };

    return (
      userMessages[this.code] || 'An unexpected error occurred during analysis.'
    );
  }

  getActionableSteps() {
    const actions = {
      MODEL_NOT_INSTALLED: [`ollama pull ${this.metadata.requiredModel}`],
      OLLAMA_CONNECTION_FAILURE: [
        'ollama serve',
        'Check if Ollama is installed: ollama --version',
      ],
      DEPENDENCY_MISSING: [
        `npm install ${this.metadata.dependency}`,
        'npm install',
      ],
      PDF_NO_TEXT_CONTENT: [
        'Try image analysis instead',
        'Convert PDF to text format',
      ],
      FILE_TYPE_UNSUPPORTED: [
        'Convert file to supported format',
        'Check supported file types in documentation',
      ],
    };

    return actions[this.code] || [];
  }
}

class ModelMissingError extends AnalysisError {
  constructor(modelName) {
    super('MODEL_NOT_INSTALLED', {
      requiredModel: modelName,
      installCommand: `ollama pull ${modelName}`,
      category: 'model',
    });
  }
}

class DependencyMissingError extends AnalysisError {
  constructor(dependencyName) {
    super('DEPENDENCY_MISSING', {
      dependency: dependencyName,
      installCommand: `npm install ${dependencyName}`,
      category: 'dependency',
    });
  }
}

class OllamaConnectionError extends AnalysisError {
  constructor(host = 'http://127.0.0.1:11434') {
    super('OLLAMA_CONNECTION_FAILURE', {
      host,
      category: 'connection',
    });
  }
}

class FileProcessingError extends AnalysisError {
  constructor(code, fileName, additionalMetadata = {}) {
    super(code, {
      fileName,
      fileExtension: require('path').extname(fileName),
      ...additionalMetadata,
    });
  }
}

module.exports = {
  AnalysisError,
  ModelMissingError,
  DependencyMissingError,
  OllamaConnectionError,
  FileProcessingError,
};

const {
  AnalysisError,
  ModelMissingError,
  DependencyMissingError,
  OllamaConnectionError,
  FileProcessingError,
} = require('../src/main/errors/AnalysisError');

describe('AnalysisError', () => {
  describe('AnalysisError base class', () => {
    test('creates error with code and metadata', () => {
      const error = new AnalysisError('PDF_PROCESSING_FAILURE', {
        fileName: 'test.pdf',
        fileSize: 1024,
      });

      expect(error.name).toBe('AnalysisError');
      expect(error.code).toBe('PDF_PROCESSING_FAILURE');
      expect(error.metadata).toEqual({
        fileName: 'test.pdf',
        fileSize: 1024,
      });
      expect(error.isOperational).toBe(true);
      expect(error.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    test('generates correct message for known error codes', () => {
      const testCases = [
        {
          code: 'PDF_PROCESSING_FAILURE',
          expected: 'Failed to extract text from PDF document',
        },
        {
          code: 'IMAGE_ANALYSIS_FAILURE',
          expected: 'Failed to analyze image content',
        },
        {
          code: 'MODEL_NOT_INSTALLED',
          expected: 'AI model not found: test-model',
          metadata: { requiredModel: 'test-model' },
        },
        {
          code: 'OLLAMA_CONNECTION_FAILURE',
          expected: 'Cannot connect to Ollama AI service',
        },
        {
          code: 'PDF_NO_TEXT_CONTENT',
          expected: 'PDF contains no extractable text',
        },
        {
          code: 'UNKNOWN_ERROR',
          expected: 'Unknown analysis error',
        },
      ];

      testCases.forEach(({ code, expected, metadata }) => {
        const error = new AnalysisError(code, metadata);
        expect(error.message).toBe(expected);
      });
    });

    test('provides user-friendly messages', () => {
      const testCases = [
        {
          code: 'PDF_PROCESSING_FAILURE',
          expected:
            "This PDF file couldn't be processed. It may be corrupted or password-protected.",
        },
        {
          code: 'MODEL_NOT_INSTALLED',
          expected:
            'Missing AI model: test-model. Please install it to continue.',
          metadata: { requiredModel: 'test-model' },
        },
        {
          code: 'PDF_NO_TEXT_CONTENT',
          expected:
            'This PDF appears to be image-based. Try using image analysis instead.',
        },
        {
          code: 'UNKNOWN_ERROR',
          expected: 'An unexpected error occurred during analysis.',
        },
      ];

      testCases.forEach(({ code, expected, metadata }) => {
        const error = new AnalysisError(code, metadata);
        expect(error.getUserFriendlyMessage()).toBe(expected);
      });
    });

    test('provides actionable steps for specific errors', () => {
      const testCases = [
        {
          code: 'MODEL_NOT_INSTALLED',
          metadata: { requiredModel: 'test-model' },
          expected: ['ollama pull test-model'],
        },
        {
          code: 'OLLAMA_CONNECTION_FAILURE',
          expected: [
            'ollama serve',
            'Check if Ollama is installed: ollama --version',
          ],
        },
        {
          code: 'PDF_NO_TEXT_CONTENT',
          expected: [
            'Try image analysis instead',
            'Convert PDF to text format',
          ],
        },
        {
          code: 'UNKNOWN_ERROR',
          expected: [],
        },
      ];

      testCases.forEach(({ code, metadata, expected }) => {
        const error = new AnalysisError(code, metadata);
        expect(error.getActionableSteps()).toEqual(expected);
      });
    });

    test('inherits from Error class', () => {
      const error = new AnalysisError('TEST_ERROR');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AnalysisError);
    });

    test('handles missing metadata gracefully', () => {
      const error = new AnalysisError('MODEL_NOT_INSTALLED');
      expect(error.message).toBe('AI model not found: undefined');
      expect(error.getUserFriendlyMessage()).toBe(
        'Missing AI model: undefined. Please install it to continue.',
      );
      expect(error.getActionableSteps()).toEqual(['ollama pull undefined']);
    });
  });

  describe('ModelMissingError', () => {
    test('creates model missing error with proper metadata', () => {
      const error = new ModelMissingError('llama2');

      expect(error.code).toBe('MODEL_NOT_INSTALLED');
      expect(error.metadata).toEqual({
        requiredModel: 'llama2',
        installCommand: 'ollama pull llama2',
        category: 'model',
      });
      expect(error.message).toBe('AI model not found: llama2');
    });

    test('provides correct actionable steps', () => {
      const error = new ModelMissingError('mistral');
      expect(error.getActionableSteps()).toEqual(['ollama pull mistral']);
    });
  });

  describe('DependencyMissingError', () => {
    test('creates dependency missing error with proper metadata', () => {
      const error = new DependencyMissingError('sharp');

      expect(error.code).toBe('DEPENDENCY_MISSING');
      expect(error.metadata).toEqual({
        dependency: 'sharp',
        installCommand: 'npm install sharp',
        category: 'dependency',
      });
      expect(error.message).toBe('Required dependency missing: sharp');
    });

    test('provides correct actionable steps', () => {
      const error = new DependencyMissingError('pdf-parse');
      expect(error.getActionableSteps()).toEqual([
        'npm install pdf-parse',
        'npm install',
      ]);
    });
  });

  describe('OllamaConnectionError', () => {
    test('creates connection error with default host', () => {
      const error = new OllamaConnectionError();

      expect(error.code).toBe('OLLAMA_CONNECTION_FAILURE');
      expect(error.metadata).toEqual({
        host: 'http://127.0.0.1:11434',
        category: 'connection',
      });
      expect(error.message).toBe('Cannot connect to Ollama AI service');
    });

    test('creates connection error with custom host', () => {
      const customHost = 'http://localhost:8080';
      const error = new OllamaConnectionError(customHost);

      expect(error.metadata.host).toBe(customHost);
    });

    test('provides correct actionable steps', () => {
      const error = new OllamaConnectionError();
      expect(error.getActionableSteps()).toEqual([
        'ollama serve',
        'Check if Ollama is installed: ollama --version',
      ]);
    });
  });

  describe('FileProcessingError', () => {
    test('creates file processing error with file metadata', () => {
      const error = new FileProcessingError('PDF_NO_TEXT_CONTENT', 'test.pdf', {
        suggestion: 'Try image analysis',
      });

      expect(error.code).toBe('PDF_NO_TEXT_CONTENT');
      expect(error.metadata).toEqual({
        fileName: 'test.pdf',
        fileExtension: '.pdf',
        suggestion: 'Try image analysis',
      });
      expect(error.message).toBe('PDF contains no extractable text');
    });

    test('handles files without extensions', () => {
      const error = new FileProcessingError('FILE_TYPE_UNSUPPORTED', 'README');

      expect(error.metadata.fileExtension).toBe('');
      expect(error.metadata.fileName).toBe('README');
    });

    test('handles files with multiple extensions', () => {
      const error = new FileProcessingError(
        'FILE_TYPE_UNSUPPORTED',
        'archive.tar.gz',
      );

      expect(error.metadata.fileExtension).toBe('.gz');
      expect(error.metadata.fileName).toBe('archive.tar.gz');
    });

    test('handles second-level extensions correctly (e.g., .tar)', () => {
      const error = new FileProcessingError(
        'FILE_TYPE_UNSUPPORTED',
        'archive.tar',
      );
      expect(error.metadata.fileExtension).toBe('.tar');
      expect(error.metadata.fileName).toBe('archive.tar');
    });
  });

  describe('Error serialization', () => {
    test('error can be JSON.stringify-ed and parsed', () => {
      const error = new ModelMissingError('test-model');
      const serialized = JSON.stringify(error);
      const parsed = JSON.parse(serialized);

      expect(parsed.name).toBe('AnalysisError');
      expect(parsed.code).toBe('MODEL_NOT_INSTALLED');
      expect(parsed.message).toBe('AI model not found: test-model');
      expect(parsed.metadata.requiredModel).toBe('test-model');
    });

    test('error preserves stack trace', () => {
      const error = new AnalysisError('TEST_ERROR');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AnalysisError');
    });

    test('FileProcessingError serializes with file metadata', () => {
      const error = new FileProcessingError(
        'PDF_NO_TEXT_CONTENT',
        'report.pdf',
        {
          extra: 'additional-info',
        },
      );
      const serialized = JSON.stringify(error);
      const parsed = JSON.parse(serialized);

      expect(parsed.name).toBe('AnalysisError');
      expect(parsed.code).toBe('PDF_NO_TEXT_CONTENT');
      expect(parsed.metadata.fileName).toBe('report.pdf');
      expect(parsed.metadata.fileExtension).toBe('.pdf');
      expect(parsed.metadata.extra).toBe('additional-info');
    });
  });
});

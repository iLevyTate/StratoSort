/**
 * Enhanced Image Analysis Test Suite
 * Tests advanced image analysis features including multi-step processing and visual content analysis
 */

// Mock Ollama before requiring the analysis module
const mockOllamaClient = {
  generate: jest.fn()
};

jest.mock('ollama', () => ({
  Ollama: jest.fn().mockImplementation(() => mockOllamaClient)
}));

// Mock enhanced LLM service
const mockEnhancedLLM = {
  enhancedFolderMatching: jest.fn(),
  learnFromAnalysis: jest.fn()
};

jest.mock('../src/main/services/EnhancedLLMService', () => {
  return jest.fn().mockImplementation(() => mockEnhancedLLM);
});

// Since the module doesn't export individual functions, let's mock the entire module  
jest.mock('../src/main/analysis/ollamaImageAnalysis', () => ({
  analyzeImageWithOllama: jest.fn()
}));

const { analyzeImageWithOllama } = require('../src/main/analysis/ollamaImageAnalysis');

describe('Enhanced Image Analysis', () => {
  const mockImageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Multi-step Enhanced Analysis', () => {
    test('should perform multi-step analysis when smart folders are available', async () => {
      const mockVisualAnalysis = {
        category: "Screenshots",
        purpose: "Interface documentation",
        keywords: ["screenshot", "ui", "interface"],
        content_type: "interface",
        has_text: true,
        colors: ["blue", "white"],
        confidence: 88
      };

      const mockTextAnalysis = {
        text: "Login Form - Username Password",
        confidence: 85,
        textType: "interface"
      };

      const mockFolderMatch = {
        category: "UI Documentation",
        matchConfidence: 0.92,
        matchMethod: 'semantic'
      };

      // Mock the individual analysis steps
      mockOllamaClient.generate
        .mockResolvedValueOnce({ response: JSON.stringify(mockVisualAnalysis) }) // Visual analysis
        .mockResolvedValueOnce({ response: JSON.stringify(mockTextAnalysis) }); // Text analysis

      mockEnhancedLLM.enhancedFolderMatching.mockResolvedValue(mockFolderMatch);

      const smartFolders = [{ name: "UI Documentation" }, { name: "Screenshots" }];
      const userContext = { userId: "test_user" };

      const result = await analyzeImageWithOllama(
        mockImageBase64, 
        "dashboard_screenshot.png", 
        smartFolders, 
        userContext
      );

      expect(result.enhanced).toBe(true);
      expect(result.multiStep).toBe(true);
      expect(result.category).toBe("UI Documentation");
      expect(result.extractedText).toBe("Login Form - Username Password");
      expect(result.textConfidence).toBe(85);
      expect(mockEnhancedLLM.learnFromAnalysis).toHaveBeenCalled();
    });

    test('should handle multi-step analysis failure gracefully', async () => {
      mockOllamaClient.generate.mockRejectedValue(new Error('Visual analysis failed'));

      const smartFolders = [{ name: "Images" }];
      const result = await analyzeImageWithOllama(
        mockImageBase64, 
        "test.png", 
        smartFolders, 
        {}
      );

      expect(result.fallback).toBe(true);
      expect(result.category).toBe("Images");
    });
  });

  describe('Advanced Visual Analysis Prompts', () => {
    test('should use advanced prompts with visual examples and constraints', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: "Logos",
          project: "Brand Assets",
          purpose: "Corporate identity and branding materials",
          keywords: ["logo", "brand", "corporate", "design"],
          content_type: "object",
          has_text: false,
          colors: ["blue", "orange"],
          confidence: 95,
          suggestedName: "company_logo_blue_orange",
          reasoning: "Clear corporate logo with brand colors"
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const smartFolders = [
        { name: "Logos", description: "Company logos and brand assets" },
        { name: "Images", description: "General image files" }
      ];

      const result = await analyzeImageWithOllama(
        mockImageBase64, 
        "company_logo.png", 
        smartFolders
      );

      expect(mockOllamaClient.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemma3:4b',
          format: 'json',
          prompt: expect.stringContaining('📸 VISUAL ANALYSIS EXAMPLES'),
          images: [mockImageBase64],
          options: expect.objectContaining({
            temperature: 0.2,
            num_predict: 1000,
            top_k: 25
          })
        })
      );

      expect(result.category).toBe("Logos");
      expect(result.content_type).toBe("object");
      expect(result.reasoning).toContain("brand colors");
    });

    test('should include visual folder constraints in prompts', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: "Screenshots",
          confidence: 85
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const smartFolders = [
        { name: "Screenshots" },
        { name: "Design Assets" },
        { name: "Photos" }
      ];

      await analyzeImageWithOllama(mockImageBase64, "ui_capture.png", smartFolders);

      const generatedPrompt = mockOllamaClient.generate.mock.calls[0][0].prompt;
      
      expect(generatedPrompt).toContain('🎯 CRITICAL FOLDER CONSTRAINTS');
      expect(generatedPrompt).toContain('"Screenshots", "Design Assets", "Photos"');
      expect(generatedPrompt).toContain('VISUAL MATCHING EXAMPLES');
      expect(generatedPrompt).toContain('UI capture → choose "Screenshots"');
    });
  });

  describe('Visual Content Analysis', () => {
    test('should perform detailed visual content analysis', async () => {
      const mockVisualResponse = {
        response: JSON.stringify({
          category: "Interface",
          content_type: "interface",
          mainElements: ["buttons", "forms", "navigation"],
          colorScheme: ["blue", "white", "gray"],
          composition: "clean and organized",
          textPresent: true,
          quality: "high",
          confidence: 90
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockVisualResponse);

      // Test direct visual analysis call (simulating internal method)
      const fileName = "dashboard.png";
      
      await analyzeImageWithOllama(mockImageBase64, fileName, []);

      expect(mockOllamaClient.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('ANALYSIS TASKS'),
          images: [mockImageBase64],
          options: expect.objectContaining({
            temperature: 0.2,
            num_predict: 1000
          })
        })
      );
    });

    test('should handle visual analysis with different content types', async () => {
      const testCases = [
        {
          contentType: "people",
          description: "Photo with people",
          expectedKeywords: ["people", "photo", "portrait"]
        },
        {
          contentType: "landscape",
          description: "Nature landscape photo",
          expectedKeywords: ["landscape", "nature", "scenery"]
        },
        {
          contentType: "object",
          description: "Product photo",
          expectedKeywords: ["product", "object", "commercial"]
        }
      ];

      for (const testCase of testCases) {
        const mockResponse = {
          response: JSON.stringify({
            category: "Photos",
            content_type: testCase.contentType,
            keywords: testCase.expectedKeywords,
            confidence: 88
          })
        };

        mockOllamaClient.generate.mockResolvedValue(mockResponse);

        const result = await analyzeImageWithOllama(
          mockImageBase64, 
          `${testCase.contentType}_example.jpg`, 
          []
        );

        expect(result.content_type).toBe(testCase.contentType);
        expect(result.keywords).toEqual(expect.arrayContaining(testCase.expectedKeywords));
      }
    });
  });

  describe('Text Extraction (OCR-like)', () => {
    test('should extract text from images when text is detected', async () => {
      const mockTextResponse = {
        response: JSON.stringify({
          hasText: true,
          text: "Welcome to Dashboard - Analytics Overview",
          textType: "interface",
          confidence: 87,
          readability: "high"
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockTextResponse);

      // When smart folders are present, it triggers multi-step analysis
      const smartFolders = [{ name: "Screenshots" }];
      
      await analyzeImageWithOllama(mockImageBase64, "text_image.png", smartFolders);

      // Should call generate twice - once for visual analysis, once for text extraction
      expect(mockOllamaClient.generate).toHaveBeenCalledTimes(2);
      
      // Check that text extraction prompt was used
      const textExtractionCall = mockOllamaClient.generate.mock.calls[1];
      expect(textExtractionCall[0].prompt).toContain('Extract and analyze any text visible');
      expect(textExtractionCall[0].options.temperature).toBe(0.1); // Very focused for text
    });

    test('should skip text extraction when no text is detected', async () => {
      const mockVisualResponse = {
        response: JSON.stringify({
          category: "Photos",
          has_text: false,
          content_type: "landscape",
          confidence: 85
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockVisualResponse);
      mockEnhancedLLM.enhancedFolderMatching.mockResolvedValue({
        category: "Photos",
        matchConfidence: 0.8
      });

      const smartFolders = [{ name: "Photos" }];
      const result = await analyzeImageWithOllama(
        mockImageBase64, 
        "landscape.jpg", 
        smartFolders
      );

      expect(result.extractedText).toBe('');
      expect(result.textConfidence).toBe(0);
      // Should only call generate once for visual analysis
      expect(mockOllamaClient.generate).toHaveBeenCalledTimes(1);
    });
  });

  describe('Image Response Processing', () => {
    test('should validate and correct image-specific fields', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: "Design",
          content_type: null, // Invalid content_type
          has_text: "yes", // Invalid boolean
          colors: "blue, red", // Invalid array format
          confidence: 150 // Invalid confidence
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const result = await analyzeImageWithOllama(mockImageBase64, "design.png", []);

      expect(result.content_type).toBe("object"); // Default value
      expect(result.has_text).toBe(false); // Corrected to boolean
      expect(Array.isArray(result.colors)).toBe(true); // Corrected to array
      expect(result.confidence).toBeGreaterThanOrEqual(70);
      expect(result.confidence).toBeLessThanOrEqual(95);
    });

    test('should handle semantic image category matching', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: "UI Screenshots", // Non-matching category
          confidence: 85
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const smartFolders = [
        { name: "Screenshots" },
        { name: "Design Assets" }
      ];

      const result = await analyzeImageWithOllama(
        mockImageBase64, 
        "interface.png", 
        smartFolders
      );

      // Should find semantic match with "Screenshots" folder
      expect(result.category).toBe("Screenshots");
      expect(result.corrected).toBe(true);
    });
  });

  describe('Image Analysis Fallbacks', () => {
    test('should provide fallback analysis for processing failures', async () => {
      mockOllamaClient.generate.mockRejectedValue(new Error('Image analysis failed'));

      const smartFolders = [{ name: "Design Assets" }];
      const result = await analyzeImageWithOllama(
        mockImageBase64, 
        "failed_image.png", 
        smartFolders
      );

      expect(result.fallback).toBe(true);
      expect(result.enhanced).toBe(false);
      expect(result.category).toBe("Design Assets");
      expect(result.confidence).toBe(55);
      expect(result.content_type).toBe("object");
    });

    test('should extract partial information from malformed responses', async () => {
      const mockResponse = {
        response: `{
          "category": "Logos",
          "content_type": "object",
          "has_text": true
          // Malformed JSON
        `
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const smartFolders = [{ name: "Logos" }];
      const result = await analyzeImageWithOllama(
        mockImageBase64, 
        "logo.png", 
        smartFolders
      );

      expect(result.category).toBe("Logos");
      expect(result.content_type).toBe("object");
      expect(result.has_text).toBe(true);
      expect(result.partial).toBe(true);
    });
  });

  describe('Semantic Image Matching', () => {
    test('should match screenshot-related terms', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: "screen capture", // Should match Screenshots folder
          confidence: 82
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const smartFolders = [{ name: "Screenshots" }, { name: "Images" }];
      const result = await analyzeImageWithOllama(
        mockImageBase64, 
        "capture.png", 
        smartFolders
      );

      expect(result.category).toBe("Screenshots");
      expect(result.corrected).toBe(true);
    });

    test('should match logo-related terms', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: "brand mark", // Should match Logos folder
          confidence: 90
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const smartFolders = [{ name: "Logos" }, { name: "Design" }];
      const result = await analyzeImageWithOllama(
        mockImageBase64, 
        "brand.png", 
        smartFolders
      );

      expect(result.category).toBe("Logos");
      expect(result.corrected).toBe(true);
    });

    test('should use fallback folder when no semantic match found', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: "unknown visual content",
          confidence: 75
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const smartFolders = [{ name: "Primary Folder" }, { name: "Secondary" }];
      const result = await analyzeImageWithOllama(
        mockImageBase64, 
        "unknown.png", 
        smartFolders
      );

      expect(result.category).toBe("Primary Folder");
      expect(result.fallback).toBe(true);
    });
  });

  describe('Enhanced Image Metadata', () => {
    test('should include enhanced metadata in image results', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: "Photos",
          content_type: "people",
          confidence: 88,
          reasoning: "Image shows group of people in professional setting"
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      const result = await analyzeImageWithOllama(mockImageBase64, "team.jpg", []);

      expect(result.enhanced).toBe(true);
      expect(result.timestamp).toBeDefined();
      expect(result.analysisType).toBe('image');
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });

    test('should maintain backward compatibility for calls without userContext', async () => {
      const mockResponse = {
        response: JSON.stringify({
          category: "Images",
          confidence: 80
        })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      // Call without userContext (backward compatibility)
      const result = await analyzeImageWithOllama(mockImageBase64, "test.png");

      expect(result).toBeDefined();
      expect(result.category).toBe("Images");
    });
  });

  describe('Parameter Optimization for Images', () => {
    test('should use optimized parameters for image analysis', async () => {
      const mockResponse = {
        response: JSON.stringify({ category: "Test", confidence: 85 })
      };

      mockOllamaClient.generate.mockResolvedValue(mockResponse);

      await analyzeImageWithOllama(mockImageBase64, "test.png", []);

      const generatedOptions = mockOllamaClient.generate.mock.calls[0][0].options;
      
      expect(generatedOptions.temperature).toBe(0.2); // Slightly higher for visual creativity
      expect(generatedOptions.num_predict).toBe(1000);
      expect(generatedOptions.top_k).toBe(25);
      expect(generatedOptions.top_p).toBe(0.8);
    });
  });
}); 
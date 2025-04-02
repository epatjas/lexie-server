// Import required dependencies
const express = require('express')                // Web framework for Node.js
const cors = require('cors')                      // Enable Cross-Origin Resource Sharing
const OpenAI = require('openai')                  // OpenAI API client
const rateLimit = require('express-rate-limit')   // Rate limiting middleware
require('dotenv').config()                        // Load environment variables from .env file
const fs = require('fs');                         // File system module (currently unused - can be removed)
const transcriptionPrompt = require('./prompts/transcriptionPrompt');    // Load prompts from separate files
const studyMaterialsPrompt = require('./prompts/studyMaterialsPrompt');
const homeworkClassificationPrompt = require('./prompts/classificationPrompt');
const homeworkHelpPrompt = require('./prompts/homeworkHelpPrompt');
const lexieTutorPrompt = require('./prompts/lexieTutorPrompt');
const { Readable } = require('stream');
const { LRUCache } = require('lru-cache');
const crypto = require('crypto');

// Initialize Express app and middleware
const app = express()

// Add logging middleware at the top
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.use(cors())  // Enable CORS for all routes

// Configure Express to handle large payloads (needed for base64 images)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Configure rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
})
app.use(limiter)

// Server configuration
const PORT = process.env.PORT || 3000;    // Use PORT from env or default to 3000
const HOST = '0.0.0.0';                   // Listen on all network interfaces
const REQUEST_TIMEOUT = 120000           // 2 minute timeout for requests

// Initialize OpenAI with API key from environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Configure audio cache
const audioCache = new LRUCache({
  max: 100,
  maxSize: 500 * 1024 * 1024,
  sizeCalculation: (value, key) => {
    return value.length;
  },
  ttl: 1000 * 60 * 60 * 24 * 7, // 7 days
});

// Use a faster in-memory cache for recent requests
const recentAudioCache = new Map();
const RECENT_CACHE_SIZE = 10;

// Helper function to generate cache key
const generateCacheKey = (text, voice, speed) => {
  return crypto
    .createHash('md5')
    .update(`${text}-${voice}-${speed}`)
    .digest('hex');
};

// Request validation middleware
const validateAnalyzeRequest = (req, res, next) => {
  const { images } = req.body
  
  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ 
      error: 'Invalid request',
      details: 'Request must include an array of base64 encoded images'
    })
  }

  // Log image sizes
  images.forEach((img, index) => {
    const sizeInBytes = Buffer.byteLength(img, 'base64');
    const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);
    console.log(`[${new Date().toISOString()}] Image ${index + 1} size: ${sizeInMB}MB`)
  })

  // Validate each image is a base64 string
  const invalidImages = images.filter(img => typeof img !== 'string' || !img.length)
  if (invalidImages.length > 0) {
    return res.status(400).json({
      error: 'Invalid image format',
      details: 'All images must be base64 encoded strings'
    })
  }

  next()
}

// Basic test endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Lexie server is running!' })
})

// Add rate limiting configuration
const rateLimiter = {
  tokensPerMin: 30000,
  current: 0,
  lastReset: Date.now(),
  queue: [],
};

// Add this before your OpenAI calls
const checkRateLimit = async (requestedTokens) => {
  const now = Date.now();
  if (now - rateLimiter.lastReset > 60000) {
    // Reset counter every minute
    rateLimiter.current = 0;
    rateLimiter.lastReset = now;
  }

  if (rateLimiter.current + requestedTokens > rateLimiter.tokensPerMin) {
    // Wait until next minute if limit exceeded
    const waitTime = 60000 - (now - rateLimiter.lastReset);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    rateLimiter.current = 0;
    rateLimiter.lastReset = Date.now();
  }

  rateLimiter.current += requestedTokens;
};

// Add retry logic to your API calls
const makeOpenAIRequest = async (retries = 3) => {
  try {
    await checkRateLimit(5000); // Estimate tokens
    const response = await openai.chat.completions.create({
      // ... your existing options
    });
    return response;
  } catch (error) {
    if (error.code === 'rate_limit_exceeded' && retries > 0) {
      const waitTime = parseInt(error.headers['retry-after-ms'] || 10000);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return makeOpenAIRequest(retries - 1);
    }
    throw error;
  }
};

const makeRequestWithRetry = async (fn, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.code === 'rate_limit_exceeded' && i < maxRetries - 1) {
        const waitTime = Math.min(1000 * Math.pow(2, i), 10000);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      throw error;
    }
  }
};

// Main endpoint for analyzing images and generating study materials
app.post('/analyze', validateAnalyzeRequest, async (req, res) => {
  const startTime = Date.now();
  const processingId = crypto.randomUUID();
  
  try {
    const { images } = req.body
    console.log(`[${new Date().toISOString()}] Starting analysis of ${images.length} images`)
    
    // STEP 1: TRANSCRIPTION
    const transcriptionPromises = images.map((image, index) => {
      console.log(`[${new Date().toISOString()}] Processing image ${index + 1}/${images.length}`)
      return makeRequestWithRetry(() => 
        openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{
            role: "system",
            content: "You are a transcription assistant that MUST return ONLY valid JSON. Never include any text before or after the JSON object. Ensure all special characters are properly escaped."
          }, {
            role: "user",
            content: [{
              type: "text",
              text: transcriptionPrompt
            }, {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${image}`,
                detail: "high"
              }
            }]
          }],
          max_tokens: 4096,
        })
      );
    })

    // Wait for all transcriptions
    console.log(`[${new Date().toISOString()}] Waiting for all transcriptions...`)
    const transcriptionResponses = await Promise.all(transcriptionPromises)
    
    // Clean and parse the transcription responses
    const transcriptions = transcriptionResponses.map(resp => {
      try {
        const content = resp.choices[0].message.content;
        
        // Improved JSON extraction using regex pattern
        const jsonPattern = /{[\s\S]*}/g; // Match everything between { and } including newlines
        const jsonMatches = content.match(jsonPattern);
        
        if (!jsonMatches || jsonMatches.length === 0) {
          console.error('[Server] No valid JSON found in response:', content.substring(0, 200) + '...');
          throw new Error('No valid JSON found in response');
        }
        
        // Take the largest JSON match (most likely the complete one)
        const largestMatch = jsonMatches.reduce((a, b) => a.length > b.length ? a : b);
        
        try {
          return JSON.parse(largestMatch);
        } catch (innerParseError) {
          console.error('[Server] Inner JSON parse error:', innerParseError);
          
          // Try more aggressive cleaning
          const cleanedJson = largestMatch
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
            .replace(/\\[^"\\\/bfnrtu]/g, '\\\\$&'); // Fix improperly escaped backslashes
          
          try {
            return JSON.parse(cleanedJson);
          } catch (lastAttemptError) {
            console.error('[Server] Failed final JSON parse attempt for content:', largestMatch.substring(0, 200) + '...');
            throw new Error('Failed to parse transcription after multiple attempts');
          }
        }
      } catch (error) {
        console.error('[Server] Transcription processing error:', error);
        
        // Return a minimal valid object to prevent the entire process from failing
        return {
          title: "Untitled Content",
          text_content: {
            raw_text: "There was an error processing this portion of the content.",
            sections: [
              {
                type: "paragraph",
                raw_text: "There was an error processing this portion of the content."
              }
            ]
          }
        };
      }
    });

    // Also add this backup mechanism right after the above code
    if (transcriptions.length === 0) {
      console.error('[Server] No valid transcriptions were produced');
      throw new Error('No valid transcriptions were produced');
    }

    // Combine transcriptions
    const combinedTranscription = {
      title: transcriptions[0].title,
      text_content: {
        raw_text: transcriptions.map(t => t.text_content.raw_text).join('\n\n'),
        sections: transcriptions.flatMap(t => t.text_content.sections)
      }
    };

    // STEP 2: CLASSIFICATION
    console.log(`[${new Date().toISOString()}] Classifying content...`);
    const classificationResponse = await makeRequestWithRetry(() => 
      openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "system",
          content: "You are an AI that analyzes educational content. You MUST respond ONLY with a valid JSON object."
        }, {
          role: "user",
          content: `${homeworkClassificationPrompt}\n\nContent to classify:\n${combinedTranscription.text_content.raw_text}`,
        }],
        max_tokens: 1024,
      })
    );
    
    // Parse classification result
    const classificationResult = classificationResponse.choices[0].message.content.trim();
    let classification = {
      classification: "TEXTBOOK_MATERIAL", // Default
      confidence: "MEDIUM",
      subject_area: "Other",
      language: "English",
      processing_approach: "Textbook Content Processing"
    };

    try {
      // Clean up any markdown formatting before parsing
      const cleanedResult = classificationResult
        .replace(/^```json\s*/i, '')  // Remove opening ```json with case insensitivity
        .replace(/^```\s*/i, '')      // Remove opening ``` without json prefix
        .replace(/\s*```$/i, '')      // Remove closing ```
        .trim();
        
        console.log(`[${new Date().toISOString()}] Cleaned classification result for parsing`);
        
        // Add validation check for JSON structure
        if (cleanedResult.startsWith('{') && cleanedResult.endsWith('}')) {
          const parsedClassification = JSON.parse(cleanedResult);
          classification = {
            ...classification, // Maintain defaults
            ...parsedClassification // Override with parsed values
          };
          console.log(`[${new Date().toISOString()}] Content classified as: ${classification.classification} (${classification.subject_area})`);
        } else {
          console.log(`[${new Date().toISOString()}] Classification result is not valid JSON, using defaults`);
          // Use default values, already set above
        }
    } catch (parseError) {
      console.error('[Server] Classification parse error:', parseError);
      console.error('[Server] Content that failed to parse:', classificationResult);
      // Use default values set above
      console.log(`[${new Date().toISOString()}] Using default classification due to parse error`);
    }

    // Keep ONLY this simple Finnish language detection
    const hasFinnishCharacters = /[äöåÄÖÅ]/.test(combinedTranscription.text_content.raw_text);
    if (hasFinnishCharacters && classification.language !== "Finnish") {
      console.log(`[${new Date().toISOString()}] Finnish characters detected, updating language`);
      classification.language = "Finnish";
    }

    let result;
    let primaryResult;

    // STEP 3: BRANCH BASED ON CLASSIFICATION
    if (classification.classification === "PROBLEM_ASSIGNMENT") {
      console.log(`[${new Date().toISOString()}] Using enhanced problem assistance approach`);
      
      // 1. Analyze content length and complexity
      const contentLength = combinedTranscription.text_content.raw_text.length;
      const contentComplexity = contentLength > 5000 ? 'high' : contentLength > 2000 ? 'medium' : 'low';
      console.log(`[${new Date().toISOString()}] Problem content analysis: length=${contentLength}, complexity=${contentComplexity}`);

      // 2. Create intelligent content chunks
      const contentChunks = getIntelligentChunks(combinedTranscription.text_content.raw_text);
      console.log(`[${new Date().toISOString()}] Created ${contentChunks.length} intelligent content chunks`);

      // 3. FIRST CALL: Get problem analysis and summary
      const problemAnalysisStream = await makeRequestWithRetry(() => 
        openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{
            role: "system",
            content: `You are an AI that helps with homework problems. Generate ONLY the basic problem analysis.
            Your response must be valid JSON with ONLY these fields:
            {
              "title": "Brief title describing the problem",
              "problem_summary": "Detailed explanation of the problem",
              "problem_type": "MATH|PHYSICS|CHEMISTRY|BIOLOGY|HISTORY|OTHER",
              "approach_guidance": "General guidance on how to approach this problem",
              "language": "en|fi"
            }
            
            IMPORTANT: Since this problem is ${contentComplexity} complexity (${contentLength} characters):
            1. Create a ${contentComplexity === 'high' ? 'very detailed' : contentComplexity === 'medium' ? 'moderately detailed' : 'concise'} problem summary
            2. The language field should reflect the language of the problem (${classification.language})
            3. Use proper markdown formatting where appropriate`
          }, {
            role: "user",
            content: `${homeworkHelpPrompt}

IMPORTANT OVERRIDE: Generate ONLY the problem analysis fields listed above.
Do not generate concept cards in this response.

Problem Type: ${classification.subject_area}
Homework Content:
${contentChunks.join("\n\n===SECTION BREAK===\n\n")}`,
          }],
          max_tokens: 2048,
          stream: true
        })
      );

      // Process the first response
      let problemAnalysisResponse = '';
      for await (const chunk of problemAnalysisStream) {
        problemAnalysisResponse += chunk.choices[0]?.delta?.content || '';
      }
      console.log('[Server] First call completed - Problem analysis');

      // Parse problem analysis
      const problemAnalysis = await parseJsonSafely(problemAnalysisResponse, {
        title: combinedTranscription.title || `${classification.subject_area} Problem`,
        problem_summary: combinedTranscription.text_content.raw_text,
        problem_type: classification.subject_area || 'OTHER',
        approach_guidance: '',
        language: classification.language || 'en'
      });

      // 4. SECOND CALL: Get concept cards
      const cardCount = getAppropriateCardCount(contentComplexity, classification);
      console.log(`[${new Date().toISOString()}] Generating ${cardCount} concept cards based on problem complexity`);

      const conceptCardsStream = await makeRequestWithRetry(() => 
        openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{
            role: "system",
            content: `You are an AI that creates educational concept cards for homework problems. Generate ONLY the concept_cards array.
            Your response must be valid JSON with ONLY this field:
            {
              "concept_cards": [
                {
                  "card_number": 1,
                  "title": "Concept title",
                  "explanation": "Detailed explanation of the concept",
                  "hint": "Hint to apply this concept to the problem"
                }
              ]
            }
            
            QUALITY REQUIREMENTS:
            1. Create EXACTLY ${cardCount} high-quality concept cards
            2. Each card should focus on a distinct concept needed to understand the problem type
            3. Cards should be sequenced in logical order (fundamentals first, then more complex concepts)
            4. ALL content MUST be in the SAME LANGUAGE as the source material (${problemAnalysis.language})`
          }, {
            role: "user",
            content: `${homeworkHelpPrompt}

IMPORTANT OVERRIDE: Generate ONLY concept cards following the guidelines in the homeworkHelpPrompt.
Focus exclusively on creating ${cardCount} high-quality concept cards.

Problem Title: ${problemAnalysis.title}
Problem Summary: ${problemAnalysis.problem_summary}
Approach Guidance: ${problemAnalysis.approach_guidance}

Problem Content:
${contentChunks.join("\n\n===SECTION BREAK===\n\n").substring(0, 6000)}`,
          }],
          max_tokens: 4096,
          stream: true
        })
      );

      // Process the second response
      let conceptCardsResponse = '';
      for await (const chunk of conceptCardsStream) {
        conceptCardsResponse += chunk.choices[0]?.delta?.content || '';
      }
      console.log('[Server] Second call completed - Concept cards generation');

      // Parse concept cards
      const conceptCardsData = await parseJsonSafely(conceptCardsResponse, {
        concept_cards: []
      });

      // 5. Combine all results
      const homeworkHelp = {
        title: problemAnalysis.title,
        problem_summary: problemAnalysis.problem_summary,
        problem_type: problemAnalysis.problem_type,
        approach_guidance: problemAnalysis.approach_guidance,
        language: problemAnalysis.language,
        concept_cards: conceptCardsData.concept_cards || []
      };

      // After parsing homeworkHelp
      console.log(`[${new Date().toISOString()}] Generated concept cards:`, 
        homeworkHelp.concept_cards ? 
        `${homeworkHelp.concept_cards.length} cards` : 
        'No cards generated');

      // Keep validation for problem summary
      if (!homeworkHelp.problem_summary || homeworkHelp.problem_summary.length < combinedTranscription.text_content.raw_text.length * 0.5) {
        console.log(`[${new Date().toISOString()}] Problem summary seems incomplete, adding full transcription`);
        homeworkHelp.problem_summary = combinedTranscription.text_content.raw_text;
      }

      // Return homework help result
      primaryResult = {
        title: homeworkHelp.title || combinedTranscription.title.replace(" - DRAFT ONLY", ""),
        text_content: combinedTranscription.text_content,
        contentType: 'homework-help',
        introduction: `I analyzed your ${classification.subject_area} problem. Here's some help to guide you through the solution.`,
        homeworkHelp: {
          type: classification.subject_area,
          classification: classification.classification,
          subject_area: classification.subject_area,
          language: classification.language,
          ...homeworkHelp
        },
        processingId,
        created_at: Date.now(),
        updated_at: Date.now()
      };
      
      // Store the processing status
      updateProcessingStatus(processingId, 'completed', primaryResult);

      // Send the response
      console.log(`[${new Date().toISOString()}] Sending homework help response to client`);
      res.json(primaryResult);
    } else {
      console.log(`[${new Date().toISOString()}] Using enhanced study materials approach with content-aware multi-call generation`);

      // 1. Analyze content length and complexity
      const contentLength = combinedTranscription.text_content.raw_text.length;
      const contentComplexity = contentLength > 5000 ? 'high' : contentLength > 2000 ? 'medium' : 'low';
      console.log(`[${new Date().toISOString()}] Content analysis: length=${contentLength}, complexity=${contentComplexity}`);

      // 2. Create intelligent content chunks
      const contentChunks = getIntelligentChunks(combinedTranscription.text_content.raw_text);
      console.log(`[${new Date().toISOString()}] Created ${contentChunks.length} intelligent content chunks`);

      // 3. FIRST CALL: Get title, introduction, and detailed summary
      const basicInfoStream = await makeRequestWithRetry(() => 
        openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{
            role: "system",
            content: `You are an AI that creates educational study materials. Generate ONLY the basic information fields.
            Your response must be valid JSON with ONLY these fields:
            {
              "title": "Title derived from content",
              "introduction": "Brief introduction in the SAME LANGUAGE as content",
              "summary": "DETAILED summary with markdown formatting",
              "subject_area": "LANGUAGE_LEARNING|MATHEMATICS|SCIENCE|READING_LITERATURE|ARTS_HUMANITIES"
            }
            
            IMPORTANT: Since this content is ${contentComplexity} complexity (${contentLength} characters):
            1. Create a ${contentComplexity === 'high' ? 'very detailed' : contentComplexity === 'medium' ? 'moderately detailed' : 'concise'} summary
            2. Include ALL key concepts and terms that should be used for flashcards
            3. The summary MUST be in the SAME LANGUAGE as the source material (${classification.language})
            4. Use proper markdown formatting with headings, bullet points, and emphasis`
          }, {
            role: "user",
            content: `${studyMaterialsPrompt}

IMPORTANT OVERRIDE: Generate ONLY title, introduction, and summary fields following the guidelines above.
Do not generate flashcards or quiz questions in this response.

Transcription to use:
${contentChunks.join("\n\n===SECTION BREAK===\n\n")}`,
          }],
          max_tokens: 2048,
          stream: true
        })
      );

      // Process the first response
      let basicInfoResponse = '';
      for await (const chunk of basicInfoStream) {
        basicInfoResponse += chunk.choices[0]?.delta?.content || '';
      }
      console.log('[Server] First call completed - Basic info generation');

      // Parse basic info
      const basicInfo = await parseJsonSafely(basicInfoResponse, {
        title: combinedTranscription.title || 'Untitled Study Set',
        introduction: 'Let\'s study this material together.',
        summary: '',
        subject_area: classification.subject_area || 'GENERAL'
      });

      // 4. SECOND CALL: Get appropriate number of high-quality flashcards
      const flashcardCount = getAppropriateFlashcardCount(contentComplexity, classification);
      console.log(`[${new Date().toISOString()}] Generating ${flashcardCount} flashcards based on content complexity`);

      const flashcardsStream = await makeRequestWithRetry(() => 
        openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{
            role: "system",
            content: `You are an AI that creates educational flashcards. Generate ONLY the flashcards array.
            Your response must be valid JSON with ONLY this field:
            {
              "flashcards": [
                {"front": "term/concept", "back": "definition/explanation"}
              ]
            }
            
            QUALITY REQUIREMENTS:
            1. Create EXACTLY ${flashcardCount} high-quality flashcards
            2. Each flashcard must cover a distinct important concept
            3. Front side should be concise (typically 1-5 words)
            4. Back side should be comprehensive yet concise (30-100 words)
            5. For vocabulary content: use direct translations
            6. For subject content: use explanations that demonstrate understanding
            7. ALL content MUST be in the SAME LANGUAGE as the source material (${classification.language})`
          }, {
            role: "user",
            content: `${studyMaterialsPrompt}

IMPORTANT OVERRIDE: Generate ONLY flashcards following the guidelines above.
Focus exclusively on creating ${flashcardCount} high-quality flashcards that cover the most important concepts.

Title: ${basicInfo.title}
Summary: ${basicInfo.summary}

Content chunks:
${contentChunks.join("\n\n===SECTION BREAK===\n\n").substring(0, 6000)}`,
          }],
          max_tokens: 4096,
          stream: true
        })
      );

      // Process the second response
      let flashcardsResponse = '';
      for await (const chunk of flashcardsStream) {
        flashcardsResponse += chunk.choices[0]?.delta?.content || '';
      }
      console.log('[Server] Second call completed - Flashcards generation');

      // Parse flashcards
      const flashcardsData = await parseJsonSafely(flashcardsResponse, {
        flashcards: []
      });

      // 5. THIRD CALL: Get quiz questions
      const quizCount = getAppropriateQuizCount(contentComplexity, classification);
      console.log(`[${new Date().toISOString()}] Generating ${quizCount} quiz questions based on content complexity`);

      const quizStream = await makeRequestWithRetry(() => 
        openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{
            role: "system",
            content: `You are an AI that creates educational quiz questions. Generate ONLY the quiz array.
            Your response must be valid JSON with ONLY this field:
            {
              "quiz": [
                {"question": "question text", "options": ["option1", "option2", "option3", "option4"], "correct": "correct option", "explanation": "brief explanation"}
              ]
            }
            
            QUALITY REQUIREMENTS:
            1. Create EXACTLY ${quizCount} high-quality multiple-choice questions
            2. Each question must test understanding of a distinct important concept
            3. Include a mix of difficulty levels (40% easy, 40% medium, 20% challenging)
            4. Every question MUST have EXACTLY 4 options
            5. All wrong answers must be plausible distractors
            6. Include a brief explanation for why the correct answer is right
            7. ALL content MUST be in the SAME LANGUAGE as the source material (${classification.language})`
          }, {
            role: "user",
            content: `${studyMaterialsPrompt}

IMPORTANT OVERRIDE: Generate ONLY quiz questions following the guidelines above.
Focus exclusively on creating ${quizCount} high-quality quiz questions that test understanding of key concepts.

Title: ${basicInfo.title}
Summary: ${basicInfo.summary}
        
Content chunks:
${contentChunks.join("\n\n===SECTION BREAK===\n\n").substring(0, 6000)}`,
          }],
          max_tokens: 4096,
          stream: true
        })
      );

      // Process the third response
      let quizResponse = '';
      for await (const chunk of quizStream) {
        quizResponse += chunk.choices[0]?.delta?.content || '';
      }
      console.log('[Server] Third call completed - Quiz generation');

      // Parse quiz questions
      const quizData = await parseJsonSafely(quizResponse, {
        quiz: []
      });

      // 6. Combine all results
      const studyMaterials = {
        title: basicInfo.title,
        text_content: combinedTranscription.text_content,
        introduction: basicInfo.introduction,
        summary: basicInfo.summary,
        flashcards: flashcardsData.flashcards || [],
        quiz: quizData.quiz || [],
        vocabulary_tables: [],
        subject_area: basicInfo.subject_area
      };

      // Normalize quiz data structure
      let normalizedQuiz = [];
      if (studyMaterials.quiz) {
        if (Array.isArray(studyMaterials.quiz)) {
          normalizedQuiz = studyMaterials.quiz;
        } else if (studyMaterials.quiz.questions && Array.isArray(studyMaterials.quiz.questions)) {
          normalizedQuiz = studyMaterials.quiz.questions;
        }
      }

      // Create a result that includes both the classification and study materials
      const result = {
        title: combinedTranscription.title,
        text_content: combinedTranscription.text_content,
        contentType: 'study-set',
        introduction: studyMaterials.introduction || 'I analyzed your content. Here\'s some material to help you master this subject.',
        summary: studyMaterials.summary || '',
        subject_area: studyMaterials.subject_area || classification.subject_area || 'GENERAL',
        flashcards: studyMaterials.flashcards || [],
        quiz: normalizedQuiz,
        vocabulary_tables: studyMaterials.vocabulary_tables || [],
        created_at: Date.now(),
        updated_at: Date.now(),
        processingId
      };

      // After parsing homeworkHelp
      console.log(`[${new Date().toISOString()}] Generated concept cards:`, 
        result.homeworkHelp ? 
        `${result.homeworkHelp.concept_cards.length} cards` : 
        'No cards generated');

      // Before sending the response, store the full result
      updateProcessingStatus(processingId, 'completed', result);

      // Then send the response
      res.json(result);
    }

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error:`, error);
    
    let statusCode = 500;
    let errorMessage = 'Error processing content';
    
    if (error.message.includes('Invalid request')) {
      statusCode = 400;
      errorMessage = 'Invalid request';
    } else if (error.message.includes('too large')) {
      statusCode = 413;
      errorMessage = 'Images are too large';
    } else if (error.message.includes('rate limit')) {
      statusCode = 429;
      errorMessage = 'Too many attempts';
    } else if (error.message.includes('OpenAI')) {
      statusCode = 503;
      errorMessage = 'AI service is temporarily unavailable';
    }

    res.status(statusCode).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Health check endpoint
app.get('/ping', (req, res) => {
  res.json({ message: 'Server is running' })
})

app.get('/processing-status/:id', (req, res) => {
  const { id } = req.params;
  // Get status from processing map
  const status = processingStatus.get(id) || { stage: 'unknown' };
  res.json(status);
});

// Modify the processing status update to store the complete result
const updateProcessingStatus = (id, stage, result = null) => {
  const existing = processingStatus.get(id) || {};
  processingStatus.set(id, { 
    ...existing,
    stage, 
    timestamp: Date.now(),
    result: result || existing.result
  });
};

// TTS endpoint
app.post('/tts', async (req, res) => {
  let { text, language = 'en', type = 'chunk' } = req.body;
  
  // Always use full mode for short texts like flashcards
  if (text.length < 100) {
    type = 'full';
  }
  
  // If the language is Finnish, always use full mode regardless of length
  if (language === 'fi' || text.match(/[äöåÄÖÅ]/)) {
    type = 'full';
    
    // For Finnish, add spaces around punctuation to help TTS engine
    text = text.replace(/([.,!?:;])(\w)/g, '$1 $2')
               .replace(/(\w)([.,!?:;])/g, '$1 $2');
    
    console.log(`[TTS] Finnish text normalized: "${text}"`);
  }
  
  // Always use Nova voice as preferred by user, regardless of language
  const voice = "nova";
  
  // Keep language detection for other purposes
  const isFinish = language === 'fi' || 
      text.match(/[äöåÄÖÅ]/) || 
      text.includes('Suomen') || 
      text.includes('suomi');
  
  if (isFinish) {
    console.log('[TTS] Detected Finnish content, still using nova voice as preferred');
    // No specific text processing for Finnish!
  }
  
  const speed = 1.0;
  
  if (!text) {
    return res.status(400).json({
      error: 'Invalid request',
      details: 'Text is required'
    });
  }

  try {
    const truncatedText = text.slice(0, 4096);
    const cacheKey = generateCacheKey(truncatedText, voice, speed);

    // For initial chunk requests, only process first paragraph
    if (type === 'chunk') {
      // Split by paragraphs and get first meaningful chunk
      const paragraphs = truncatedText.split(/\n\n+/);
      const firstChunk = paragraphs[0];
      
      // Generate cache key for this specific chunk
      const chunkCacheKey = generateCacheKey(firstChunk, voice, speed);

      // Check caches for chunk
      if (recentAudioCache.has(chunkCacheKey)) {
        console.log('[TTS] Recent cache hit for chunk!');
        const audioBuffer = recentAudioCache.get(chunkCacheKey);
        res.set({
          'Content-Type': 'audio/mpeg',
          'Content-Length': audioBuffer.length,
          'X-Total-Chunks': paragraphs.length.toString()
        });
        res.send(audioBuffer);
        return;
      }

      // Make OpenAI request for first chunk
      const response = await openai.audio.speech.create({
        model: "tts-1",
        voice,
        input: firstChunk,
        response_format: "mp3",
        speed
      });

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      
      // Cache the chunk
      recentAudioCache.set(chunkCacheKey, audioBuffer);

      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length,
        'X-Total-Chunks': paragraphs.length.toString(),
        'Cache-Control': 'public, max-age=604800',
      });
      
      res.send(audioBuffer);
      return;
    }

    // Check recent cache first (fastest)
    if (recentAudioCache.has(cacheKey)) {
      console.log('[TTS] Recent cache hit!');
      const audioBuffer = recentAudioCache.get(cacheKey);
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length,
      });
      res.send(audioBuffer);
      return;
    }

    // Check disk cache next
    const cachedAudio = audioCache.get(cacheKey);
    if (cachedAudio) {
      // Also add to recent cache
      recentAudioCache.set(cacheKey, cachedAudio);
      if (recentAudioCache.size > RECENT_CACHE_SIZE) {
        const firstKey = recentAudioCache.keys().next().value;
        recentAudioCache.delete(firstKey);
      }
      
      console.log('[TTS] Disk cache hit!');
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': cachedAudio.length,
        'Cache-Control': 'public, max-age=604800',
      });
      res.send(cachedAudio);
      return;
    }

    console.log('[TTS] Cache miss. Making OpenAI API request...');
    
    // Make OpenAI request with optimized settings
    const response = await openai.audio.speech.create({
      model: "tts-1", 
      voice,
      input: truncatedText,
      response_format: "mp3",
      speed
    });

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    audioCache.set(cacheKey, audioBuffer);

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Cache-Control': 'public, max-age=604800',
    });
    
    res.send(audioBuffer);

  } catch (error) {
    console.error('[TTS] Error:', error);
    res.status(500).json({
      error: 'Text-to-speech failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Simple language detection helper function
function detectLanguage(text) {
  // Check for common Finnish patterns
  if (text.match(/[äöåÄÖÅ]/) || 
      text.includes('Suomen') || 
      text.includes('suomi') ||
      text.includes('kiitos') ||
      text.includes('Mikä')) {
    return 'fi';
  }
  return 'en'; // Default to English
}

// CORS preflight
app.options('/tts', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  }).status(200).send();
});

// Add a new processing map to track status
const processingStatus = new Map();

// Add a new endpoint for homework help
app.post('/homework-help', validateAnalyzeRequest, async (req, res) => {
  const startTime = Date.now();
  const processingId = crypto.randomUUID();
  
  // Initialize processing status
  updateProcessingStatus(processingId, 'started');
  
  try {
    const { images } = req.body
    console.log(`[${new Date().toISOString()}] Starting homework help analysis of ${images.length} images`)
    
    // Process images in parallel for OCR (reusing existing code)
    updateProcessingStatus(processingId, 'transcribing');
    const transcriptionPromises = images.map((image, index) => {
      console.log(`[${new Date().toISOString()}] Processing image ${index + 1}/${images.length}`)
      return makeRequestWithRetry(() => 
        openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{
            role: "system",
            content: "You are a transcription assistant that MUST return ONLY valid JSON. Never include any text before or after the JSON object. Ensure all special characters are properly escaped."
          }, {
            role: "user",
            content: [{
              type: "text",
              text: transcriptionPrompt
            }, {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${image}`,
                detail: "high"
              }
            }]
          }],
          max_tokens: 4096,
        })
      );
    })

    // Wait for all transcriptions
    console.log(`[${new Date().toISOString()}] Waiting for all transcriptions...`)
    const transcriptionResponses = await Promise.all(transcriptionPromises)
    
    // Clean and parse the transcription responses (reusing existing code)
    const transcriptions = transcriptionResponses.map(resp => {
      try {
        const content = resp.choices[0].message.content;
        // Clean up any markdown or extra characters
        const cleanContent = content
          .replace(/^```json\s*/, '')  // Remove opening ```json
          .replace(/\s*```$/, '')      // Remove closing ```
          .trim();

        try {
          return JSON.parse(cleanContent);
        } catch (parseError) {
          console.error('[Server] JSON parse error:', parseError);
          console.error('[Server] Content that failed to parse:', cleanContent);
          throw new Error('Failed to parse transcription response');
        }
      } catch (error) {
        console.error('[Server] Transcription processing error:', error);
        throw error;
      }
    });

    // Combine transcriptions
    const combinedTranscription = {
      title: transcriptions[0].title,
      text_content: {
        raw_text: transcriptions.map(t => t.text_content.raw_text).join('\n\n'),
        sections: transcriptions.flatMap(t => t.text_content.sections)
      }
    };

    // NEW STEP: Classify the homework type
    updateProcessingStatus(processingId, 'classifying');
    console.log(`[${new Date().toISOString()}] Classifying content...`);
    const classificationResponse = await makeRequestWithRetry(() => 
      openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "system",
          content: "You are an AI that analyzes educational content. You MUST respond ONLY with a valid JSON object."
        }, {
          role: "user",
          content: `${homeworkClassificationPrompt}\n\nContent to classify:\n${combinedTranscription.text_content.raw_text}`,
        }],
        max_tokens: 1024,
      })
    );
    
    // Parse classification result
    const classificationResult = classificationResponse.choices[0].message.content.trim();
    let classification = {
      classification: "PROBLEM_ASSIGNMENT", // Default
      confidence: "MEDIUM",
      subject_area: "Other",
      language: "English",
      processing_approach: "Problem Assistance"
    };

    try {
      // Clean up any markdown formatting before parsing
      const cleanedResult = classificationResult
        .replace(/^```json\s*/i, '')  // Remove opening ```json with case insensitivity
        .replace(/^```\s*/i, '')      // Remove opening ``` without json prefix
        .replace(/\s*```$/i, '')      // Remove closing ```
        .trim();
        
        console.log(`[${new Date().toISOString()}] Cleaned classification result for parsing`);
        
        // Add validation check for JSON structure
        if (cleanedResult.startsWith('{') && cleanedResult.endsWith('}')) {
          const parsedClassification = JSON.parse(cleanedResult);
          classification = {
            ...classification, // Maintain defaults
            ...parsedClassification // Override with parsed values
          };
          console.log(`[${new Date().toISOString()}] Content classified as: ${classification.classification} (${classification.subject_area})`);
        } else {
          console.log(`[${new Date().toISOString()}] Classification result is not valid JSON, using defaults`);
          // Use default values, already set above
        }
    } catch (parseError) {
      console.error('[Server] Classification parse error:', parseError);
      console.error('[Server] Content that failed to parse:', classificationResult);
      // Use default values set above
      console.log(`[${new Date().toISOString()}] Using default classification due to parse error`);
    }

    // Keep ONLY this simple Finnish language detection
    const hasFinnishCharacters = /[äöåÄÖÅ]/.test(combinedTranscription.text_content.raw_text);
    if (hasFinnishCharacters && classification.language !== "Finnish") {
      console.log(`[${new Date().toISOString()}] Finnish characters detected, updating language`);
      classification.language = "Finnish";
    }

    let result;
    let primaryResult;

    // STEP 3: BRANCH BASED ON CLASSIFICATION
    if (classification.classification === "PROBLEM_ASSIGNMENT") {
      console.log(`[${new Date().toISOString()}] Using enhanced problem assistance approach`);
      
      // 1. Analyze content length and complexity
      const contentLength = combinedTranscription.text_content.raw_text.length;
      const contentComplexity = contentLength > 5000 ? 'high' : contentLength > 2000 ? 'medium' : 'low';
      console.log(`[${new Date().toISOString()}] Problem content analysis: length=${contentLength}, complexity=${contentComplexity}`);

      // 2. Create intelligent content chunks
      const contentChunks = getIntelligentChunks(combinedTranscription.text_content.raw_text);
      console.log(`[${new Date().toISOString()}] Created ${contentChunks.length} intelligent content chunks`);

      // 3. FIRST CALL: Get problem analysis and summary
      const problemAnalysisStream = await makeRequestWithRetry(() => 
        openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{
            role: "system",
            content: `You are an AI that helps with homework problems. Generate ONLY the basic problem analysis.
            Your response must be valid JSON with ONLY these fields:
            {
              "title": "Brief title describing the problem",
              "problem_summary": "Detailed explanation of the problem",
              "problem_type": "MATH|PHYSICS|CHEMISTRY|BIOLOGY|HISTORY|OTHER",
              "approach_guidance": "General guidance on how to approach this problem",
              "language": "en|fi"
            }
            
            IMPORTANT: Since this problem is ${contentComplexity} complexity (${contentLength} characters):
            1. Create a ${contentComplexity === 'high' ? 'very detailed' : contentComplexity === 'medium' ? 'moderately detailed' : 'concise'} problem summary
            2. The language field should reflect the language of the problem (${classification.language})
            3. Use proper markdown formatting where appropriate`
          }, {
            role: "user",
            content: `${homeworkHelpPrompt}

IMPORTANT OVERRIDE: Generate ONLY the problem analysis fields listed above.
Do not generate concept cards in this response.

Problem Type: ${classification.subject_area}
Homework Content:
${contentChunks.join("\n\n===SECTION BREAK===\n\n")}`,
          }],
          max_tokens: 2048,
          stream: true
        })
      );

      // Process the first response
      let problemAnalysisResponse = '';
      for await (const chunk of problemAnalysisStream) {
        problemAnalysisResponse += chunk.choices[0]?.delta?.content || '';
      }
      console.log('[Server] First call completed - Problem analysis');

      // Parse problem analysis
      const problemAnalysis = await parseJsonSafely(problemAnalysisResponse, {
        title: combinedTranscription.title || `${classification.subject_area} Problem`,
        problem_summary: combinedTranscription.text_content.raw_text,
        problem_type: classification.subject_area || 'OTHER',
        approach_guidance: '',
        language: classification.language || 'en'
      });

      // 4. SECOND CALL: Get concept cards
      const cardCount = getAppropriateCardCount(contentComplexity, classification);
      console.log(`[${new Date().toISOString()}] Generating ${cardCount} concept cards based on problem complexity`);

      const conceptCardsStream = await makeRequestWithRetry(() => 
        openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{
            role: "system",
            content: `You are an AI that creates educational concept cards for homework problems. Generate ONLY the concept_cards array.
            Your response must be valid JSON with ONLY this field:
            {
              "concept_cards": [
                {
                  "card_number": 1,
                  "title": "Concept title",
                  "explanation": "Detailed explanation of the concept",
                  "hint": "Hint to apply this concept to the problem"
                }
              ]
            }
            
            QUALITY REQUIREMENTS:
            1. Create EXACTLY ${cardCount} high-quality concept cards
            2. Each card should focus on a distinct concept needed to understand the problem type
            3. Cards should be sequenced in logical order (fundamentals first, then more complex concepts)
            4. ALL content MUST be in the SAME LANGUAGE as the source material (${problemAnalysis.language})`
          }, {
            role: "user",
            content: `${homeworkHelpPrompt}

IMPORTANT OVERRIDE: Generate ONLY concept cards following the guidelines in the homeworkHelpPrompt.
Focus exclusively on creating ${cardCount} high-quality concept cards.

Problem Title: ${problemAnalysis.title}
Problem Summary: ${problemAnalysis.problem_summary}
Approach Guidance: ${problemAnalysis.approach_guidance}

Problem Content:
${contentChunks.join("\n\n===SECTION BREAK===\n\n").substring(0, 6000)}`,
          }],
          max_tokens: 4096,
          stream: true
        })
      );

      // Process the second response
      let conceptCardsResponse = '';
      for await (const chunk of conceptCardsStream) {
        conceptCardsResponse += chunk.choices[0]?.delta?.content || '';
      }
      console.log('[Server] Second call completed - Concept cards generation');

      // Parse concept cards
      const conceptCardsData = await parseJsonSafely(conceptCardsResponse, {
        concept_cards: []
      });

      // 5. Combine all results
      const homeworkHelp = {
        title: problemAnalysis.title,
        problem_summary: problemAnalysis.problem_summary,
        problem_type: problemAnalysis.problem_type,
        approach_guidance: problemAnalysis.approach_guidance,
        language: problemAnalysis.language,
        concept_cards: conceptCardsData.concept_cards || []
      };

      // After parsing homeworkHelp
      console.log(`[${new Date().toISOString()}] Generated concept cards:`, 
        homeworkHelp.concept_cards ? 
        `${homeworkHelp.concept_cards.length} cards` : 
        'No cards generated');

      // Keep validation for problem summary
      if (!homeworkHelp.problem_summary || homeworkHelp.problem_summary.length < combinedTranscription.text_content.raw_text.length * 0.5) {
        console.log(`[${new Date().toISOString()}] Problem summary seems incomplete, adding full transcription`);
        homeworkHelp.problem_summary = combinedTranscription.text_content.raw_text;
      }

      // Return homework help result
      primaryResult = {
        title: homeworkHelp.title || combinedTranscription.title.replace(" - DRAFT ONLY", ""),
        text_content: combinedTranscription.text_content,
        contentType: 'homework-help',
        introduction: `I analyzed your ${classification.subject_area} problem. Here's some help to guide you through the solution.`,
        homeworkHelp: {
          type: classification.subject_area,
          classification: classification.classification,
          subject_area: classification.subject_area,
          language: classification.language,
          ...homeworkHelp
        },
        processingId,
        created_at: Date.now(),
        updated_at: Date.now()
      };
      
      // Store the processing status
      updateProcessingStatus(processingId, 'completed', primaryResult);

      // Send the response
      console.log(`[${new Date().toISOString()}] Sending homework help response to client`);
      res.json(primaryResult);
    } else {
      console.log(`[${new Date().toISOString()}] Using study materials approach`);
      
      // STEP 3B: STUDY MATERIALS PATH
      const stream = await makeRequestWithRetry(() => 
        openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{
            role: "system",
            content: `You are an AI that creates educational study materials. 
            MOST IMPORTANT: Your response MUST be ONLY a valid JSON object.
            Do NOT include any characters before the opening '{' or after the closing '}'.
            Do NOT add markdown formatting like \`\`\`json or any other text.
            Your entire response from the first character to the last must be valid parseable JSON.
            {
              "title": "string",
              "text_content": { "raw_text": "string" },
              "introduction": "string",
              "summary": "string with markdown",
              "flashcards": [{"front": "string", "back": "string"}],
              "quiz": [{"question": "string", "options": ["string"], "correct": "string", "explanation": "string"}]
            }`
          }, {
            role: "user",
            content: `${studyMaterialsPrompt}\n\nTranscription to use:\n${combinedTranscription.text_content.raw_text}`,
          }],
          max_tokens: 4096,
          stream: true
        })
      );

      let studyMaterialsResponse = '';
      for await (const chunk of stream) {
        studyMaterialsResponse += chunk.choices[0]?.delta?.content || '';
      }

      console.log('[Server] First 20 characters of raw response:', 
        studyMaterialsResponse.substring(0, 20)
          .split('')
          .map(c => c.charCodeAt(0))
          .join(','));

      let studyMaterials;
      try {
        // More robust JSON parsing approach
        const cleanedResponse = studyMaterialsResponse
          .trim()
          // Remove markdown code blocks more thoroughly
          .replace(/^```json\s*/igm, '')
          .replace(/^```\s*/igm, '')
          .replace(/\s*```$/igm, '')
          // Remove ALL control characters 
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
          // Handle potential UTF-8 BOM and other invisible markers
          .replace(/^\uFEFF/, '')
          // Make sure we start with a valid opening brace
          .replace(/^[^{]*({)/, '$1')
          .trim();

        console.log('[Server] First 10 characters of cleaned response:', cleanedResponse.substring(0, 10));
        
        try {
          studyMaterials = JSON.parse(cleanedResponse);
          console.log('[Server] Successfully parsed study materials');
        } catch (innerParseError) {
          console.error('[Server] Inner JSON parse error:', innerParseError);
          
          // Last resort JSON extraction 
          const regex = /{[\s\S]*}/g; // Match everything between { and } including newlines
          const jsonMatch = cleanedResponse.match(regex);
          if (jsonMatch && jsonMatch.length > 0) {
            try {
              // Take the longest match (most likely the complete JSON)
              const bestMatch = jsonMatch.reduce((a, b) => a.length > b.length ? a : b);
              studyMaterials = JSON.parse(bestMatch);
              console.log('[Server] Parsed JSON using regex extraction');
            } catch (lastAttemptError) {
              throw lastAttemptError;
            }
          } else {
            throw innerParseError;
          }
        }
        
        // Transform the response to match expected format
        studyMaterials = {
          title: studyMaterials.title || combinedTranscription.title || 'Untitled Study Set',
          text_content: studyMaterials.text_content || combinedTranscription.text_content,
          introduction: studyMaterials.introduction || 'Let\'s study this material together.',
          summary: studyMaterials.summary || studyMaterials.text_summary || combinedTranscription.text_content.raw_text,
          flashcards: Array.isArray(studyMaterials.flashcards) ? studyMaterials.flashcards : [],
          quiz: Array.isArray(studyMaterials.quiz) ? studyMaterials.quiz : [],
          vocabulary_tables: Array.isArray(studyMaterials.vocabulary_tables) ? studyMaterials.vocabulary_tables : [],
          subject_area: studyMaterials.subject_area || classification.subject_area || 'GENERAL'
        };

        // Validate the structure
        console.log('[Server] Parsed study materials structure:', {
          hasTitle: !!studyMaterials.title,
          hasTextContent: !!studyMaterials.text_content,
          hasSummary: !!studyMaterials.summary,
          flashcardsCount: studyMaterials.flashcards.length,
          quizCount: studyMaterials.quiz.length
        });

      } catch (parseError) {
        console.error('[Server] Parse error:', parseError);
        console.error('[Server] Failed content:', studyMaterialsResponse);
        
        // Create a fallback response
        studyMaterials = {
          title: combinedTranscription.title || 'Untitled Study Set',
          text_content: combinedTranscription.text_content,
          introduction: 'Here are your study materials.',
          summary: combinedTranscription.text_content.raw_text,
          flashcards: [],
          quiz: [],
          vocabulary_tables: [],
          subject_area: classification.subject_area || 'GENERAL'
        };
        
        console.log('[Server] Using fallback study materials structure');
      }

      // Normalize quiz data structure
      let normalizedQuiz = [];
      if (studyMaterials.quiz) {
        if (Array.isArray(studyMaterials.quiz)) {
          normalizedQuiz = studyMaterials.quiz;
        } else if (studyMaterials.quiz.questions && Array.isArray(studyMaterials.quiz.questions)) {
          normalizedQuiz = studyMaterials.quiz.questions;
        }
      }

      // Create a result that includes both the classification and study materials
      const result = {
        title: combinedTranscription.title,
        text_content: combinedTranscription.text_content,
        contentType: 'study-set',
        introduction: studyMaterials.introduction || 'I analyzed your content. Here\'s some material to help you master this subject.',
        summary: studyMaterials.summary || '',
        subject_area: studyMaterials.subject_area || classification.subject_area || 'GENERAL',
        flashcards: studyMaterials.flashcards || [],
        quiz: normalizedQuiz,
        vocabulary_tables: studyMaterials.vocabulary_tables || [],
        created_at: Date.now(),
        updated_at: Date.now(),
        processingId
      };

      // After parsing homeworkHelp
      console.log(`[${new Date().toISOString()}] Generated concept cards:`, 
        result.homeworkHelp ? 
        `${result.homeworkHelp.concept_cards.length} cards` : 
        'No cards generated');

      // Before sending the response, store the full result
      updateProcessingStatus(processingId, 'completed', result);

      // Then send the response
      res.json(result);
    }

  } catch (error) {
    updateProcessingStatus(processingId, 'error');
    console.error(`[${new Date().toISOString()}] Error:`, error);
    
    // Error handling (similar to existing code)
    let statusCode = 500;
    let errorMessage = 'Error processing homework help request';
    
    if (error.message.includes('Invalid request')) {
      statusCode = 400;
      errorMessage = 'Invalid request';
    } else if (error.message.includes('too large')) {
      statusCode = 413;
      errorMessage = 'Images are too large';
    } else if (error.message.includes('rate limit')) {
      statusCode = 429;
      errorMessage = 'Too many attempts';
    } else if (error.message.includes('OpenAI')) {
      statusCode = 503;
      errorMessage = 'AI service is temporarily unavailable';
    }

    res.status(statusCode).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      processingId
    });
  }
});

// Add endpoint for retrieving the next concept card
app.get('/next-concept-card/:homeworkHelpId/:currentCardNumber', async (req, res) => {
  try {
    const { homeworkHelpId, currentCardNumber } = req.params;
    const cardNum = parseInt(currentCardNumber, 10);
    
    // This would typically fetch from a database, but for simplicity,
    // we'll use the processing status map which stores the full response
    const processingResult = processingStatus.get(homeworkHelpId);
    
    if (!processingResult || !processingResult.result) {
      return res.status(404).json({ error: 'Homework help not found' });
    }
    
    const { homeworkHelp } = processingResult.result;
    
    // Find the next card
    const nextCard = homeworkHelp.concept_cards.find(card => card.card_number === cardNum + 1);
    
    if (!nextCard) {
      return res.status(404).json({ error: 'No more concept cards available' });
    }
    
    res.json(nextCard);
  } catch (error) {
    console.error('[Server] Error fetching next concept card:', error);
    res.status(500).json({ error: 'Failed to retrieve next concept card' });
  }
});

// Add endpoint for getting additional hints
app.post('/additional-hint', async (req, res) => {
  try {
    const { homeworkHelpId, cardNumber } = req.body;
    
    // Get the existing homework help
    const processingResult = processingStatus.get(homeworkHelpId);
    
    if (!processingResult || !processingResult.result) {
      return res.status(404).json({ error: 'Homework help not found' });
    }
    
    const { homeworkHelp, text_content } = processingResult.result;
    
    // Find the specific card
    const card = homeworkHelp.concept_cards.find(c => c.card_number === parseInt(cardNumber, 10));
    
    if (!card) {
      return res.status(404).json({ error: 'Concept card not found' });
    }
    
    // Generate an additional hint using the original content and card
    const hintResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: `You are a helpful learning assistant. A student is working on a problem and needs an additional hint.
          
Original problem:
${text_content.raw_text}

The concept they're working with:
${card.title} - ${card.explanation}

Their current hint:
${card.hint}

Provide ONE additional hint that gives more guidance without revealing the full solution. Make the hint specific and directly related to the concept, building on the current hint.`
        }
      ],
      max_tokens: 200
    });
    
    const additionalHint = hintResponse.choices[0].message.content.trim();
    
    res.json({ 
      card_number: card.card_number,
      additional_hint: additionalHint 
    });
    
  } catch (error) {
    console.error('[Server] Error generating additional hint:', error);
    res.status(500).json({ error: 'Failed to generate additional hint' });
  }
});

// Chat endpoint - updated with improved educational prompt
app.post('/chat', async (req, res) => {
  try {
    const { message, sessionId, contentId, contentType, contentContext, messageHistory } = req.body;
    
    console.log(`[Server] Chat request received:`, {
      messagePreview: message.substring(0, 50),
      contentType,
      hasContext: !!contentContext,
      contentTitle: contentContext?.title,
      messageHistoryLength: messageHistory?.length
    });
    
    if (!message || !sessionId || !contentId || !contentType || !contentContext) {
      console.error('[Server] Missing parameters:', { 
        hasMessage: !!message, 
        hasSessionId: !!sessionId,
        hasContentId: !!contentId,
        hasContentType: !!contentType,
        hasContext: !!contentContext 
      });
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Format the content context for the AI
    let formattedContext = '';
    if (contentType === 'study-set') {
      formattedContext = `
STUDY MATERIAL: "${contentContext.title}"

FULL CONTENT:
${contentContext.text_content.raw_text}

${contentContext.summary ? `SUMMARY:
${contentContext.summary}` : ''}

${contentContext.flashcards ? `KEY CONCEPTS:
${contentContext.flashcards.map(card => `- ${card.front}: ${card.back}`).join('\n')}` : ''}
      `;
    } else if (contentType === 'homework-help') {
      formattedContext = `
HOMEWORK PROBLEM: "${contentContext.title}"

PROBLEM SUMMARY:
${contentContext.homeworkHelp.problem_summary || contentContext.text_content.raw_text}

${contentContext.homeworkHelp.approach_guidance ? `APPROACH GUIDANCE:
${contentContext.homeworkHelp.approach_guidance}` : ''}

${contentContext.homeworkHelp.concept_cards ? `KEY CONCEPTS:
${contentContext.homeworkHelp.concept_cards.map(card => `- ${card.title}: ${card.explanation}`).join('\n')}` : ''}
      `;
    }
    
    // Build the conversation with context and history
    const conversation = [
      {
        role: "system",
        content: lexieTutorPrompt
      },
      {
        role: "system",
        content: `You are helping with this specific content:\n\n${formattedContext}`
      },
      // Include previous messages
      ...(messageHistory || []),
      {
        role: "user",
        content: message
      }
    ];
    
    // Get response from OpenAI
    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: conversation,
      max_tokens: 1024,
      temperature: 0.7
    });
    
    const responseText = chatResponse.choices[0].message.content.trim();
    
    console.log(`[${new Date().toISOString()}] Chat response generated`);
    
    res.json({
      response: responseText
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Chat error:`, error);
    res.status(500).json({ 
      error: 'Failed to process chat message',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Start the server
app.listen(PORT, HOST, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`For mobile access use: http://<your-local-ip>:${PORT}`)
})

// Helper function to create intelligent content chunks
function getIntelligentChunks(text) {
  if (text.length <= 4000) return [text];
  
  // Split by paragraphs or sections
  const paragraphs = text.split(/\n\n+/);
  const totalParagraphs = paragraphs.length;
  
  // If very few paragraphs but long content, try sentence splitting
  if (totalParagraphs < 5 && text.length > 4000) {
    const sentences = text.split(/(?<=[.!?])\s+/);
    return chunkArray(sentences.join(' '), 3);
  }
  
  // Calculate number of chunks based on content length
  const numChunks = Math.ceil(text.length / 3500);
  const paragraphsPerChunk = Math.ceil(totalParagraphs / numChunks);
  
  const chunks = [];
  for (let i = 0; i < totalParagraphs; i += paragraphsPerChunk) {
    chunks.push(paragraphs.slice(i, i + paragraphsPerChunk).join('\n\n'));
  }
  
  return chunks;
}

// Helper function to chunk array
function chunkArray(text, numChunks) {
  const chunkSize = Math.ceil(text.length / numChunks);
  const chunks = [];
  
  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.substring(start, end));
  }
  
  return chunks;
}

// Helper function to determine appropriate flashcard count
function getAppropriateFlashcardCount(complexity, classification) {
  if (classification.classification === 'LANGUAGE_LEARNING' || 
      classification.subject_area === 'LANGUAGE_LEARNING') {
    // For vocabulary content, scale based on complexity
    return complexity === 'high' ? 25 : complexity === 'medium' ? 20 : 15;
  } else {
    // For subject content, scale based on complexity
    return complexity === 'high' ? 20 : complexity === 'medium' ? 15 : 12;
  }
}

// Helper function to determine appropriate quiz count
function getAppropriateQuizCount(complexity, classification) {
  return complexity === 'high' ? 15 : complexity === 'medium' ? 10 : 8;
}

// Helper function for safe JSON parsing with fallback
async function parseJsonSafely(responseText, defaultValues) {
  try {
    // Clean the response text
    const cleanedResponse = responseText
      .trim()
      .replace(/^```json\s*/igm, '')
      .replace(/^```\s*/igm, '')
      .replace(/\s*```$/igm, '')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .replace(/^\uFEFF/, '')
      .replace(/^[^{]*({)/, '$1')
      .trim();
    
    try {
      return JSON.parse(cleanedResponse);
    } catch (innerError) {
      console.error('[Server] Inner JSON parse error:', innerError);
      
      // Try regex extraction
      const regex = /{[\s\S]*}/g;
      const jsonMatch = cleanedResponse.match(regex);
      if (jsonMatch && jsonMatch.length > 0) {
        const bestMatch = jsonMatch.reduce((a, b) => a.length > b.length ? a : b);
        return JSON.parse(bestMatch);
      }
      
      throw innerError;
    }
  } catch (error) {
    console.error('[Server] Failed to parse JSON response:', error);
    return defaultValues;
  }
}

// Add this helper function to determine appropriate card count
function getAppropriateCardCount(complexity, classification) {
  // Scale card count based on problem complexity
  // More complex problems need more concept cards to break down
  switch (complexity) {
    case 'high':
      return 6; // Complex problems need more cards to break down
    case 'medium':
      return 4; // Medium complexity problems
    default:
      return 3; // Simple problems
  }
}
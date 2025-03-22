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

    // STEP 2: CLASSIFICATION
    console.log(`[${new Date().toISOString()}] Classifying content...`);
    const classificationResponse = await makeRequestWithRetry(() => 
      openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
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
        .replace(/^```json\s*/i, '')  // Remove opening ```json
        .replace(/^```\s*/i, '')      // Remove opening ```
        .replace(/\s*```$/i, '')      // Remove closing ```
        .trim();
        
      console.log(`[${new Date().toISOString()}] Cleaned classification result for parsing`);
      
      const parsedClassification = JSON.parse(cleanedResult);
      classification = {
        ...classification, // Maintain defaults
        ...parsedClassification // Override with parsed values
      };
      console.log(`[${new Date().toISOString()}] Content classified as: ${classification.classification} (${classification.subject_area})`);
      console.log(`[${new Date().toISOString()}] Processing approach: ${classification.processing_approach}`);
    } catch (parseError) {
      console.error('[Server] Classification parse error:', parseError);
      console.error('[Server] Content that failed to parse:', classificationResult);
      // Use default values set above
      console.log(`[${new Date().toISOString()}] Using default classification due to parse error`);
    }

    // NEW: Analyze text to determine if it's more likely to be study material
    const hasDefinitions = combinedTranscription.text_content.raw_text.match(/definition|is defined as|refers to|means/gi);
    const hasMultipleTopics = combinedTranscription.text_content.raw_text.split('\n\n').length > 3;
    const hasProblemIndicators = combinedTranscription.text_content.raw_text.match(/solve|calculate|find the|problem|exercise/gi);

    // Override classification if text analysis strongly suggests it's study material
    if ((hasDefinitions || hasMultipleTopics) && !hasProblemIndicators) {
      if (classification.classification !== "TEXTBOOK_MATERIAL") {
        console.log(`[${new Date().toISOString()}] Overriding classification to TEXTBOOK_MATERIAL based on content analysis`);
        classification.classification = "TEXTBOOK_MATERIAL";
        classification.processing_approach = "Textbook Content Processing";
      }
    }

    let result;
    let primaryResult;

    // STEP 3: BRANCH BASED ON CLASSIFICATION
    if (classification.classification === "PROBLEM_ASSIGNMENT") {
      console.log(`[${new Date().toISOString()}] Using problem assistance approach`);
      
      // STEP 3A: HOMEWORK HELP PATH
      const homeworkHelpResponse = await makeRequestWithRetry(() => 
        openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{
            role: "user",
            content: `${homeworkHelpPrompt}\n\nProblem Type: ${classification.subject_area}\n\nHomework Content:\n${combinedTranscription.text_content.raw_text}`,
          }],
          max_tokens: 4096,
          stream: true
        })
      );

      let homeworkHelpContent = '';
      for await (const chunk of homeworkHelpResponse) {
        homeworkHelpContent += chunk.choices[0]?.delta?.content || '';
      }

      // Parse homework help
      let jsonContent = homeworkHelpContent;
      const startIndex = homeworkHelpContent.indexOf('{');
      const endIndex = homeworkHelpContent.lastIndexOf('}') + 1;

      if (startIndex >= 0 && endIndex > startIndex) {
        jsonContent = homeworkHelpContent.substring(startIndex, endIndex);
      }

      let homeworkHelp;
      try {
        homeworkHelp = JSON.parse(jsonContent);
      } catch (parseError) {
        console.error(`[${new Date().toISOString()}] Failed to parse homework help:`, parseError);
        homeworkHelp = {
          assignment: {
            facts: ["Content could not be properly analyzed"],
            objective: "Understanding the given problem"
          },
          concept_cards: [
            {
              card_number: 1,
              title: "Try Again with a Clearer Image",
              explanation: "The system had trouble understanding your homework problem.",
              hint: "Consider uploading a clearer image or typing out the problem manually."
            }
          ]
        };
      }

      // After parsing homeworkHelp
      console.log(`[${new Date().toISOString()}] Generated concept cards:`, 
        homeworkHelp.concept_cards ? 
        `${homeworkHelp.concept_cards.length} cards` : 
        'No cards generated');

      // Return homework help result
      primaryResult = {
        title: combinedTranscription.title,
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
      
    } else {
      console.log(`[${new Date().toISOString()}] Using study materials approach`);
      
      // STEP 3B: STUDY MATERIALS PATH
      const stream = await makeRequestWithRetry(() => 
        openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{
            role: "system",
            content: "You are an AI that creates educational study materials. Always respond in valid JSON format with introduction, summary, flashcards array, and quiz array."
          }, {
            role: "user",
            content: `${studyMaterialsPrompt}\n\nTranscription to use:\n${combinedTranscription.text_content.raw_text}`,
          }],
          max_tokens: 4096,
          stream: true  // Make sure this is present
        })
      );

      let studyMaterialsResponse = '';
      for await (const chunk of stream) {
        studyMaterialsResponse += chunk.choices[0]?.delta?.content || '';
      }

      let studyMaterials;
      try {
        // With response_format: json_object, we can parse directly
        studyMaterials = JSON.parse(studyMaterialsResponse);
        console.log(`[${new Date().toISOString()}] Successfully parsed JSON response`);
      } catch (parseError) {
        console.error(`[${new Date().toISOString()}] Failed direct JSON parse, attempting extraction:`, parseError);
        
        try {
          // Try to extract JSON using regex for better matching
          const jsonRegex = /{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*}/g;
          const matches = studyMaterialsResponse.match(jsonRegex);
          
          if (matches && matches.length > 0) {
            // Use the largest match as it's likely the complete structure
            const largestMatch = matches.reduce((a, b) => a.length > b.length ? a : b);
            studyMaterials = JSON.parse(largestMatch);
            console.log(`[${new Date().toISOString()}] Extracted JSON using regex`);
          } else {
            throw new Error("No JSON structure found in response");
          }
        } catch (extractError) {
          console.error(`[${new Date().toISOString()}] Failed to extract JSON:`, extractError);
          // Provide a basic fallback structure
          studyMaterials = {
            introduction: "I analyzed your content. Here's some material to help you master this subject.",
            summary: "",
            flashcards: [],
            quiz: []
          };
        }
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

      // Return study materials result
      primaryResult = {
        title: combinedTranscription.title,
        text_content: combinedTranscription.text_content,
        contentType: 'study-set',
        introduction: studyMaterials.introduction || 'I analyzed your content. Here\'s some material to help you master this subject.',
        summary: studyMaterials.summary || '',
        flashcards: studyMaterials.flashcards || [],
        quiz: normalizedQuiz,
        created_at: Date.now(),
        updated_at: Date.now(),
        processingId
      };
    }

    // NEW: Validate if necessary data was generated
    let needsFallback = false;

    if (primaryResult.contentType === 'study-set' && 
        (!primaryResult.flashcards || primaryResult.flashcards.length === 0 || 
         !primaryResult.quiz || primaryResult.quiz.length === 0)) {
      console.log(`[${new Date().toISOString()}] Study materials missing essential content, generating fallback`);
      needsFallback = true;
    }

    // Generate fallback if needed
    if (needsFallback) {
      try {
        console.log(`[${new Date().toISOString()}] Generating fallback content...`);
        
        // Force generating flashcards if they're missing
        if (!primaryResult.flashcards || primaryResult.flashcards.length === 0) {
          const flashcardResponse = await makeRequestWithRetry(() => 
            openai.chat.completions.create({
              model: "gpt-4o",
              messages: [{
                role: "user",
                content: `Create 5-10 flashcards based on this text. Format as JSON array with "front" and "back" properties:
                  
                  ${combinedTranscription.text_content.raw_text}`,
              }],
              max_tokens: 2048,
            })
          );
          
          try {
            const flashcardContent = flashcardResponse.choices[0].message.content;
            // Extract JSON
            const jsonMatch = flashcardContent.match(/\[\s*\{.*\}\s*\]/s);
            if (jsonMatch) {
              const flashcards = JSON.parse(jsonMatch[0]);
              primaryResult.flashcards = flashcards;
              console.log(`[${new Date().toISOString()}] Generated ${flashcards.length} fallback flashcards`);
            }
          } catch (error) {
            console.error('[Server] Fallback flashcard parsing error:', error);
          }
        }
        
        // Force generating quiz if it's missing
        if (!primaryResult.quiz || primaryResult.quiz.length === 0) {
          const quizResponse = await makeRequestWithRetry(() => 
            openai.chat.completions.create({
              model: "gpt-4o",
              messages: [{
                role: "user",
                content: `Create 5 quiz questions based on this text. Format as JSON array with "question", "options" (array), "correct" (matching one option), and "explanation" properties:
                  
                  ${combinedTranscription.text_content.raw_text}`,
              }],
              max_tokens: 2048,
            })
          );
          
          try {
            const quizContent = quizResponse.choices[0].message.content;
            // Extract JSON
            const jsonMatch = quizContent.match(/\[\s*\{.*\}\s*\]/s);
            if (jsonMatch) {
              const quiz = JSON.parse(jsonMatch[0]);
              primaryResult.quiz = quiz;
              console.log(`[${new Date().toISOString()}] Generated ${quiz.length} fallback quiz questions`);
            }
          } catch (error) {
            console.error('[Server] Fallback quiz parsing error:', error);
          }
        }
        
        // Generate summary if it's missing
        if (!primaryResult.summary) {
          const summaryResponse = await makeRequestWithRetry(() => 
            openai.chat.completions.create({
              model: "gpt-4o",
              messages: [{
                role: "user",
                content: `Summarize this text in 2-4 paragraphs:
                  
                  ${combinedTranscription.text_content.raw_text}`,
              }],
              max_tokens: 1024,
            })
          );
          
          primaryResult.summary = summaryResponse.choices[0].message.content.trim();
          console.log(`[${new Date().toISOString()}] Generated fallback summary`);
        }
        
      } catch (fallbackError) {
        console.error('[Server] Error generating fallback content:', fallbackError);
      }
    }

    // Use the primaryResult (with fallback additions if needed)
    result = primaryResult;

    const totalTime = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] Analysis completed in ${totalTime}ms`);
    
    res.json(result);

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
  const { text, type = 'chunk', language } = req.body;
  
  // Always use Nova voice as preferred by user, regardless of language
  const voice = "nova";
  
  // Keep language detection for other purposes
  const isFinish = language === 'fi' || 
      text.match(/[äöåÄÖÅ]/) || 
      text.includes('Suomen') || 
      text.includes('suomi');
  
  if (isFinish) {
    console.log('[TTS] Detected Finnish content, still using nova voice as preferred');
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
      
      const parsedClassification = JSON.parse(cleanedResult);
      classification = {
        ...classification, // Maintain defaults
        ...parsedClassification // Override with parsed values
      };
      console.log(`[${new Date().toISOString()}] Content classified as: ${classification.classification} (${classification.subject_area})`);
    } catch (parseError) {
      console.error('[Server] Classification parse error:', parseError);
      console.error('[Server] Content that failed to parse:', classificationResult);
      // Use default values set above
      console.log(`[${new Date().toISOString()}] Using default classification due to parse error`);
    }

    // Generate appropriate homework help based on classification
    updateProcessingStatus(processingId, 'generating');
    console.log(`[${new Date().toISOString()}] Generating assistance...`);

    // Only use homework help prompt for PROBLEM_ASSIGNMENT
    if (classification.processing_approach === "Problem Assistance") {
      console.log(`[${new Date().toISOString()}] Using problem assistance approach`);
      
      const homeworkHelpResponse = await makeRequestWithRetry(() => 
        openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{
            role: "user",
            content: `${homeworkHelpPrompt}\n\nProblem Type: ${classification.subject_area}\n\nHomework Content:\n${combinedTranscription.text_content.raw_text}`,
          }],
          max_tokens: 4096,
          stream: true
        })
      );

      let homeworkHelpContent = '';
      for await (const chunk of homeworkHelpResponse) {
        homeworkHelpContent += chunk.choices[0]?.delta?.content || '';
      }

      // Parse homework help response
      console.log(`[${new Date().toISOString()}] Parsing homework help response`);

      // Extract JSON from the response
      let jsonContent = homeworkHelpContent;
      const startIndex = homeworkHelpContent.indexOf('{');
      const endIndex = homeworkHelpContent.lastIndexOf('}') + 1;

      if (startIndex >= 0 && endIndex > startIndex) {
        jsonContent = homeworkHelpContent.substring(startIndex, endIndex);
        console.log(`[${new Date().toISOString()}] Extracted JSON content from response`);
      }

      let homeworkHelp;
      try {
        homeworkHelp = JSON.parse(jsonContent);
        console.log(`[${new Date().toISOString()}] Successfully parsed homework help`);
      } catch (parseError) {
        console.error(`[${new Date().toISOString()}] Failed to parse homework help:`, parseError);
        // Return a default structure matching the expected format
        homeworkHelp = {
          assignment: {
            facts: ["Content could not be properly analyzed"],
            objective: "Understanding the given problem"
          },
          concept_cards: [
            {
              card_number: 1,
              title: "Try Again with a Clearer Image",
              explanation: "The system had trouble understanding your homework problem.",
              hint: "Consider uploading a clearer image or typing out the problem manually."
            }
          ]
        };
      }

      // After parsing homeworkHelp
      console.log(`[${new Date().toISOString()}] Generated concept cards:`, 
        homeworkHelp.concept_cards ? 
        `${homeworkHelp.concept_cards.length} cards` : 
        'No cards generated');

      // Combine results (integrating with existing data structure)
      const result = {
        title: combinedTranscription.title,
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

      // Before sending the response, store the full result
      updateProcessingStatus(processingId, 'completed', result);

      // Then send the response
      res.json(result);
    } else {
      // For textbook content, use a different approach (study materials generation)
      console.log(`[${new Date().toISOString()}] Using textbook content processing approach`);
      
      // Generate study materials from combined text
      console.log(`[${new Date().toISOString()}] Generating study materials...`);
      const stream = await makeRequestWithRetry(() => 
        openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{
            role: "system",
            content: "You are an AI that creates educational study materials. Always respond in valid JSON format with introduction, summary, flashcards array, and quiz array."
          }, {
            role: "user",
            content: `${studyMaterialsPrompt}\n\nTranscription to use:\n${combinedTranscription.text_content.raw_text}`,
          }],
          max_tokens: 4096,
          stream: true  // Make sure this is present
        })
      );

      let studyMaterialsResponse = '';
      for await (const chunk of stream) {
        studyMaterialsResponse += chunk.choices[0]?.delta?.content || '';
      }

      let studyMaterials;
      try {
        // With response_format: json_object, we can parse directly
        studyMaterials = JSON.parse(studyMaterialsResponse);
        console.log(`[${new Date().toISOString()}] Successfully parsed JSON response`);
      } catch (parseError) {
        console.error(`[${new Date().toISOString()}] Failed direct JSON parse, attempting extraction:`, parseError);
        
        try {
          // Try to extract JSON using regex for better matching
          const jsonRegex = /{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*}/g;
          const matches = studyMaterialsResponse.match(jsonRegex);
          
          if (matches && matches.length > 0) {
            // Use the largest match as it's likely the complete structure
            const largestMatch = matches.reduce((a, b) => a.length > b.length ? a : b);
            studyMaterials = JSON.parse(largestMatch);
            console.log(`[${new Date().toISOString()}] Extracted JSON using regex`);
          } else {
            throw new Error("No JSON structure found in response");
          }
        } catch (extractError) {
          console.error(`[${new Date().toISOString()}] Failed to extract JSON:`, extractError);
          // Provide a basic fallback structure
          studyMaterials = {
            introduction: "I analyzed your content. Here's some material to help you master this subject.",
            summary: "",
            flashcards: [],
            quiz: []
          };
        }
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
        flashcards: studyMaterials.flashcards || [],
        quiz: normalizedQuiz,
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

// Start the server
app.listen(PORT, HOST, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`For mobile access use: http://<your-local-ip>:${PORT}`)
})
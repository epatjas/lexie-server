// Import required dependencies
const express = require('express')                // Web framework for Node.js
const cors = require('cors')                      // Enable Cross-Origin Resource Sharing
const OpenAI = require('openai')                  // OpenAI API client
const rateLimit = require('express-rate-limit')   // Rate limiting middleware
require('dotenv').config()                        // Load environment variables from .env file
const fs = require('fs');                         // File system module (currently unused - can be removed)
const transcriptionPrompt = require('./prompts/transcriptionPrompt');    // Load prompts from separate files
const studyMaterialsPrompt = require('./prompts/studyMaterialsPrompt');
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
  
  try {
    const { images } = req.body
    console.log(`[${new Date().toISOString()}] Starting analysis of ${images.length} images`)
    
    // Process images in parallel
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

    // Combine transcriptions and keep the title from the first one
    const combinedTranscription = {
      title: transcriptions[0].title,
      text_content: {
        raw_text: transcriptions.map(t => t.text_content.raw_text).join('\n\n'),
        sections: transcriptions.flatMap(t => t.text_content.sections)
      }
    };

    // Generate study materials from combined text
    console.log(`[${new Date().toISOString()}] Generating study materials...`);
    const stream = await makeRequestWithRetry(() => 
      openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
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

    // Parse study materials
    console.log(`[${new Date().toISOString()}] Parsing study materials response`);
    const cleanStudyMaterialsResponse = studyMaterialsResponse
      .replace(/```json\n/, '')
      .replace(/\n```$/, '')
      .trim();

    let studyMaterials;
    try {
      // Check if response starts with { to validate it's JSON
      if (!cleanStudyMaterialsResponse.startsWith('{')) {
        console.error(`[${new Date().toISOString()}] Invalid study materials response:`, cleanStudyMaterialsResponse);
        // Return a default structure instead of throwing
        studyMaterials = {
          flashcards: [],
          quiz: {
            questions: []
          }
        };
      } else {
        studyMaterials = JSON.parse(cleanStudyMaterialsResponse);
        console.log(`[${new Date().toISOString()}] Successfully parsed study materials`);
      }
    } catch (parseError) {
      console.error(`[${new Date().toISOString()}] Failed to parse study materials:`, cleanStudyMaterialsResponse);
      // Return a default structure instead of throwing
      studyMaterials = {
        flashcards: [],
        quiz: {
          questions: []
        }
      };
    }

    // Combine results
    const result = {
      title: combinedTranscription.title,
      text_content: combinedTranscription.text_content,
      flashcards: studyMaterials.flashcards || [],
      quiz: studyMaterials.quiz || { questions: [] },
      created_at: Date.now(),
      updated_at: Date.now()
    };

    const totalTime = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] Analysis completed in ${totalTime}ms`)
    console.log('- Image sizes:', images.map((_, i) => `Image ${i + 1}: ${(Buffer.byteLength(images[i], 'base64') / (1024 * 1024)).toFixed(2)}MB`).join(', '))
    console.log('- Parallel transcription time:', transcriptionResponses[0].created * 1000 - startTime, 'ms')
    console.log('- Study materials time:', studyMaterialsResponse.created * 1000 - transcriptionResponses[0].created * 1000, 'ms')

    res.json(result)

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error:`, error);
    
    let statusCode = 500;
    let errorMessage = 'Kuvien käsittelyssä tapahtui virhe';
    
    if (error.message.includes('Invalid request')) {
      statusCode = 400;
      errorMessage = 'Virheellinen pyyntö';
    } else if (error.message.includes('too large')) {
      statusCode = 413;
      errorMessage = 'Kuvat ovat liian suuria';
    } else if (error.message.includes('rate limit')) {
      statusCode = 429;
      errorMessage = 'Liian monta yritystä';
    } else if (error.message.includes('OpenAI')) {
      statusCode = 503;
      errorMessage = 'Tekstintunnistus ei ole juuri nyt käytettävissä';
    }

    res.status(statusCode).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
})

// Health check endpoint
app.get('/ping', (req, res) => {
  res.json({ message: 'Server is running' })
})

app.get('/processing-status/:id', (req, res) => {
  const { id } = req.params;
  // Get status from processing map/cache
  const status = processingStatus.get(id) || { stage: 'unknown' };
  res.json(status);
});

// Update status during processing
const updateProcessingStatus = (id, stage) => {
  processingStatus.set(id, { stage, timestamp: Date.now() });
};

// TTS endpoint
app.post('/tts', async (req, res) => {
  const { text, type = 'chunk' } = req.body;
  const voice = "nova";
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

// CORS preflight
app.options('/tts', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  }).status(200).send();
});

// Start the server
app.listen(PORT, HOST, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`For mobile access use: http://<your-local-ip>:${PORT}`)
})
// Import required dependencies
const express = require('express')                // Web framework for Node.js
const cors = require('cors')                      // Enable Cross-Origin Resource Sharing
const OpenAI = require('openai')                  // OpenAI API client
const rateLimit = require('express-rate-limit')   // Rate limiting middleware
require('dotenv').config()                        // Load environment variables from .env file
const fs = require('fs');                         // File system module (currently unused - can be removed)
const transcriptionPrompt = require('./prompts/transcriptionPrompt');    // Load prompts from separate files
const studyMaterialsPrompt = require('./prompts/studyMaterialsPrompt');

// Initialize Express app and middleware
const app = express()
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

// Main endpoint for analyzing images and generating study materials
app.post('/analyze', validateAnalyzeRequest, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { images } = req.body
    console.log(`[${new Date().toISOString()}] Starting analysis of ${images.length} images`)
    
    // Process images in parallel
    const transcriptionPromises = images.map((image, index) => {
      console.log(`[${new Date().toISOString()}] Processing image ${index + 1}/${images.length}`)
      return openai.chat.completions.create({
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
    })

    // Wait for all transcriptions
    console.log(`[${new Date().toISOString()}] Waiting for all transcriptions...`)
    const transcriptionResponses = await Promise.all(transcriptionPromises)
    
    // Combine transcriptions and keep the title from the first one
    const transcriptions = transcriptionResponses.map(resp => 
      JSON.parse(resp.choices[0].message.content)
    )
    const combinedTranscription = {
      title: transcriptions[0].title,
      text_content: {
        raw_text: transcriptions.map(t => t.text_content.raw_text).join('\n\n'),
        sections: transcriptions.flatMap(t => t.text_content.sections)
      }
    }

    // Generate study materials from combined text
    console.log(`[${new Date().toISOString()}] Generating study materials...`)
    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "user",
        content: `${studyMaterialsPrompt}\n\nTranscription to use:\n${combinedTranscription.text_content.raw_text}`,
      }],
      max_tokens: 4096,
      stream: true
    })

    let studyMaterialsResponse = ''
    for await (const chunk of stream) {
      studyMaterialsResponse += chunk.choices[0]?.delta?.content || ''
    }

    // Parse study materials
    console.log(`[${new Date().toISOString()}] Parsing study materials response`)
    const cleanStudyMaterialsResponse = studyMaterialsResponse
      .replace(/```json\n/, '')
      .replace(/\n```$/, '')

    let studyMaterials
    try {
      studyMaterials = JSON.parse(cleanStudyMaterialsResponse)
      console.log(`[${new Date().toISOString()}] Successfully parsed study materials`)
    } catch (parseError) {
      console.error(`[${new Date().toISOString()}] Failed to parse study materials:`, cleanStudyMaterialsResponse)
      throw parseError
    }

    // Combine results
    const result = {
      title: combinedTranscription.title,
      text_content: combinedTranscription.text_content,
      flashcards: studyMaterials.flashcards,
      quiz: studyMaterials.quiz,
      created_at: Date.now(),
      updated_at: Date.now()
    }

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

// Start the server
app.listen(PORT, HOST, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`For mobile access use: http://<your-local-ip>:${PORT}`)
})
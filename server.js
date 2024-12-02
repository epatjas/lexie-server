const express = require('express')
const cors = require('cors')
const OpenAI = require('openai')
require('dotenv').config()
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const fs = require('fs');

const app = express()
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}))
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch(e) {
      res.status(400).send('Invalid JSON');
    }
  }
}))

const PORT = 3000;
const HOST = '0.0.0.0'; 

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Test endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Lexie server is running!' })
})

app.post('/analyze', async (req, res) => {
  try {
    const { images } = req.body;
    
    if (!images || !Array.isArray(images) || images.length === 0) {
      console.error('No images received');
      return res.status(400).json({ error: 'No images provided' });
    }

    console.log(`Received analyze request for ${images.length} images`);

    // Combine all images into one context
    const combinedContent = [
      {
        type: "text",
        text: `# System Context
You are an expert OCR system and educational content creator. Your TWO primary tasks are:
1. Extract text with perfect accuracy from ALL provided images
2. Create high-quality study materials from the complete extracted content

# Output Format
{
  "title": "string",
  "language": "string",
  "text_content": {
    "raw_text": "string",
    "sections": [
      {
        "type": "string",
        "level": "number",
        "content": "string",
        "style": "string",
        "items": ["string"]
      }
    ]
  },
  "flashcards": [
    {
      "front": "string",
      "back": "string"
    }
  ],
  "quiz": [
    {
      "question": "string",
      "options": ["string"],
      "correct": "string",
      "explanation": "string"
    }
  ]
}

# Task 1: Text Extraction
CRITICAL: Extract text perfectly from ALL provided images.
- Process each image with equal attention to detail
- Combine content logically when multiple images are provided
- Copy text EXACTLY as written - no modifications whatsoever
- Double-check every word for accuracy
- If unsure about any text, mark it with [unclear] 
- Preserve ALL special characters and diacritical marks
- Keep ALL formatting and structure exactly as in the original

Follow these steps for EACH image:
1. First pass: Extract all text character by character
2. Second pass: Compare against original image
3. Third pass: Verify all special characters and diacritical marks
4. Format using simple markdown:
   - # for headings
   - ** for bold
   - * for italic
   - - for bullet points
   - 1. for numbered lists

When handling multiple images:
- Process each image fully before moving to the next
- Maintain the logical flow of content
- Combine content seamlessly in the final output

# Task 2: Study Material Creation
ONLY after perfect text extraction from ALL images, create:

1. Flashcards (5-7)
- Cover key concepts from all provided content
- Use exact phrases from text
- Make questions clear and specific
- Ensure coverage across all important topics

2. Quiz (5-10 questions)
- Multiple choice format
- Test understanding across all provided content
- Use exact wording from text
- Make distractors plausible but clearly incorrect
- Include questions from all major topics covered

# Quality Checks
Before submitting:
1. Verify text matches ALL images 100%
2. Confirm all special characters are preserved
3. Check formatting is consistent
4. Ensure questions use exact text phrasing
5. Verify all content is included and properly combined
6. Verify all JSON is valid

# Final Notes
- Perfect text extraction is your TOP priority
- Never modify or "improve" the original text
- Use exact quotes in study materials
- When in doubt, be more literal
- Treat single and multiple images with equal attention to detail`
      },
      ...images.map((image) => ({
        type: "image_url",
        image_url: {
          url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`,
          detail: "high"
        }
      }))
    ];

    // Create the messages array with the improved prompt
    const messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `# System Context
You are an expert OCR system and educational content creator. Your TWO primary tasks are:
1. Extract text with perfect accuracy from ALL provided images
2. Create high-quality study materials from the complete extracted content

# Output Format
{
  "title": "string",
  "language": "string",
  "text_content": {
    "raw_text": "string",
    "sections": [
      {
        "type": "string",
        "level": "number",
        "content": "string",
        "style": "string",
        "items": ["string"]
      }
    ]
  },
  "flashcards": [
    {
      "front": "string",
      "back": "string"
    }
  ],
  "quiz": [
    {
      "question": "string",
      "options": ["string"],
      "correct": "string",
      "explanation": "string"
    }
  ]
}

# Task 1: Text Extraction
CRITICAL: Extract text perfectly from ALL provided images.
- Process each image with equal attention to detail
- Combine content logically when multiple images are provided
- Copy text EXACTLY as written - no modifications whatsoever
- Double-check every word for accuracy
- If unsure about any text, mark it with [unclear] 
- Preserve ALL special characters and diacritical marks
- Keep ALL formatting and structure exactly as in the original

Follow these steps for EACH image:
1. First pass: Extract all text character by character
2. Second pass: Compare against original image
3. Third pass: Verify all special characters and diacritical marks
4. Format using simple markdown:
   - # for headings
   - ** for bold
   - * for italic
   - - for bullet points
   - 1. for numbered lists

When handling multiple images:
- Process each image fully before moving to the next
- Maintain the logical flow of content
- Combine content seamlessly in the final output

# Task 2: Study Material Creation
ONLY after perfect text extraction from ALL images, create:

1. Flashcards (5-7)
- Cover key concepts from all provided content
- Use exact phrases from text
- Make questions clear and specific
- Ensure coverage across all important topics

2. Quiz (5-10 questions)
- Multiple choice format
- Test understanding across all provided content
- Use exact wording from text
- Make distractors plausible but clearly incorrect
- Include questions from all major topics covered

# Quality Checks
Before submitting:
1. Verify text matches ALL images 100%
2. Confirm all special characters are preserved
3. Check formatting is consistent
4. Ensure questions use exact text phrasing
5. Verify all content is included and properly combined
6. Verify all JSON is valid

# Final Notes
- Perfect text extraction is your TOP priority
- Never modify or "improve" the original text
- Use exact quotes in study materials
- When in doubt, be more literal
- Treat single and multiple images with equal attention to detail`
          },
          ...combinedContent
        ]
      }
    ];

    console.log('Sending request to OpenAI...');
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      max_tokens: 4096,
      temperature: 0.7
    });

    // Add error handling for response validation
    if (!response.choices || !response.choices[0] || !response.choices[0].message || !response.choices[0].message.content) {
      throw new Error('Invalid response structure from OpenAI');
    }

    // Extract the message content from the OpenAI response
    const messageContent = response.choices[0].message.content;
    console.log('Raw OpenAI response content:', messageContent);

    let parsedContent;
    try {
      // Extract JSON from the response if it's wrapped in markdown code blocks
      const jsonMatch = messageContent.match(/```json\n([\s\S]*?)\n```/) || messageContent.match(/{[\s\S]*}/);
      if (!jsonMatch) {
        throw new Error('No JSON content found in OpenAI response');
      }

      const jsonString = jsonMatch[1] || jsonMatch[0];
      console.log('Extracted JSON string:', jsonString);
      
      parsedContent = JSON.parse(jsonString);

      // Ensure the response has the required structure
      if (!parsedContent.title || !parsedContent.text_content) {
        throw new Error('Invalid response structure from OpenAI');
      }

      // Ensure text_content has the correct structure
      if (typeof parsedContent.text_content === 'string') {
        parsedContent.text_content = {
          raw_text: parsedContent.text_content,
          sections: [{
            type: 'paragraph',
            content: parsedContent.text_content
          }]
        };
      }

      // Ensure arrays exist and have correct structure
      parsedContent.flashcards = (parsedContent.flashcards || []).map(card => ({
        front: card.front || '',
        back: card.back || ''
      }));

      parsedContent.quiz = (parsedContent.quiz || []).map(q => ({
        question: q.question || '',
        options: Array.isArray(q.options) ? q.options : [],
        correct: q.correct || ''
      }));

      console.log('Final parsed content:', parsedContent);
      res.json(parsedContent);
      
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError);
      console.error('Parse error details:', parseError.message);
      res.status(500).json({ 
        error: 'Failed to parse analysis results',
        details: parseError.message
      });
    }
    
  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({ 
      error: 'Failed to process image',
      details: error.message
    });
  }
});

app.post('/text-to-speech', async (req, res) => {
  try {
    const { text } = req.body;
    
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      process.env.AZURE_SPEECH_KEY, 
      process.env.AZURE_SPEECH_REGION
    );
    
    // Set Finnish language and voice
    speechConfig.speechSynthesisLanguage = "fi-FI";
    speechConfig.speechSynthesisVoiceName = "fi-FI-SelmaNeural";

    const audioConfig = sdk.AudioConfig.fromAudioFileOutput("output.mp3");
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

    synthesizer.speakTextAsync(
      text,
      result => {
        if (result) {
          const audioFile = fs.readFileSync("output.mp3");
          res.writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Content-Length': audioFile.length
          });
          res.end(audioFile);
          synthesizer.close();
        }
      },
      error => {
        console.log(error);
        synthesizer.close();
        res.status(500).send(error);
      });
  } catch (error) {
    res.status(500).send(error);
  }
});

app.get('/ping', (req, res) => {
  res.json({ message: 'Server is running' });
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`For mobile access use: http://<your-local-ip>:${PORT}`);
});
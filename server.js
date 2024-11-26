const express = require('express')
const cors = require('cors')
const OpenAI = require('openai')
require('dotenv').config()

const app = express()
app.use(cors())
app.use(express.json({limit: '50mb'}))

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
    const { image } = req.body;
    
    if (!image) {
      console.error('No image data received');
      return res.status(400).json({ error: 'No image data provided' });
    }

    console.log('Image data length:', image.length);
    console.log('OpenAI API Key present:', !!process.env.OPENAI_API_KEY);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this textbook page in its original language. Please:\n\n1. Extract and clean the text content, maintaining the original language\n2. Create 5-7 flashcards from key concepts in the original language. Format as FRONT: [question] BACK: [answer]\n3. Generate 10 multiple choice questions in the original language. Format as: Q: [question] A) [correct answer] B-D) [plausible wrong answers] CORRECT: [letter]\n\nReturn the response in JSON format: {'text': 'cleaned text content', 'flashcards': [{'front': '...', 'back': '...'}], 'quiz': [{'question': '...', 'options': [...], 'correct': 'A'}]}" },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${image}`,
                detail: "high"
              }
            }
          ]
        }
      ],
      max_tokens: 4096
    });

    console.log('OpenAI Response:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (error) {
    console.error('Detailed error:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status
    });
    res.status(500).json({ 
      error: 'Failed to process image',
      details: error.message,
      stack: error.stack
    });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Lexie server running on http://localhost:${PORT}`);
  console.log(`For mobile access use: http://192.168.1.103:${PORT}`);
});
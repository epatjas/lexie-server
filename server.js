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
            {
              type: "text",
              text: `You are an expert Finnish educator with years of experience in creating educational materials for Finnish students. Your task is to analyze this textbook page and create high-quality study materials in Finnish.

System Instructions:
1. First, carefully analyze the entire content and identify:
   - The subject area and topic
   - The grade/difficulty level
   - Key learning objectives
   - Important concepts and their relationships

2. Then generate the following materials in Finnish, ensuring perfect Finnish grammar and natural language use:

Content Requirements:

A. Title:
   - Create a concise 2-4 word title in Finnish
   - Must accurately reflect the main topic
   - Use grade-appropriate language

B. Text Content:
   - Convert the content into properly formatted markdown
   - Preserve the original text hierarchy and structure
   - Use appropriate markdown syntax:
     * # for main headings
     * ## for subheadings
     * - or * for bullet points
     * 1. for numbered lists
     * > for important quotes or definitions
     * **bold** for key terms
     * *italic* for emphasis
   - Maintain paragraph spacing with blank lines
   - Preserve all special characters and diacritical marks
   - Structure content into logical sections

C. Flashcards:
   Generate 5-7 flashcards where:
   - Front: Create conceptual questions that test understanding
   - Back: Provide clear, concise answers
   - Use proper Finnish educational terminology
   - Ensure natural Finnish sentence structure
   - Include at least one application/example card
   - Avoid direct quotes from the text
   - Focus on core learning objectives

D. Quiz:
   Create 5-10 multiple choice questions where:
   - Questions test comprehension, not memorization
   - Correct answer must be unambiguously correct
   - Distractors must be:
     * Plausible but clearly incorrect
     * Written in proper Finnish
     * Similar in length and style to the correct answer
   - Include at least one application question

Quality Requirements:
- Use perfect Finnish grammar and punctuation
- Maintain consistent pedagogical level throughout
- Ensure all content is culturally appropriate for Finnish education
- Use age-appropriate vocabulary and examples
- Follow Finnish educational standards

Return the response in exactly this JSON format:
{
  'title': 'otsikko',
  'text_content': {
    'raw_text': 'Complete markdown-formatted text content',
    'sections': [
      {
        'type': 'heading',
        'level': 1,
        'content': 'Main heading text'
      },
      {
        'type': 'paragraph',
        'content': 'Paragraph text'
      },
      {
        'type': 'list',
        'style': 'bullet',
        'items': ['item 1', 'item 2']
      },
      {
        'type': 'list',
        'style': 'numbered',
        'items': ['item 1', 'item 2']
      },
      {
        'type': 'quote',
        'content': 'Quote text'
      },
      {
        'type': 'definition',
        'term': 'term',
        'definition': 'definition text'
      }
    ]
  },
  'flashcards': [{'front': 'kysymys', 'back': 'vastaus'}],
  'quiz': [{'question': 'kysymys', 'options': ['A', 'B', 'C', 'D'], 'correct': 'A'}]
}`
            },
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
      max_tokens: 4096,
      temperature: 0.7
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
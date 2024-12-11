const express = require('express')
const cors = require('cors')
const OpenAI = require('openai')
require('dotenv').config()
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

// Define the prompt once at the top level
const systemPrompt = `TASK 1: EXACT TRANSCRIPTION
Provide an exact, word-for-word transcription of all Finnish text content from these textbook pages.

Include EXACTLY as written:
- All main text and paragraphs
- All section headings
- All bullet points
- All numbered lists
- All highlighted boxes/summaries

Do NOT include:
- Page numbers
- Image captions
- Labels within illustrations
- Any text appearing in diagrams/pictures

Maintain:
- Original Finnish spelling and punctuation
- All paragraph breaks
- All formatting (bold, lists, etc.)
- Reading order of the content

TASK 2: STUDY MATERIALS
Using the exact transcribed content, generate:

1. FLASHCARDS (5-10 pairs):
Format:
FRONT: [Key term or concept in Finnish]
BACK: [Definition or explanation in Finnish]

Requirements:
- Focus on essential concepts from the text
- Use clear, simple language
- Keep explanations concise and memorable
- Use only information explicitly stated in the text

2. QUIZ QUESTIONS (5-10):
Format:
Q: [Question in Finnish]
A) [Option]
B) [Option]
C) [Option]
D) [Option]
Correct: [Letter]

Requirements:
- Test comprehension of key concepts
- Use age-appropriate language
- Base all answers directly on the text content
- Ensure all correct answers are clearly supported by the text

Note: All generated content must be based solely on the information provided in the transcribed text, with no external information added.

PROVIDE THE OUTPUT IN THIS JSON FORMAT:
{
  "title": "string",
  "language": "fi",
  "text_content": {
    "raw_text": "markdown formatted text",
    "sections": [
      {
        "type": "heading | paragraph | list | quote",
        "level": 1,
        "content": "string",
        "style": "bullet | numbered",
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
}`;

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
        text: systemPrompt
      },
      ...images.map((image) => ({
        type: "image_url",
        image_url: {
          url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`,
          detail: "high"
        }
      }))
    ];

    // Create the messages array - simplified to avoid duplicate prompt
    const messages = [
      {
        role: "user",
        content: combinedContent  // systemPrompt is already included in combinedContent
      }
    ];

    console.log('Sending request to OpenAI...');
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages,
      max_tokens: 4096 * 2,
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
module.exports = `STUDY MATERIALS GENERATION TASK:

Create study materials from the transcribed text. Use the same language as the source text.

1. QUIZ QUESTIONS (5):
- Create clear questions that:
  • Use exact quotes from the text when possible
  • Test understanding of main points
  • Have clear, unambiguous answers
  • All content must come from the text
  • Questions and answers in same language as text

- Each question must have:
  • One correct answer (direct quote from text)
  • Three incorrect options (also from text)
  • All options must be actual phrases from the text
  • All options should be related to the topic
  • No made-up or modified content
  • No translations to other languages

2. FLASHCARDS (8):
- Front: Clear question about a key concept
- Back: Direct quote from the text as answer
- Keep everything in the source text's language
- Keep language natural and grammatically correct

Return JSON response:
{
  "flashcards": [
    {
      "front": "question in source language",
      "back": "answer from source text"
    }
  ],
  "quiz": [
    {
      "question": "question in source language",
      "options": [
        "correct quote from source text",
        "another quote from source text",
        "another quote from source text",
        "another quote from source text"
      ],
      "correct": "correct quote from source text"
    }
  ]
}

CRITICAL:
- Use only content from the text
- Keep everything in source text's language
- No translations to other languages
- No made-up or modified options
- Keep all options relevant to question
- Use direct quotes for all options
- Make answers unambiguous
- Return valid JSON only`; 
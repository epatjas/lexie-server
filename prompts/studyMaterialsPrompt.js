module.exports = `STUDY MATERIALS GENERATION TASK:

Create study materials directly from the text content. Use the original language of the text.

1. QUIZ QUESTIONS (5):
Create clear questions that test understanding of main concepts:

QUESTION TYPES:
• Definition questions (e.g., "Mitä tarkoittaa...")
• Example questions (e.g., "Missä...")
• Understanding questions (e.g., "Miksi...")
• Process questions (e.g., "Miten...")

ANSWER OPTIONS REQUIREMENTS:
• Correct answer:
  - Must be based on information directly from the text
  - Must be grammatically correct and complete
  - Must clearly and accurately answer the question
  - Can combine or adapt text content for grammar

• Incorrect options must be:
  - About the same concept or topic
  - Same level of detail as correct answer
  - Grammatically match the question format
  - Plausible but clearly incorrect
  - Written in the same style as the correct answer

ANSWER OPTIONS QUALITY:
• All options should:
  - Be complete, grammatical sentences
  - Be similar in length and style
  - Use terminology from the text
  - Follow proper grammar rules
  - Make logical sense
  - Flow naturally with the question

AVOID IN OPTIONS:
• Grammatically awkward adaptations
• Unnatural combinations of text
• Content from unrelated topics
• Obviously wrong statements
• Answers that contradict facts
• Word-for-word quotes that don't fit grammatically

2. FLASHCARDS (5):
Different from quiz questions - focus on recall and key terms:

FRONT SIDE:
• Key term or concept from text
• Fill-in-the-blank statement
• Complete the definition
• Identify the purpose
• State the function

BACK SIDE:
• Brief, direct quote containing the answer
• Key definition from text
• Main function or purpose
• Essential characteristic
• No more than 2-3 sentences

Return JSON response:
{
  "flashcards": [
    {
      "front": "Key term or fill-in-blank",
      "back": "Short, precise quote with answer"
    }
  ],
  "quiz": [
    {
      "question": "Clear concept question",
      "options": [
        "Complete, grammatically correct answer",
        "Plausible but incorrect option",
        "Another related but incorrect option",
        "Similar but incorrect option"
      ],
      "correct": "Complete, grammatically correct answer"
    }
  ]
}

CRITICAL RULES:
- Use the original language of the text
- Ensure grammatical correctness
- All content must exist in the text
- Keep original context intact
- Maintain factual accuracy
- Return valid JSON only

QUALITY CHECKLIST:
✓ Quiz tests understanding
✓ Flashcards focus on recall
✓ All options are grammatically correct
✓ Options are logical
✓ Content is relevant`; 
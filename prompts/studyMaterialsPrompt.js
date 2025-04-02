module.exports = {
  // Complete prompt for single call approach
  fullPrompt: `# Study materials generation

## HIGHEST PRIORITY INSTRUCTIONS
1. **MATCH THE CONTENT'S ORIGINAL LANGUAGE** - If the content is in English, ALL output MUST be in English
2. **DO NOT translate content to Finnish** - Only use Finnish if the original content is in Finnish
3. **Create high-quality content** - Focus on quality over quantity
4. **ALWAYS generate all required sections** - Every response MUST include summary, flashcards, and quiz questions
5. **Format summary with markdown** - Use proper markdown for readability
6. **No pronunciation guides** - Never include pronunciation information
7. **Conversational introduction** - Write in the SAME LANGUAGE as the source material
8. **Correct flashcard type by content** - Use concept-explanation cards for subject content, translation cards ONLY for language learning
9. **Use sentence case only** - Only capitalize the first letter of sentences and titles, not every word

## LANGUAGE MATCHING - ABSOLUTELY CRITICAL
- RULE: ALWAYS generate content in the EXACT SAME LANGUAGE as the source material
- If source content is in ENGLISH → generate ALL output in ENGLISH
- If source content is in FINNISH → generate ALL output in FINNISH
- If source is mixed (language learning) → use the primary language for explanations
- NEVER default to Finnish unless the source material is primarily Finnish
- EXAMPLES:
  - English textbook → English summary, English flashcards, English quiz
  - Finnish article → Finnish summary, Finnish flashcards, Finnish quiz
  - English-Finnish vocabulary list → explanations in the primary language (probably Finnish)

## Content type classification
- First, determine if content is:
  - A) Language learning/vocabulary (content showing multiple languages, vocabulary lists, etc.)
  - B) Subject content (science, math, literature, history, etc. in a single language)
- For subject content in a single language:
  - Never create translation flashcards
  - Create concept-explanation flashcards (term → definition)
  - Do not translate terms to other languages
- For language learning/vocabulary content only:
  - Create direct translation flashcards
  - Preserve the actual language pairs from the content

## Content detection
Quickly analyze if the content contains:
- Language learning vocabulary or phrases
- Mathematics concepts or problems
- Science information
- Literature or reading passages
- Social studies or humanities content

## Capitalization rule
- Use sentence case for all text (not title case)
- Only capitalize:
  - The first word of a sentence
  - The first word of a title or heading
  - Proper nouns (names of languages, countries, etc.)
- Do not capitalize every word in titles, headings, or list items

## Summary requirements - CRITICAL, ALWAYS INCLUDE
- MUST BE IN THE SAME LANGUAGE AS THE SOURCE MATERIAL
- Scale the summary length based on content type and length:
  - Vocabulary content: Brief 100-150 word summary of the vocabulary theme/topic
  - Short subject content (<500 words): 100-200 word summary
  - Medium subject content (500-2000 words): 200-350 word summary
  - Long subject content (multiple chapters/sections): 350-600 word summary
- Use proper markdown formatting:
  - ## Headings for main sections
  - ### Subheadings for subtopics
  - **Bold** for important terms
  - *Italics* for emphasis
- Bullet lists for related items
- Numbered lists for sequences
- THE SUMMARY MUST ALWAYS BE GENERATED, NEVER SKIP THIS SECTION

## Flashcard requirements - CRITICAL COUNT REQUIREMENTS
- MUST BE IN THE SAME LANGUAGE AS THE SOURCE MATERIAL
- For VOCABULARY content:
  - Create one flashcard PER VOCABULARY TERM (one-to-one mapping)
  - If there are many terms (>30), prioritize the most important/common ones
  - Maximum 30 vocabulary flashcards
  - Front = term, Back = only the direct translation
  - Do not include definitions, explanations, or descriptions
  
- For SUBJECT content (regardless of length):
  - Create EXACTLY 15 high-quality flashcards focused on key concepts
  - If content is very short or limited, create at minimum 10 flashcards
  - Front: key term or concept
  - Back: explanation or definition
  - Flashcards should help understand the concept, not just translate it

- Each flashcard should:
  - Cover a single, clear concept
  - Be concise and direct

## Quiz requirements - CRITICAL COUNT REQUIREMENTS
* MUST BE IN THE SAME LANGUAGE AS THE SOURCE MATERIAL
* For VOCABULARY content:
  * Create 10 quiz questions testing vocabulary knowledge
  * Questions should test both recognition and recall of terms

* For SUBJECT content (regardless of length):
  * Create EXACTLY 10 multiple-choice questions
  * If content is very limited, create minimum 5 questions

* Each question must have:
    * One clear question
    * Exactly 4 answer options
    * Only one correct answer
    * Difficulty level (easy/medium/hard in the content's language)

* Question distribution by difficulty:
    * 40% easy questions
    * 40% medium questions 
    * 20% hard questions

* For subject content (science, history, etc.):
    * Focus on testing understanding, not just facts
    * Include this mix of question types:
        * 30% Recall questions (what, when, who)
        * 40% Understanding questions (how, why, what if)
        * 30% Analysis questions (compare, predict, apply)

* For language learning/vocabulary content:
    * Distribution:
        * 40% direct translation questions (both directions)
        * 40% context/usage questions
        * 20% grammar/form questions

* Question quality requirements:
    * No repetitive questions
    * All distractors (wrong options) must be plausible
    * Include brief explanation for correct answer
    * Questions should cover different aspects of the material
    * Avoid yes/no questions
    * Use clear, unambiguous language

## Introduction style
- Always use this exact two-sentence structure IN THE LANGUAGE OF THE SOURCE MATERIAL:
  1. First sentence acknowledges receiving the text
  2. Second sentence describes what the exercises will help with

Examples:
- For English content: "I've analyzed the text you provided. These exercises will help you learn more about [subject]."
- For Finnish content: "Kävin läpi antamasi tekstin. Näiden harjoitusten avulla voit oppia lisää [aiheesta]."
- For English language learning content: "I've analyzed the text you provided. These exercises will help you practice these words."
- For Finnish language learning content: "Kävin läpi antamasi tekstin. Näiden harjoitusten avulla voit harjoitella näitä sanoja."

NEVER mix languages in the introduction.

## Response format - CRITICAL STRUCTURE REQUIREMENTS
{
  "title": "Title derived from original content",
  "subject_area": "LANGUAGE_LEARNING|MATHEMATICS|SCIENCE|READING_LITERATURE|ARTS_HUMANITIES",
  "introduction": "Introduction IN THE SAME LANGUAGE as source content",
  
  "text_content": {
    "raw_text": "Original content, formatted as vocabulary tables when appropriate"
  },
  
  "summary": "Summary IN THE SAME LANGUAGE as source content with proper markdown formatting",
  
  "flashcards": [
    {
      "front": "Term or concept IN THE SAME LANGUAGE as source content",
      "back": "Explanation/definition IN THE SAME LANGUAGE as source content (except for direct translations in language learning)"
    }
    // For vocabulary: one flashcard per term (up to 30 max)
    // For subject content: exactly 15 flashcards (or minimum 10 if content is limited)
  ],
  
  "quiz": [
    {
      "question": "Question IN THE SAME LANGUAGE as source content",
      "options": ["Option1", "Option2", "Option3", "Option4"],
      "correct": "Correct option",
      "explanation": "Explanation why this is correct"
    }
    // For vocabulary: 10 quiz questions
    // For subject content: exactly 10 quiz questions (or minimum 5 if content is limited)
  ]
}

## Quality checklist - VERIFY BEFORE COMPLETING
1. ⚠️ LANGUAGE CHECK: ALL TEXT IS IN THE SAME LANGUAGE AS THE SOURCE MATERIAL ⚠️
   - English content → English output
   - Finnish content → Finnish output
2. Summary is included with proper markdown (MUST HAVE)
3. Appropriate number of flashcards based on content TYPE:
   - Vocabulary: One flashcard per term (up to 30)
   - Subject content: 15 flashcards (or minimum 10 if content is limited)
4. Appropriate number of quiz questions:
   - Vocabulary: 10 questions
   - Subject content: 10 questions (or minimum 5 if content is limited)
5. Content is correctly classified (subject content vs. language learning)
6. For subject content: flashcards are concept-explanation pairs, not translations
7. Quiz questions match the content type
8. No pronunciation guides anywhere
9. Introduction is conversational and in the SAME LANGUAGE as the content
10. Proper sentence case used throughout (not title case)
11. JSON format is valid and complete
12. No language introduced that wasn't in the original content`,
  
  // Component-specific sections for multi-call approach
  components: {
    basicInfo: `# Basic Information Generation
      // ... instructions for title, introduction, summary ...
    `,
    
    flashcards: `# Flashcard Generation
      // ... instructions for flashcards ...
    `,
    
    quiz: `# Quiz Question Generation
      // ... instructions for quiz questions ...
    `
  },
  
  // Core principles that apply to all components
  corePrinciples: `# Core Principles
    1. **Match the content's original language**
    2. **Content quality over quantity**
    3. **Proper markdown formatting**
    // ... etc ...
  `
}; 
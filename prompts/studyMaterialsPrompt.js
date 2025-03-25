module.exports = `# STUDY MATERIALS GENERATION

## HIGHEST PRIORITY INSTRUCTIONS
1. DETECT CONTENT TYPE FIRST - Vocabulary list vs. Regular content
2. PRESERVE ORIGINAL LANGUAGES - Never translate to English
3. Use appropriate format based on content type

## CONTENT TYPE DETECTION
FIRST, identify if the content is:
1. VOCABULARY LIST: Content focused on word pairs between languages
   - Word translations (e.g., French-Finnish, English-Spanish)
   - Language learning vocabulary sections
   - Pronunciation guides
   
2. REGULAR CONTENT: Standard educational material
   - Textbook chapters
   - Concept explanations
   - Historical or scientific content

## VOCABULARY CONTENT HANDLING
If content is a VOCABULARY LIST:
1. Identify source and target languages (e.g., French → Finnish)
2. Create vocabulary tables with this EXACT format:
| Français | Suomi |
|:---------|:------|
| **lundi** | maanantai |
| **mardi** | tiistai |

VOCABULARY TABLE RULES:
- Use actual language names in table headers (e.g., "Français | Suomi", "English | Español")
- Source language words in **bold**
- Equal column widths (50%/50%)
- Keep original language order (left = source, right = target)
- Group related terms together (days, numbers, etc.)
- Include ALL vocabulary from original content
- Preserve exact spelling and accents
- Add pronunciation guide in separate section if present
- Use native language names for headers (not English translations)

## REGULAR CONTENT HANDLING
If content is NOT vocabulary, create engaging summary that:
- Captures key concepts and relationships
- Uses clear, conversational language
- Adapts to content length and complexity
- Makes complex ideas digestible
- Helps students see the bigger picture

## FLASHCARDS AND QUIZ REQUIREMENTS
FOR VOCABULARY CONTENT:
- Create AT LEAST 20 flashcards:
  * Direct translations (at least 15)
  * Usage in example sentences (at least 5)
  * Include ALL vocabulary terms from the content
  * Mix different types of terms (nouns, verbs, phrases)
  * Group related terms together (days, numbers, etc.)

- Create AT LEAST 12 multiple-choice questions:
  * Direct translations (4-5 questions)
    Example: "Mikä on 'lundi' suomeksi?"
    Options: ["maanantai", "tiistai", "keskiviikko", "torstai"]
  * Word usage (4-5 questions)
    Example: "Mikä päivä tulee 'mardi' jälkeen?"
    Options: ["mercredi", "jeudi", "vendredi", "lundi"]
  * Complete the sentence (3-4 questions)
    Example: "Mikä sana puuttuu: '_____ est le premier jour'?"
    Options: ["Lundi", "Mardi", "Mercredi", "Jeudi"]
  * Questions ALWAYS in target language (Finnish for French learners)
  * Options can mix languages based on question type
  * Include related terms as distractors (e.g., other days of week)
  * Each question must have EXACTLY 4 options

FOR REGULAR CONTENT:
- Create 10-15 flashcards covering key concepts
- Create 10-12 multiple-choice questions testing understanding
- Focus on relationships and applications
- Match original content language
- Each question must have EXACTLY 4 options

## CRITICAL RESPONSE FORMAT
{
  "title": "Use original title from content",
  "content_type": "vocabulary_list" or "regular_content",
  "languages": {
    "source": "language name",
    "target": "language name"
  },
  "introduction": "Brief context in target language",
  "summary": "Vocabulary table for vocabulary content OR summary for regular content",
  "flashcards": [
    {
      "front": "term or concept",
      "back": "translation or explanation",
      "type": "translation" or "usage"
    }
  ],
  "quiz": [
    {
      "question": "question text",
      "options": ["option1", "option2", "option3", "option4"],
      "correct": "correct option",
      "explanation": "why this is correct",
      "type": "translation" or "usage" or "sentence"
    }
  ]
}

## STRICT MARKDOWN RULES
- Use proper table formatting with column alignment (:|-)
- Bold source language terms with **double asterisks**
- Use "## " for headings (space after ##)
- Use "### " for subheadings (space after ###)
- Blank lines between sections
- Proper indentation for nested content

## FINAL QUALITY CHECK
1. Content type correctly identified
2. Original languages preserved
3. Vocabulary tables properly formatted
4. All terms included
5. Proper markdown syntax
6. Response is valid JSON only`; 
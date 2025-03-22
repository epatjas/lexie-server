module.exports = `TRANSCRIPTION TASK:

IMPORTANT: RESPOND ONLY WITH VALID JSON. 

You are a precise OCR system. Your task is to transcribe text exactly as it appears, preserving formatting:

SECTION IDENTIFICATION AND FORMATTING:
1. Main title: 
   - The primary topic of the text
   - Should be level 1
2. Section Headers:
   - Main sections (e.g., "Vocabulary:", "Dialogue:", "Tärkeää:") should be level 2
   - Subsections should be level 3
   - Always include level number
3. Lists:
   - Numbered lists: preserve numbers (1., 2., etc.)
   - Bulleted lists: preserve bullet points (•, -, *)
   - Sub-items (a, b, c)
   - Preserve original formatting
4. Language Learning Content:
   - Key vocabulary: wrap words in **word**
   - Speaker names in dialogues: wrap in **Name**
   - Grammar examples: preserve emphasis
5. Paragraphs:
   - Each paragraph as separate section
   - Preserve text emphasis:
     * Bold text: wrap in **text**
     * Italic text: wrap in *text*
     * Important terms: preserve emphasis

REQUIRED JSON STRUCTURE:
{
  "title": "exact main topic",
  "text_content": {
    "raw_text": "clean text with formatting marks",
    "sections": [
      {
        "type": "heading",
        "level": number,
        "raw_text": "header text with **bold** or *italic*"
      },
      {
        "type": "paragraph",
        "raw_text": "text with **bold** or *italic* formatting"
      },
      {
        "type": "list",
        "style": "numbered" | "bullet" | "sub-items",
        "items": [
          "1. First item",
          "2. Second item",
          "• First bullet",
          "• Second bullet",
          "a) First sub-item",
          "b) Second sub-item"
        ]
      }
    ]
  }
}

CRITICAL RULES:
- Main title should be level 1
- Section headers should be level 2
- Subsection headers should be level 3
- Never skip headers
- Always bold key vocabulary words
- Always bold speaker names in dialogues
- Preserve formatting`; 
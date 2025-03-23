module.exports = `Analyze the transcribed educational content and determine if it's textbook material or a problem/assignment. Return ONLY a JSON response.

## Content Type Definitions

TEXTBOOK_MATERIAL:
* Contains multiple concepts or comprehensive topic coverage
* Has structured organization with explanatory headings and sections
* Primarily consists of explanatory content teaching concepts
* Contains multiple definition patterns: "X is defined as", "X refers to"
* Offers theoretical background before any examples
* Uses mostly declarative sentences explaining concepts
* Contains minimal or no questions requiring the reader to solve

PROBLEM_ASSIGNMENT:
* Contains specific tasks that require solutions or answers
* Has blank spaces, underscores, or boxes for writing answers
* Uses imperative language: "solve", "find", "calculate", "determine"
* Contains question marks or numbered problems
* Contains specific values to use in calculations
* Includes phrases like "exercise", "problem", "assignment", "solve", "calculate"
* Often contains fill-in-the-blank sections or answer spaces

## High-Priority Assignment Indicators

These indicators STRONGLY suggest PROBLEM_ASSIGNMENT classification:
* Empty spaces or lines for answers (like "V: ___ henkilöä")
* Instructions to calculate, determine, or find values
* Multiple blanks or spaces for filling in answers
* Questions asking "how many" or "what is"
* Tables or sections where answers should be written
* Multiple calculation-based questions organized in sequence
* Instructions in second-person ("you need to find...")
* Fill-in-the-blank sections, especially with underscores

## High-Priority Textbook Indicators

These indicators STRONGLY suggest TEXTBOOK_MATERIAL classification:
* Multiple pages of explanatory text without questions
* Clear chapter/section structure with headings and subheadings
* Historical development of concepts without requesting solutions
* Multiple interconnected concepts explained in sequence
* Learning objectives or curriculum standards listed
* Review sections summarizing previously explained content

## Language-Specific Considerations

Finnish/Swedish assignments often:
* Contain words like "laske", "määritä", "kuinka monta", "tehtävä", "lasku"
* Have answer spaces marked with lines or "V: ___" format
* Use imperative verbs at the beginning of sentences

## Decision Algorithm

1. First, check for high-priority assignment indicators:
   * If content has blank spaces for answers → PROBLEM_ASSIGNMENT
   * If content directly asks to calculate values → PROBLEM_ASSIGNMENT
   * If content contains sections with "V:", "Answer:", etc. → PROBLEM_ASSIGNMENT

2. If no clear high-priority indicators, check content ratio:
   * If >70% of content consists of questions/problems → PROBLEM_ASSIGNMENT
   * If >70% of content consists of explanations → TEXTBOOK_MATERIAL

3. For mixed content:
   * If explanations are followed by specific tasks → PROBLEM_ASSIGNMENT
   * If examples are provided to illustrate concepts without requiring answers → TEXTBOOK_MATERIAL

JSON Response Format:
{
  "classification": "TEXTBOOK_MATERIAL | PROBLEM_ASSIGNMENT",
  "confidence": "HIGH | MEDIUM | LOW",
  "primary_indicators": ["List the 2-3 most decisive patterns found in the content"],
  "processing_approach": "Textbook Content Processing | Problem Assistance"
}

Critical Rules:
* The presence of ANY answer lines (like "V: ___") ALWAYS indicates PROBLEM_ASSIGNMENT
* Content with calculations to perform is almost always PROBLEM_ASSIGNMENT
* Brief explanations followed by questions is PROBLEM_ASSIGNMENT
* When truly uncertain, default to PROBLEM_ASSIGNMENT
* Finnish math assignments often have the format "XXX V: ___ henkilöä" - ALWAYS classify these as PROBLEM_ASSIGNMENT
* Return ONLY valid JSON with no additional text or explanations`; 
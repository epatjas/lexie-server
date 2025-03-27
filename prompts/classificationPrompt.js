module.exports = `CONTENT CLASSIFICATION TASK:

You are analyzing educational content and must determine if it's:

1. PROBLEM_ASSIGNMENT: Content primarily focused on problems for a student to solve
2. TEXTBOOK_MATERIAL: Content primarily focused on teaching concepts, which may include some exercises

CRITICAL DISTINCTION:
- Focus on the PRIMARY PURPOSE of the content, not individual elements
- Textbooks often include exercise sections but are still TEXTBOOK_MATERIAL
- A section called "Tehtävät" or "Exercises" at the end of a chapter does NOT make the entire content a PROBLEM_ASSIGNMENT

PROBLEM_ASSIGNMENT characteristics (MUST HAVE MAJORITY of these):
- The MAJORITY of the content consists of problems to solve
- The content begins directly with questions or problems
- Each section primarily asks the student to calculate, solve, or determine something
- The content has minimal explanatory text compared to exercise content
- The content is structured as a worksheet or assignment rather than teaching material
- The content appears to be specifically created as homework or classwork

TEXTBOOK_MATERIAL characteristics (classify this way if MAJORITY applies):
- The content primarily explains concepts, theories, or information
- Explanatory content makes up most of the document
- Any exercises appear at the end of sections or chapters
- Content includes definitions, examples, and detailed explanations
- Content has a structured flow of information building on previous concepts
- If exercises exist, they serve to reinforce the material just taught

## SUBJECT AREA RECOGNITION
Determine which primary subject area the content belongs to:

1. **LANGUAGE LEARNING** - Content showing these elements:
   - Vocabulary lists or translations
   - Grammar rules or patterns
   - Practice dialogues or texts
   - Language acquisition exercises
   - Pronunciation guides

2. **MATHEMATICS** - Content showing these elements:
   - Formulas and equations
   - Problem examples
   - Step-by-step solutions
   - Visual representations
   - Numerical operations

3. **SCIENCE** - Content showing these elements:
   - Concepts and definitions
   - Processes and relationships
   - Experimental methods
   - Diagrams and classifications
   - Natural or physical phenomena

4. **READING & LITERATURE** - Content showing these elements:
   - Stories or passages
   - Literary elements
   - Comprehension questions
   - Character/plot analysis
   - Text interpretation

5. **ARTS & HUMANITIES** - Content showing these elements:
   - Historical events/timelines
   - Cultural concepts
   - Interpretative frameworks
   - Creative techniques
   - Social studies content

EXAMPLES of TEXTBOOK_MATERIAL with exercises:
- A biology chapter explaining cell structure with a few questions at the end
- A language textbook with vocabulary lists and practice exercises
- A history text describing events with reflection questions afterward
- A physics textbook explaining concepts with example problems and exercises
- A math textbook with theory followed by practice problems

EXAMPLES of PROBLEM_ASSIGNMENT:
- A worksheet with 10 math problems to solve
- A sheet with language translation exercises with minimal instruction
- A take-home lab assignment with specific questions to answer
- A problem set asking students to apply previously learned concepts

SPECIAL CASE FOR VOCABULARY LISTS:
- Content focused on vocabulary pairs (e.g., French-Finnish word lists) should be classified as TEXTBOOK_MATERIAL
- Language exercises with vocabulary tables are typically TEXTBOOK_MATERIAL

Your response must be EXACTLY this JSON structure with NO additional text:
{
  "classification": "PROBLEM_ASSIGNMENT",
  "confidence": "HIGH",
  "subject_area": "LANGUAGE_LEARNING|MATHEMATICS|SCIENCE|READING_LITERATURE|ARTS_HUMANITIES",
  "language": "English",
  "processing_approach": "Problem Assistance"
}

IMPORTANT:
1. Use ONLY the exact values specified above
2. NO additional text before or after the JSON
3. NO markdown formatting or backticks
4. ALL strings must use double quotes (")`; 
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

## SUBJECT AREA RECOGNITION - CRITICAL DISTINCTIONS
Determine which primary subject area the content belongs to:

1. **LANGUAGE_LEARNING** - ONLY classify content as LANGUAGE_LEARNING if ALL of these are true:
   - The PRIMARY PURPOSE is explicitly teaching a foreign language to Finnish students
   - Content MUST contain explicit language teaching elements like vocabulary lists with translations
   - Examples include English textbooks for Finnish students, Swedish vocabulary lists, etc.
   
   DO NOT classify content as LANGUAGE_LEARNING if:
   - Content is in Finnish discussing any academic subject (even if it contains some foreign terms)
   - Content is about a topic like "participation in school" but happens to be in Finnish
   - Content mentions foreign words but doesn't focus on teaching a language

2. **MATHEMATICS** - Content showing these elements:
   - Formulas and equations
   - Problem examples
   - Step-by-step solutions
   - Visual representations
   - Numerical operations

3. **SCIENCE** - Content showing these elements:
   - Scientific concepts and definitions
   - Processes and relationships
   - Experimental methods
   - Diagrams and classifications
   - Natural or physical phenomena

4. **READING & LITERATURE** - Content showing literary analysis and reading comprehension in the student's native language:
   - Analysis of stories, poems, or passages
   - Literary elements and techniques
   - Comprehension questions about themes and meanings
   - Character/plot analysis
   - Text interpretation and critical reading
   - NOTE: Content primarily teaching a foreign language through stories is LANGUAGE_LEARNING, not READING_LITERATURE

5. **ARTS & HUMANITIES** - Content focused on:
   - Social studies, citizenship, or civic participation
   - Historical events and cultural topics
   - Ethics, philosophy, or values
   - Geography, social institutions or human societies
   - NOTE: Content in Finnish about these topics is NOT language learning

IMPORTANT DISTINCTION FOR FINNISH STUDENTS:
- If content is teaching English, Swedish, or any other foreign language to Finnish students, classify as LANGUAGE_LEARNING
- If content contains foreign language elements but its primary purpose is teaching another subject (e.g., geography terms in English), classify according to the primary subject (e.g., ARTS & HUMANITIES)

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
  "classification": "PROBLEM_ASSIGNMENT|TEXTBOOK_MATERIAL",
  "confidence": "HIGH|MEDIUM|LOW",
  "subject_area": "LANGUAGE_LEARNING|MATHEMATICS|SCIENCE|READING_LITERATURE|ARTS_HUMANITIES",
  "language": "English|Finnish|Swedish|etc.",
  "processing_approach": "Problem Assistance|Comprehensive Learning"
}

IMPORTANT:
1. Use ONLY the exact values specified above
2. NO additional text before or after the JSON
3. NO markdown formatting or backticks
4. ALL strings must use double quotes (")`; 
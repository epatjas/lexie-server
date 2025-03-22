module.exports = `Analyze the transcribed educational content and classify it into one of two categories. Return ONLY a JSON response with classification and reasoning. 

Content Types 
Textbook Material (Exam Prep)
* Educational text explaining multiple concepts
* Comprehensive coverage of a topic
* Multiple paragraphs or sections
* Definitions, explanations, and examples
* May include diagrams or illustrations with explanatory captions
* Content you would typically find in a textbook or study guide
* Content intended for learning and reviewing concepts 

Problem/Assignment (Homework Assistance)
* Specific task requiring solution
* Contains a clear question or objective
* Often includes numerical values, variables, or specific scenarios
* May have blank spaces for answers
* Typically shorter and more focused than textbook material
* May include multiple-choice options
* Example problems with or without solutions
* Single concept explanations or worked examples
* Practice exercises or questions 

Decision Factors
* Content length (longer suggests textbook material)
* Presence of question marks or directives (suggests homework assistance)
* Keywords like "solve," "find," "calculate," "explain" (suggests homework assistance)
* Numbered questions or blank answer spaces (suggests homework assistance)
* Multiple headings or sections (suggests textbook material)
* Practice problems (suggests homework assistance even if including explanation)
* Language used (instructional vs. questioning) 

JSON Response Format
{
  "classification": "TEXTBOOK_MATERIAL | PROBLEM_ASSIGNMENT",
  "confidence": "HIGH | MEDIUM | LOW",
  "reasoning": "Brief explanation of classification decision based on specific content features",
  "subject_area": "Math | Science | Language | History | Other",
  "language": "Finnish | English | Other",
  "processing_approach": "Textbook Content Processing | Problem Assistance"
} 

Critical Rules
* Analyze ONLY the content provided
* Default to Problem Assistance when uncertain
* Be decisive - choose the SINGLE most appropriate classification
* For TEXTBOOK_MATERIAL, set processing_approach to "Textbook Content Processing"
* For PROBLEM_ASSIGNMENT, set processing_approach to "Problem Assistance"
* If content contains both explanatory material AND problems, classify based on the primary purpose
* Examples and single concept explanations should be classified as PROBLEM_ASSIGNMENT
* Return ONLY valid JSON - no additional explanations`; 
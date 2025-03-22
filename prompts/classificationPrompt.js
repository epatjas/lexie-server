module.exports = `Analyze the transcribed educational content and determine if it's textbook material or a problem/assignment. Return ONLY a JSON response.

## Content Type Definitions

TEXTBOOK_MATERIAL:
* Contains multiple concepts or comprehensive topic coverage
* Has structured organization (headings, sections, paragraphs)
* Primarily uses declarative statements explaining how things work
* Contains definition patterns: "X is defined as", "X refers to", "X means"
* Contains multiple examples illustrating different aspects of a concept
* Mostly uses third-person perspective
* Often contains phrases like "in this chapter", "we will explore", "key concepts include"

PROBLEM_ASSIGNMENT:
* Contains specific tasks or questions requiring solutions
* Uses imperative language: "solve", "find", "calculate", "determine"
* Often includes question marks, blank spaces, or numbered questions
* Typically contains specific values, variables, or scenarios to analyze
* May include phrases like "problem set", "homework", "exercises", "assignment"
* Often uses second-person perspective ("you") or first-person questions ("I need to find")
* May include worked examples focusing on a solution process

## Decisive Indicators (Prioritized)

1. PROBLEM indicators (highest priority):
   * Direct questions ("What is", "How many", "Find x")
   * Numbered problems or exercises
   * Fill-in-the-blank sections
   * Step-by-step solution guides
   * Phrases like "solve for", "calculate the", "your task is"
   * Multiple practice questions on the same topic

2. TEXTBOOK indicators:
   * Multiple definition statements
   * Overview sections followed by detailed explanations
   * Historical context or background information
   * Multiple interconnected concepts explained
   * Summary sections or review points
   * Theoretical explanations without specific problems to solve

## Mixed Content Rules

* If content contains both explanations and problems:
  * Check if problems are illustrative examples (supports TEXTBOOK) or the main focus (supports PROBLEM)
  * Determine if explanations provide background for a specific task (PROBLEM) or are comprehensive (TEXTBOOK)
  * Count the ratio of explanatory text to problem statements

JSON Response Format:
{
  "classification": "TEXTBOOK_MATERIAL | PROBLEM_ASSIGNMENT",
  "confidence": "HIGH | MEDIUM | LOW",
  "primary_indicators": ["List the 2-3 most decisive patterns found in the content"],
  "processing_approach": "Textbook Content Processing | Problem Assistance"
}

Critical Rules:
* Focus ONLY on content type, not subject matter
* When truly uncertain, default to PROBLEM_ASSIGNMENT
* Examples alone are not sufficient to classify as TEXTBOOK_MATERIAL
* Content with multiple paragraphs of explanation before presenting 1-2 problems should be TEXTBOOK_MATERIAL
* Content with brief explanation followed by multiple problems should be PROBLEM_ASSIGNMENT
* Return ONLY valid JSON with no additional text or explanations`; 
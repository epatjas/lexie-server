module.exports = `STUDY MATERIALS GENERATION TASK:

# CRITICAL: YOU MUST RETURN VALID JSON WITH THE FOLLOWING STRUCTURE:
{
  "introduction": "Brief introduction text",
  "summary": "Detailed summary",
  "flashcards": [
    { "front": "Question", "back": "Answer" },
    // At least 5 flashcards required
  ],
  "quiz": [
    {
      "question": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct": "Option A",
      "explanation": "Why this answer is correct"
    }
    // At least 5 quiz questions required
  ]
}

# Instructions:
You are an experienced teacher creating educational materials. Analyze the provided content and create:
- An introduction (1-2 sentences welcoming the student)
- A detailed summary of the main concepts (250-500 words)
- At least 5 flashcards with clear front/back content
- At least 5 quiz questions with 4 options each

Your response must be valid JSON matching the format above, with NO additional text or explanations outside the JSON.`; 
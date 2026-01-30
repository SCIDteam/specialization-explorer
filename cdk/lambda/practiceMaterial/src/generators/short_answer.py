from typing import Any, Dict

def build_short_answer_prompt(
    topic: str,
    difficulty: str,
    num_questions: int,
    snippets: list[str]
) -> str:
    """
    Build optimized short answer prompt with 60-70% fewer tokens than original.
    Uses concise example-based approach instead of verbose instructions.
    """
    # Limit context to 300 chars per snippet, max 4 snippets for token efficiency
    optimized_snippets = []
    for snippet in snippets[:4]:
        if len(snippet) > 300:
            snippet = snippet[:300].rsplit(' ', 1)[0] + "..."
        optimized_snippets.append(snippet)
    
    context_str = "\n\n".join(f"[Chunk {i+1}]\n{s}" for i, s in enumerate(optimized_snippets))
    
    # Concise prompt with single clear example
    return f"""Generate {num_questions} short answer questions as valid JSON only.

Topic: "{topic}" | Difficulty: {difficulty}

Context:
{context_str}

Required JSON format:
{{
  "title": "Short Answer: {topic}",
  "questions": [
    {{
      "id": "q1",
      "questionText": "Clear question requiring detailed explanation",
      "context": "Optional background (empty string if not needed)",
      "sampleAnswer": "Comprehensive 100-150 word answer with accurate details from textbook",
      "keyPoints": ["Key concept 1", "Key concept 2", "Key concept 3"],
      "rubric": "Grading criteria for complete answer",
      "expectedLength": 100
    }}
  ]
}}

Requirements:
- Exactly {num_questions} questions
- Open-ended questions requiring explanation/analysis
- Sample answers: 100-150 words based on context
- Key points: 3-5 essential concepts
- Valid JSON syntax (proper commas, no trailing commas)
- No markdown, no extra text

Output valid JSON now:"""


def validate_short_answer_shape(obj: Dict[str, Any], num_questions: int) -> Dict[str, Any]:
    """
    Validate the shape of a short answer JSON object.
    """
    if not isinstance(obj, dict):
        raise ValueError("Invalid root JSON")
    if not isinstance(obj.get("title"), str) or not obj["title"].strip():
        raise ValueError("Invalid title")
    
    questions = obj.get("questions")
    if not isinstance(questions, list) or len(questions) != num_questions:
        raise ValueError(f"questions must have exactly {num_questions} items")
    
    for idx, q in enumerate(questions):
        if not isinstance(q, dict):
            raise ValueError(f"Question[{idx}] invalid")
        
        # Validate id
        if not isinstance(q.get("id"), str) or not q["id"].strip():
            raise ValueError(f"Question[{idx}].id invalid")
        
        # Validate questionText
        if not isinstance(q.get("questionText"), str) or not q["questionText"].strip():
            raise ValueError(f"Question[{idx}].questionText invalid")
        
        # Validate context (optional, can be empty string)
        if not isinstance(q.get("context"), str):
            raise ValueError(f"Question[{idx}].context must be a string (can be empty)")
        
        # Validate sampleAnswer
        if not isinstance(q.get("sampleAnswer"), str) or not q["sampleAnswer"].strip():
            raise ValueError(f"Question[{idx}].sampleAnswer invalid")
        
        # Validate keyPoints (array of strings)
        key_points = q.get("keyPoints")
        if not isinstance(key_points, list) or len(key_points) < 3:
            raise ValueError(f"Question[{idx}].keyPoints must be an array with at least 3 items")
        for kp_idx, kp in enumerate(key_points):
            if not isinstance(kp, str) or not kp.strip():
                raise ValueError(f"Question[{idx}].keyPoints[{kp_idx}] must be a non-empty string")
        
        # Validate rubric
        if not isinstance(q.get("rubric"), str) or not q["rubric"].strip():
            raise ValueError(f"Question[{idx}].rubric invalid")
        
        # Validate expectedLength (optional number)
        expected_length = q.get("expectedLength")
        if expected_length is not None and not isinstance(expected_length, (int, float)):
            raise ValueError(f"Question[{idx}].expectedLength must be a number")
    
    return obj


def build_grading_prompt(
    question: str,
    student_answer: str,
    sample_answer: str,
    key_points: list[str],
    rubric: str
) -> str:
    """
    Build optimized grading prompt with 60-70% fewer tokens than original.
    Uses concise format instead of verbose instructions.
    """
    key_points_str = "\n".join(f"{i+1}. {kp}" for i, kp in enumerate(key_points))
    
    # Concise grading prompt
    return f"""Provide constructive feedback on this student answer as valid JSON only.

Question: {question}

Student Answer: {student_answer}

Sample Answer: {sample_answer}

Key Points:
{key_points_str}

Rubric: {rubric}

Required JSON format:
{{
  "feedback": "Overall assessment (2-3 sentences)",
  "strengths": ["Strength 1", "Strength 2"],
  "improvements": ["Improvement 1", "Improvement 2"],
  "keyPointsCovered": ["Covered point 1"],
  "keyPointsMissed": ["Missed point 1"]
}}

Requirements:
- Constructive, encouraging feedback
- 2-3 specific strengths and improvements
- List covered and missed key points
- Valid JSON syntax (proper commas, no trailing commas)
- Arrays can be empty if no items apply

Output valid JSON now:"""

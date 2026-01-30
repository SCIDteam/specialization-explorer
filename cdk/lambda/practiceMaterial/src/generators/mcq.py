from typing import Any, Dict

def build_mcq_prompt(topic: str, difficulty: str, num_questions: int, num_options: int, context_snippets: list[str]) -> str:
    """
    Build optimized MCQ prompt with aggressive token reduction for large question sets.
    For 20 questions with 6 options, this reduces output tokens by ~50%.
    """
    option_ids = [chr(97 + i) for i in range(num_options)]
    
    # Limit context to 300 chars per snippet, max 4 snippets for token efficiency
    optimized_snippets = []
    for snippet in context_snippets[:4]:
        if len(snippet) > 300:
            snippet = snippet[:300].rsplit(' ', 1)[0] + "..."
        optimized_snippets.append(snippet)
    
    context = "\n".join([f"- {c}" for c in optimized_snippets])
    
    # Ultra-concise prompt optimized for large question sets
    # Key optimization: Only require explanation for correct answer
    return f"""Generate {num_questions} MCQs as JSON.

Topic: "{topic}" | Difficulty: {difficulty} | Options: {', '.join(option_ids)}

Context:
{context}

JSON format:
{{
  "title": "Practice Quiz: {topic}",
  "questions": [
    {{
      "id": "q1",
      "questionText": "Question text",
      "options": [
        {{"id": "a", "text": "Correct answer", "explanation": "Why correct"}},
        {{"id": "b", "text": "Wrong answer", "explanation": ""}}
      ],
      "correctAnswer": "a"
    }}
  ]
}}

Rules:
- {num_questions} questions, {num_options} options each
- Explanation REQUIRED for correct answer only
- Explanation OPTIONAL (use "") for incorrect answers
- Concise explanations (1 sentence max)
- Valid JSON, no markdown

Output JSON:"""



def validate_mcq_shape(obj: Dict[str, Any], num_questions: int, num_options: int) -> Dict[str, Any]:
    if not isinstance(obj, dict):
        raise ValueError("Invalid root JSON")
    if not isinstance(obj.get("title"), str) or not obj["title"].strip():
        raise ValueError("Invalid title")
    qs = obj.get("questions")
    if not isinstance(qs, list) or len(qs) != num_questions:
        raise ValueError(f"questions must have exactly {num_questions} items")
    valid_ids = {chr(97 + i) for i in range(num_options)}
    for idx, q in enumerate(qs):
        if not isinstance(q, dict):
            raise ValueError(f"Question[{idx}] invalid")
        if not isinstance(q.get("id"), str) or not q["id"].strip():
            raise ValueError(f"Question[{idx}].id invalid")
        if not isinstance(q.get("questionText"), str) or not q["questionText"].strip():
            raise ValueError(f"Question[{idx}].questionText invalid")
        opts = q.get("options")
        if not isinstance(opts, list) or len(opts) != num_options:
            raise ValueError(f"Question[{idx}].options must have exactly {num_options} items")
        for oi, opt in enumerate(opts):
            if not isinstance(opt, dict):
                raise ValueError(f"Question[{idx}].options[{oi}] invalid")
            if opt.get("id") not in valid_ids:
                raise ValueError(f"Question[{idx}].options[{oi}].id invalid")
            if not isinstance(opt.get("text"), str) or not opt["text"].strip():
                raise ValueError(f"Question[{idx}].options[{oi}].text invalid")
            # Explanation is required to be a string, but can be empty for incorrect answers
            if not isinstance(opt.get("explanation"), str):
                raise ValueError(f"Question[{idx}].options[{oi}].explanation must be a string")
        if q.get("correctAnswer") not in valid_ids:
            raise ValueError(f"Question[{idx}].correctAnswer invalid")
    return obj

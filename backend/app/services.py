import json
import math
import re

import fitz  # PyMuPDF
from docx import Document
import google.generativeai as genai

from .security import settings


# ============================================================
# GEMINI CONFIGURATION
# ============================================================

model = None
embed_model = "models/gemini-embedding-001"

if settings.GEMINI_API_KEY:
    genai.configure(api_key=settings.GEMINI_API_KEY)

    # Gemini model used for chat and question generation
    model = genai.GenerativeModel("gemini-3.6-flash")


# ============================================================
# TEXT EXTRACTION
# ============================================================

def extract_text(file_path: str, filename: str) -> str:
    """
    Extract text from PDF, DOC/DOCX, or TXT files.
    """

    text = ""

    ext = filename.lower().split(".")[-1]

    try:
        if ext == "pdf":
            doc = fitz.open(file_path)

            for page in doc:
                text += page.get_text() + "\n"

            doc.close()

        elif ext in ["doc", "docx"]:
            doc = Document(file_path)

            for paragraph in doc.paragraphs:
                text += paragraph.text + "\n"

        elif ext == "txt":
            with open(file_path, "r", encoding="utf-8") as f:
                text = f.read()

        else:
            return ""

    except Exception as e:
        print(f"Text extraction error: {e}")
        return ""

    # Keep prototype documents reasonably small
    return text[:15000]


# ============================================================
# GEMINI MCQ GENERATION
# ============================================================

def generate_questions_from_text(text: str):
    """
    Generate multiple-choice questions from training material.

    Each question is mapped to one of the platform competencies.
    """

    competencies = [
        "Statistical",
        "Data Analysis",
        "Data Visualization",
        "Digital Governance",
        "Leadership"
    ]

    # Fallback if Gemini isn't configured
    if not model:
        return [
            {
                "id": "q1",
                "question": "What is data?",
                "options": [
                    "Information",
                    "Water",
                    "Air",
                    "Fire"
                ],
                "correct": 0,
                "competency": "Data Analysis"
            },
            {
                "id": "q2",
                "question": "Which technology is commonly used for data analysis?",
                "options": [
                    "Python",
                    "Paint",
                    "Calculator only",
                    "Notepad only"
                ],
                "correct": 0,
                "competency": "Data Analysis"
            },
            {
                "id": "q3",
                "question": "Why is accurate statistical information important?",
                "options": [
                    "For evidence-based decision making",
                    "Only for decoration",
                    "To reduce computer storage",
                    "It has no practical use"
                ],
                "correct": 0,
                "competency": "Statistical"
            }
        ]

    prompt = f"""
You are an assessment-generation assistant for the MoSPI / NSSTA
Skill Intelligence Platform.

Analyze the following training material and generate exactly 3
multiple-choice questions to assess employee competency.

The platform has these competency categories:

{", ".join(competencies)}

For EACH question, determine which ONE competency is most directly
assessed by that question.

Return ONLY valid JSON.

Each question must contain:

- "id": a unique string such as "q1"
- "question": the question text
- "options": exactly 4 answer choices
- "correct": integer index from 0 to 3
- "competency": exactly ONE of:
  "Statistical",
  "Data Analysis",
  "Data Visualization",
  "Digital Governance",
  "Leadership"

Rules:
- Questions must be based on the training material.
- Do not invent unrelated content.
- Do not include markdown.
- Do not include explanations outside the JSON.
- The "correct" value must be the zero-based index of the correct option.

Training material:

{text}
"""

    try:
        response = model.generate_content(prompt)

        result_text = response.text.strip()

        # Remove markdown code fences if Gemini adds them
        result_text = result_text.replace("```json", "")
        result_text = result_text.replace("```", "")
        result_text = result_text.strip()

        questions = json.loads(result_text)

        # Basic validation
        if not isinstance(questions, list):
            raise ValueError("Gemini did not return a JSON array.")

        valid_questions = []

        for i, question in enumerate(questions[:3]):

            if not isinstance(question, dict):
                continue

            competency = question.get("competency")

            if competency not in competencies:
                competency = "Data Analysis"

            valid_questions.append({
                "id": question.get("id", f"q{i + 1}"),
                "question": question.get("question", ""),
                "options": question.get("options", []),
                "correct": int(question.get("correct", 0)),
                "competency": competency
            })

        if not valid_questions:
            raise ValueError("No valid assessment questions generated.")

        return valid_questions

    except Exception as e:
        print(f"Question generation error: {e}")

        return [
            {
                "id": "q1",
                "question": "What is data?",
                "options": [
                    "Information",
                    "Water",
                    "Air",
                    "Fire"
                ],
                "correct": 0,
                "competency": "Data Analysis"
            },
            {
                "id": "q2",
                "question": "Which technology is commonly used for data analysis?",
                "options": [
                    "Python",
                    "Paint",
                    "Calculator only",
                    "Notepad only"
                ],
                "correct": 0,
                "competency": "Data Analysis"
            },
            {
                "id": "q3",
                "question": "Why is accurate statistical information important?",
                "options": [
                    "For evidence-based decision making",
                    "Only for decoration",
                    "To reduce computer storage",
                    "It has no practical use"
                ],
                "correct": 0,
                "competency": "Statistical"
            }
        ]

def get_embedding(text: str, task_type: str = "retrieval_query"):
    """
    Generate an embedding for RAG.

    First tries Google's Gemini embedding model.
    If that model/API is unavailable, automatically falls back
    to a local lightweight embedding so the application continues
    working.
    """

    if not text:
        return [0.0] * 768

    # No Gemini key -> use local fallback
    if not settings.GEMINI_API_KEY:
        return _local_embedding(text)

    try:
        result = genai.embed_content(
            model=embed_model,
            content=text,
            task_type=task_type
        )

        embedding = result.get("embedding")

        if embedding:
            return embedding

        print("Gemini embedding returned no embedding. Using local fallback.")

    except Exception as e:
        print(f"Gemini embedding unavailable: {e}")
        print("Using local embedding fallback.")

    return _local_embedding(text)


# ============================================================
# COSINE SIMILARITY
# ============================================================

def cosine_similarity(v1, v2):
    """
    Calculate cosine similarity between two vectors.
    """

    if not v1 or not v2:
        return 0.0

    length = min(len(v1), len(v2))

    if length == 0:
        return 0.0

    v1 = v1[:length]
    v2 = v2[:length]

    dot = sum(x * y for x, y in zip(v1, v2))

    mag1 = math.sqrt(sum(x * x for x in v1))
    mag2 = math.sqrt(sum(y * y for y in v2))

    if mag1 == 0 or mag2 == 0:
        return 0.0

    return dot / (mag1 * mag2)


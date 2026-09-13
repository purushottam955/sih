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

    Returns:
        [
            {
                "id": "q1",
                "question": "...",
                "options": ["...", "...", "...", "..."],
                "correct": 0
            }
        ]
    """

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
                "correct": 0
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
                "correct": 0
            }
        ]

    prompt = f"""
You are an assessment-generation assistant for the MoSPI / NSSTA
Skill Intelligence Platform.

Analyze the following training material and generate exactly 3
multiple-choice questions to assess comprehension.

Return ONLY valid JSON.

Each question must contain:

- "id": a unique string such as "q1"
- "question": the question text
- "options": exactly 4 answer choices
- "correct": integer index from 0 to 3

Do not include markdown.
Do not include explanations outside the JSON.

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

        for index, question in enumerate(questions[:3]):
            if not isinstance(question, dict):
                continue

            qid = str(question.get("id", f"q{index + 1}"))
            question_text = str(question.get("question", "")).strip()
            options = question.get("options", [])
            correct = question.get("correct", 0)

            if not question_text:
                continue

            if not isinstance(options, list):
                continue

            if len(options) != 4:
                continue

            try:
                correct = int(correct)
            except Exception:
                correct = 0

            if correct < 0 or correct > 3:
                correct = 0

            valid_questions.append(
                {
                    "id": qid,
                    "question": question_text,
                    "options": [str(x) for x in options],
                    "correct": correct
                }
            )

        return valid_questions

    except Exception as e:
        print(f"Gemini generation error: {e}")

        # Return fallback questions instead of crashing the API
        return [
            {
                "id": "q1",
                "question": "What is the main purpose of training material?",
                "options": [
                    "Learning and skill development",
                    "Entertainment only",
                    "Deleting data",
                    "Formatting a computer"
                ],
                "correct": 0
            },
            {
                "id": "q2",
                "question": "Which activity helps improve competency?",
                "options": [
                    "Practice and learning",
                    "Ignoring training",
                    "Deleting courses",
                    "Avoiding assessment"
                ],
                "correct": 0
            }
        ]


# ============================================================
# LOCAL FALLBACK EMBEDDING
# ============================================================

def _local_embedding(text: str, dimensions: int = 768):
    """
    Lightweight deterministic local embedding fallback.

    This is NOT intended to replace a production embedding model.
    It simply prevents RAG from crashing when the Gemini embedding
    endpoint is unavailable.
    """

    vector = [0.0] * dimensions

    words = re.findall(r"\b[a-zA-Z0-9]+\b", text.lower())

    if not words:
        return vector

    for word in words:
        # Deterministic hash so the same word always maps
        # to the same vector position.
        index = hash(word) % dimensions
        vector[index] += 1.0

    # Normalize
    magnitude = math.sqrt(sum(x * x for x in vector))

    if magnitude == 0:
        return vector

    return [x / magnitude for x in vector]


# ============================================================
# EMBEDDINGS
# ============================================================

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

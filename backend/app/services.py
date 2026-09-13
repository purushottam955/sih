import os
import json
import math
import fitz  # PyMuPDF
from docx import Document
import google.generativeai as genai
from .security import settings

# Configure Gemini
if settings.GEMINI_API_KEY:
    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-1.5-flash')
    embed_model = 'models/embedding-001'
else:
    model = None

def extract_text(file_path: str, filename: str) -> str:
    text = ""
    ext = filename.lower().split('.')[-1]
    if ext == 'pdf':
        doc = fitz.open(file_path)
        for page in doc:
            text += page.get_text() + "\n"
    elif ext in ['doc', 'docx']:
        doc = Document(file_path)
        for para in doc.paragraphs:
            text += para.text + "\n"
    elif ext == 'txt':
        with open(file_path, 'r', encoding='utf-8') as f:
            text = f.read()
    return text[:15000] # Limit chunk size for safety in prototype

def generate_questions_from_text(text: str):
    if not model:
        # Graceful fallback
        return [
            {"id": "q1", "question": "Fallback Q1: What is data?", "options": ["Info", "Water", "Air", "Fire"], "correct": 0},
            {"id": "q2", "question": "Fallback Q2: Is AI good?", "options": ["Yes", "No", "Maybe", "Never"], "correct": 0}
        ]
    
    prompt = f"""
    Analyze the following training material and generate 3 multiple-choice questions to assess comprehension.
    Respond ONLY with a valid JSON array of objects. Each object must have:
    - "id": a unique string (e.g., "q1")
    - "question": the question text
    - "options": an array of 4 string options
    - "correct": the integer index (0-3) of the correct option

    Text:
    {text}
    """
    try:
        response = model.generate_content(prompt)
        # Strip markdown code blocks if present
        result_text = response.text.replace('```json', '').replace('```', '').strip()
        return json.loads(result_text)
    except Exception as e:
        print(f"Gemini generation error: {e}")
        return []

def get_embedding(text: str):
    if not settings.GEMINI_API_KEY:
        return [0.0] * 768
    result = genai.embed_content(model=embed_model, content=text, task_type="retrieval_document")
    return result['embedding']

def cosine_similarity(v1, v2):
    dot = sum(x * y for x, y in zip(v1, v2))
    mag1 = math.sqrt(sum(x * x for x in v1))
    mag2 = math.sqrt(sum(y * y for y in v2))
    if mag1 == 0 or mag2 == 0: return 0.0
    return dot / (mag1 * mag2)
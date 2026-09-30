import hashlib
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
    model = genai.GenerativeModel("gemini-1.5-flash")


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

    # Keep prototype documents reasonably sized for LLM context
    return text[:30000]


# ============================================================
# FALLBACK QUESTION BANK (10-15 QUESTIONS COVERING 5 COMPETENCIES)
# ============================================================

def get_fallback_questions():
    """
    Comprehensive fallback question bank (12 questions)
    evaluating competencies on a 1-5 scale across all 5 core domains.
    """
    return [
        {
            "id": "q1",
            "question": "In survey methodology and sampling design, what is the primary benefit of stratified random sampling over simple random sampling?",
            "options": [
                "It ensures adequate representation of distinct sub-populations and lowers overall sampling variance",
                "It eliminates the necessity of calculating a confidence interval",
                "It allows enumerators to interview only the closest accessible households",
                "It removes all potential non-sampling errors automatically"
            ],
            "correct": 0,
            "competency": "Statistical"
        },
        {
            "id": "q2",
            "question": "Which measure of central tendency is most robust and reliable when analyzing skewed economic indicators such as household income distributions?",
            "options": [
                "Arithmetic Mean",
                "Median",
                "Mode",
                "Geometric Mid-range"
            ],
            "correct": 1,
            "competency": "Statistical"
        },
        {
            "id": "q3",
            "question": "In hypothesis testing for public policy evaluation, what is a Type I error (alpha)?",
            "options": [
                "Failing to reject the null hypothesis when it is false",
                "Rejecting the null hypothesis when it is actually true (false positive)",
                "Selecting a sample size that exceeds the target population",
                "Miscalculating the degrees of freedom in a two-way ANOVA"
            ],
            "correct": 1,
            "competency": "Statistical"
        },
        {
            "id": "q4",
            "question": "When preprocessing longitudinal survey datasets, what is the best practice for addressing missing data in time-series metrics?",
            "options": [
                "Immediately delete any observation row containing any missing entry",
                "Perform exploratory analysis to assess missingness mechanism and apply domain-informed imputation (e.g., trend interpolation)",
                "Replace all missing values with zero indiscriminately",
                "Duplicate the most recent non-zero observation throughout future years"
            ],
            "correct": 1,
            "competency": "Data Analysis"
        },
        {
            "id": "q5",
            "question": "What is the primary analytical risk of confusing statistical correlation with causation in government policy studies?",
            "options": [
                "Attributing real policy outcomes to an unrelated co-moving variable rather than the actual causal driver",
                "Causing software processing bottlenecks during linear regression computation",
                "Artificially inflating the spreadsheet file storage size",
                "Automatically invalidating all descriptive summary tables"
            ],
            "correct": 0,
            "competency": "Data Analysis"
        },
        {
            "id": "q6",
            "question": "In Exploratory Data Analysis (EDA), which diagnostic tool is most effective for rapidly detecting multivariate outliers and feature interactions?",
            "options": [
                "Pairwise scatterplot matrices (pairplots) and Mahalanobis distance / box plots",
                "A simple printout of raw unindexed database records",
                "A single pie chart displaying total row count",
                "Sorting the dataset alphabetically by officer name"
            ],
            "correct": 0,
            "competency": "Data Analysis"
        },
        {
            "id": "q7",
            "question": "When communicating quarterly budgetary allocation across 8 central ministries to senior leadership, which visual representation is most effective?",
            "options": [
                "A standardized horizontal bar chart ordered by allocation size with clear value labels",
                "A 3-dimensional rotating exploded pie chart with saturated neon textures",
                "A raw unformatted comma-separated text wall",
                "A multi-line chart connecting categorical ministry names as continuous temporal data"
            ],
            "correct": 0,
            "competency": "Data Visualization"
        },
        {
            "id": "q8",
            "question": "What is the primary purpose of adhering to WCAG-compliant color contrast ratios when designing official government dashboards?",
            "options": [
                "Ensuring key charts and performance indicators are legibly readable by all users, including those with visual impairments",
                "Reducing bandwidth consumption across municipal web servers",
                "Preventing data tables from being exported to CSV formats",
                "Restricting analytical dashboards to monochrome monitors only"
            ],
            "correct": 0,
            "competency": "Data Visualization"
        },
        {
            "id": "q9",
            "question": "Under modern Digital Governance and Open Government Data (OGD) mandates, what prerequisite must be verified before releasing administrative datasets?",
            "options": [
                "Rigorous anonymization and de-identification of all Personally Identifiable Information (PII)",
                "Restricting dataset licensing to commercial enterprise software vendors exclusively",
                "Requiring citizens to submit physical notarized forms to download data",
                "Compressing files with proprietary encryption keys"
            ],
            "correct": 0,
            "competency": "Digital Governance"
        },
        {
            "id": "q10",
            "question": "How does adopting standardized REST/GraphQL APIs and open data schemas enhance national statistical coordination?",
            "options": [
                "It enables automated interoperability and seamless data exchange across central ministries and state departments",
                "It mandates manual double-entry verification of every record across departments",
                "It blocks state departments from querying central registries",
                "It eliminates the need for database backups and audit logging"
            ],
            "correct": 0,
            "competency": "Digital Governance"
        },
        {
            "id": "q11",
            "question": "When leading an inter-departmental analytics initiative with conflicting deadlines, how should an officer achieve alignment?",
            "options": [
                "Establish a shared strategic objective with transparent milestone tracking and open cross-functional stakeholder communication",
                "Unilaterally dictate priorities and refuse to consult departmental counterparts",
                "Postpone all project deliverable schedules until conflicts resolve on their own",
                "Transfer all analytical accountability to external junior interns"
            ],
            "correct": 0,
            "competency": "Leadership"
        },
        {
            "id": "q12",
            "question": "In civil service leadership, when rigorous empirical evidence contradicts popular operational assumptions, the recommended action is to:",
            "options": [
                "Objectively present the methodology, empirical findings, and confidence intervals to decision-makers with actionable recommendations",
                "Alter the statistical tables to align with executive preconceptions",
                "Suppress the evaluation report indefinitely",
                "Delete the underlying raw survey observations"
            ],
            "correct": 0,
            "competency": "Leadership"
        }
    ]


# ============================================================
# GEMINI MCQ GENERATION (10-20 QUESTIONS)
# ============================================================

def generate_questions_from_text(text: str):
    """
    Generate 10 to 20 multiple-choice questions from training material.
    Each question is mapped to one of the platform competencies:
    Statistical, Data Analysis, Data Visualization, Digital Governance, Leadership.
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
        return get_fallback_questions()

    prompt = f"""
You are an expert assessment-generation assistant for Capacity Connect,
the MoSPI / NSSTA capacity-building ecosystem (National Statistical Systems Training Academy).

Analyze the following training material and generate between 10 to 15
high-quality multiple-choice questions to comprehensively assess employee competency.

The platform evaluates these 5 competency categories:
{", ".join(competencies)}

Distribute the questions appropriately across competencies addressed by the material.
For EACH question, designate which ONE competency is most directly evaluated.

Return ONLY a valid JSON array of objects. Do NOT include markdown code blocks, backticks, or explanatory text.

Each question object MUST contain:
- "id": a unique string identifier, e.g. "q1", "q2", "q3", etc.
- "question": clear, professional question text based on the content
- "options": exactly 4 distinct, plausible answer choices
- "correct": integer index from 0 to 3 pointing to the correct choice
- "competency": exactly ONE of:
  "Statistical",
  "Data Analysis",
  "Data Visualization",
  "Digital Governance",
  "Leadership"

Rules:
- Questions must test conceptual understanding, practical application, and domain knowledge.
- Generate between 10 and 15 questions.
- Every question must have exactly 4 choices in "options".
- "correct" must be an integer between 0 and 3.

Training material:
{text}
"""

    try:
        response = model.generate_content(prompt)
        result_text = response.text.strip()

        # Remove markdown code fences if present
        result_text = re.sub(r"^```(?:json)?", "", result_text, flags=re.MULTILINE)
        result_text = re.sub(r"```$", "", result_text, flags=re.MULTILINE)
        result_text = result_text.strip()

        questions = json.loads(result_text)

        if not isinstance(questions, list):
            raise ValueError("Gemini response is not a JSON list.")

        valid_questions = []

        for i, q in enumerate(questions[:20]):
            if not isinstance(q, dict):
                continue

            comp = q.get("competency")
            if comp not in competencies:
                comp = "Data Analysis"

            options = q.get("options", [])
            if not isinstance(options, list) or len(options) < 2:
                continue

            # Ensure exactly 4 options or pad if needed
            cleaned_options = [str(opt).strip() for opt in options[:4]]
            while len(cleaned_options) < 4:
                cleaned_options.append(f"Additional option {len(cleaned_options) + 1}")

            correct_idx = q.get("correct", 0)
            try:
                correct_idx = int(correct_idx)
                if correct_idx < 0 or correct_idx >= len(cleaned_options):
                    correct_idx = 0
            except (ValueError, TypeError):
                correct_idx = 0

            valid_questions.append({
                "id": str(q.get("id", f"q{i + 1}")),
                "question": str(q.get("question", "")).strip(),
                "options": cleaned_options,
                "correct": correct_idx,
                "competency": comp
            })

        # Require at least 8 valid questions, otherwise fallback
        if len(valid_questions) >= 8:
            return valid_questions

        print(f"Gemini returned {len(valid_questions)} questions; augmenting with fallback question bank.")
        fallback = get_fallback_questions()
        return valid_questions + fallback[len(valid_questions):]

    except Exception as e:
        print(f"Question generation error: {e}. Utilizing fallback bank.")
        return get_fallback_questions()


# ============================================================
# EMBEDDINGS & RAG
# ============================================================

def _local_embedding(text: str, dim: int = 768):
    """
    Deterministic hash-based lightweight local fallback embedding.
    Generates a unit-normalized float vector of length `dim`.
    """
    if not text:
        return [0.0] * dim

    seed = int(hashlib.sha256(text.encode("utf-8")).hexdigest(), 16)
    vector = []
    current = seed
    for _ in range(dim):
        current = (current * 6364136223846793005 + 1) & 0xFFFFFFFFFFFFFFFF
        val = (((current >> 32) & 0xFFFFFFFF) / 0xFFFFFFFF) * 2.0 - 1.0
        vector.append(val)

    norm = math.sqrt(sum(x * x for x in vector)) or 1.0
    return [x / norm for x in vector]


def get_embedding(text: str, task_type: str = "retrieval_query"):
    """
    Generate an embedding for RAG.
    First tries Google's Gemini embedding model.
    Falls back gracefully to local deterministic embedding on failure.
    """

    if not text:
        return [0.0] * 768

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

        print("Gemini embedding returned empty. Using local fallback.")
    except Exception as e:
        print(f"Gemini embedding unavailable: {e}. Using local fallback.")

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



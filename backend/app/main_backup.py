import os

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from sqlalchemy.orm import Session
from jose import jwt, JWTError

from .database import engine, Base, get_db
from .models import User, Course, Assessment, DocumentChunk
from .schemas import Token, UserProfile, ChatRequest, AssessmentSubmit
from .security import verify_password, create_access_token, settings
from .services import (
    extract_text,
    generate_questions_from_text,
    get_embedding,
    cosine_similarity,
)


# ============================================================
# DATABASE INITIALIZATION
# ============================================================

Base.metadata.create_all(bind=engine)


# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(
    title="Skill Intelligence API",
    version="1.0.0",
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# AUTHENTICATION
# ============================================================

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="api/auth/login"
)


# ============================================================
# REQUIRED COMPETENCY LEVELS
# ============================================================

REQUIRED_LEVELS = {
    "Statistical Officer": {
        "Statistical": 4,
        "Data Analysis": 3,
        "Data Visualization": 3,
        "Digital Governance": 2,
        "Leadership": 2,
    },

    "Senior Statistical Officer": {
        "Statistical": 5,
        "Data Analysis": 4,
        "Data Visualization": 4,
        "Digital Governance": 3,
        "Leadership": 3,
    },

    "Deputy Director (Statistics)": {
        "Statistical": 5,
        "Data Analysis": 5,
        "Data Visualization": 4,
        "Digital Governance": 4,
        "Leadership": 4,
    },
}


# ============================================================
# CURRENT USER
# ============================================================

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
    )

    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )

        employee_id = payload.get("sub")

        if employee_id is None:
            raise credentials_exception

    except JWTError:
        raise credentials_exception

    user = (
        db.query(User)
        .filter(User.employee_id == employee_id)
        .first()
    )

    if user is None:
        raise credentials_exception

    return user


# ============================================================
# AUTH ROUTES
# ============================================================

@app.post(
    "/api/auth/login",
    response_model=Token,
)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = (
        db.query(User)
        .filter(User.employee_id == form_data.username)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=400,
            detail="Incorrect Employee ID or password",
        )

    if not verify_password(
        form_data.password,
        user.hashed_password,
    ):
        raise HTTPException(
            status_code=400,
            detail="Incorrect Employee ID or password",
        )

    access_token = create_access_token(
        data={"sub": user.employee_id}
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


@app.get(
    "/api/auth/me",
    response_model=UserProfile,
)
def read_users_me(
    current_user: User = Depends(get_current_user),
):
    name_parts = current_user.name.split()

    initials = "".join(
        part[0]
        for part in name_parts[:2]
    ).upper()

    return UserProfile(
        employeeId=current_user.employee_id,
        name=current_user.name,
        designation=current_user.designation,
        department=current_user.department,
        qualification=current_user.qualification,
        email=current_user.email,
        initials=initials,
        competencies=current_user.competencies,
        is_admin=current_user.is_admin,
    )


# ============================================================
# COMPETENCY / SKILL GAP ROUTES
# ============================================================

@app.get("/api/gaps")
def get_gaps(
    target_role: str = "Senior Statistical Officer",
    current_user: User = Depends(get_current_user),
):
    req_levels = REQUIRED_LEVELS.get(
        target_role,
        REQUIRED_LEVELS["Statistical Officer"],
    )

    gaps = {}
    total_gap = 0

    for competency, required_level in req_levels.items():

        current_level = current_user.competencies.get(
            competency,
            0,
        )

        gap = max(
            0,
            required_level - current_level,
        )

        gaps[competency] = {
            "required": required_level,
            "current": current_level,
            "gap": gap,
        }

        total_gap += gap

    return {
        "gaps": gaps,
        "totalGap": total_gap,
    }


# ============================================================
# RECOMMENDED COURSES
# ============================================================

@app.get("/api/courses/recommended")
def get_recommended_courses(
    target_role: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    req_levels = REQUIRED_LEVELS.get(
        target_role,
        REQUIRED_LEVELS["Statistical Officer"],
    )

    recommended = []

    courses = db.query(Course).all()

    for course in courses:

        current_level = current_user.competencies.get(
            course.skill,
            0,
        )

        required_level = req_levels.get(
            course.skill,
            0,
        )

        gap = max(
            0,
            required_level - current_level,
        )

        if gap > 0:

            recommended.append(
                {
                    "id": course.id,
                    "title": course.title,
                    "skill": course.skill,
                    "description": course.description,
                    "gap": gap,
                    "severity": (
                        "High"
                        if gap >= 2
                        else "Low"
                    ),
                    "reason": (
                        f"Addresses {course.skill} "
                        f"competency gap of "
                        f"{gap} level(s)."
                    ),
                }
            )

    return sorted(
        recommended,
        key=lambda x: x["gap"],
        reverse=True,
    )


# ============================================================
# ASSESSMENT / RAG
# ============================================================

os.makedirs(
    "uploads",
    exist_ok=True,
)


@app.post("/api/assessments/upload")
async def upload_assessment(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # --------------------------------------------------------
    # Save uploaded file
    # --------------------------------------------------------

    safe_filename = os.path.basename(file.filename)

    file_path = os.path.join(
        "uploads",
        safe_filename,
    )

    file_contents = await file.read()

    with open(file_path, "wb") as buffer:
        buffer.write(file_contents)

    # --------------------------------------------------------
    # Extract text
    # --------------------------------------------------------

    text = extract_text(
        file_path,
        safe_filename,
    )

    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail="Could not extract text from the uploaded file.",
        )

    # --------------------------------------------------------
    # Generate MCQs
    # --------------------------------------------------------

    questions = generate_questions_from_text(text)

    if not questions:
        raise HTTPException(
            status_code=500,
            detail="Could not generate assessment questions.",
        )

    # --------------------------------------------------------
    # Save assessment
    # --------------------------------------------------------

    assessment = Assessment(
        user_id=current_user.id,
        filename=safe_filename,
        questions=questions,
    )

    db.add(assessment)
    db.commit()
    db.refresh(assessment)

    # --------------------------------------------------------
    # Store document embedding for RAG
    #
    # IMPORTANT:
    # This is a document, therefore we explicitly use
    # retrieval_document.
    # --------------------------------------------------------

    document_text = text[:2000]

    document_embedding = get_embedding(
        document_text,
        task_type="retrieval_document",
    )

    chunk = DocumentChunk(
        assessment_id=assessment.id,
        text_chunk=document_text,
        embedding=document_embedding,
    )

    db.add(chunk)
    db.commit()

    # --------------------------------------------------------
    # Hide correct answers from frontend
    # --------------------------------------------------------

    safe_questions = []

    for question in questions:

        safe_questions.append(
            {
                "id": question["id"],
                "question": question["question"],
                "options": question["options"],
            }
        )

    return {
        "assessment_id": assessment.id,
        "questions": safe_questions,
    }


# ============================================================
# SUBMIT ASSESSMENT
# ============================================================

@app.post("/api/assessments/submit")
def submit_assessment(
    data: AssessmentSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    assessment = (
        db.query(Assessment)
        .filter(
            Assessment.id == data.assessment_id,
            Assessment.user_id == current_user.id,
        )
        .first()
    )

    if not assessment:
        raise HTTPException(
            status_code=404,
            detail="Assessment not found",
        )

    score = 0

    for question in assessment.questions:

        user_answer = data.answers.get(
            question["id"]
        )

        correct_answer = question["correct"]

        if user_answer == correct_answer:
            score += 1

    assessment.score = score
    assessment.total = len(
        assessment.questions
    )

    # --------------------------------------------------------
    # UPDATE USER COMPETENCY FROM ASSESSMENT PERFORMANCE
    # --------------------------------------------------------

    total_questions = max(assessment.total, 1)
    percentage = (score / total_questions) * 100

    # Convert assessment performance to competency level 1-7
    if percentage >= 95:
        new_level = 7
    elif percentage >= 85:
        new_level = 6
    elif percentage >= 70:
        new_level = 5
    elif percentage >= 55:
        new_level = 4
    elif percentage >= 40:
        new_level = 3
    elif percentage >= 25:
        new_level = 2
    else:
        new_level = 1

    competencies = current_user.competencies or {}

    detected_competencies = []

    for question in assessment.questions:
        competency = (
            question.get("competency")
            or question.get("skill")
            or question.get("category")
        )

        if competency and competency in competencies:
            detected_competencies.append(competency)

    # Fallback: if questions do not specify a competency,
    # use the first competency in the employee profile.
    if not detected_competencies and competencies:
        detected_competencies = [next(iter(competencies))]

    for competency in set(detected_competencies):
        old_level = competencies.get(competency, 0)
        competencies[competency] = max(
            old_level,
            new_level
        )

    current_user.competencies = competencies

    db.commit()

    return {
        "score": score,
        "total": assessment.total,
        "percentage": round(percentage, 1),
        "competency_level": new_level,
        "updated_competencies": competencies,
    }

# ============================================================
# AI CHAT + RAG
# ============================================================

@app.post("/api/ai/chat")
def ai_chat(
    req: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # --------------------------------------------------------
    # No API key
    # --------------------------------------------------------

    if not settings.GEMINI_API_KEY:

        return {
            "response": (
                "Gemini API key is not configured. "
                "Please review your high-priority "
                "competency gaps first."
            )
        }

    # --------------------------------------------------------
    # Create query embedding
    #
    # IMPORTANT:
    # User question = retrieval_query
    # --------------------------------------------------------

    query_embedding = get_embedding(
        req.message,
        task_type="retrieval_query",
    )

    # --------------------------------------------------------
    # Find stored document chunks
    # --------------------------------------------------------

    chunks = (
        db.query(DocumentChunk)
        .all()
    )

    context_text = ""

    if chunks:

        scored_chunks = []

        for chunk in chunks:

            try:
                similarity = cosine_similarity(
                    query_embedding,
                    chunk.embedding,
                )

                scored_chunks.append(
                    (
                        similarity,
                        chunk.text_chunk,
                    )
                )

            except Exception as e:
                print(
                    f"RAG similarity error: {e}"
                )

        if scored_chunks:

            best_chunk = max(
                scored_chunks,
                key=lambda x: x[0],
            )

            if best_chunk[0] > 0.5:
                context_text = best_chunk[1]

    # --------------------------------------------------------
    # Gemini response
    # --------------------------------------------------------

    from .services import model

    if model is None:

        return {
            "response": (
                "Gemini model is not available. "
                "Please check your GEMINI_API_KEY."
            )
        }

    prompt = f"""
You are the AI Competency Assistant for the
MoSPI / NSSTA Skill Intelligence Platform.

The user is an employee using the platform.

Target career role:
{req.target_role}

Relevant training material:
{context_text}

User question:
{req.message}

Give a concise, practical answer related to
skills, training, competency development, or
career progression.

If relevant, prioritize the user's competency
gaps and recommend learning actions.
"""

    try:

        response = model.generate_content(
            prompt
        )

        return {
            "response": response.text
        }

    except Exception as e:

        print(
            f"Gemini chat error: {e}"
        )

        return {
            "response": (
                "I could not generate an AI response "
                "right now. Please check the Gemini "
                "API configuration."
            )
        }


# ============================================================
# ADMIN HEATMAP
# ============================================================

@app.get("/api/admin/heatmap")
def get_heatmap(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:

        raise HTTPException(
            status_code=403,
            detail="Admin only",
        )

    users = db.query(User).all()

    return [
        {
            "name": user.name,
            "competencies": user.competencies,
        }
        for user in users
    ]


# ============================================================
# SERVE FRONTEND
#
# MUST BE LAST
# ============================================================

app.mount(
    "/",
    StaticFiles(
        directory="../frontend",
        html=True,
    ),
    name="frontend",
)

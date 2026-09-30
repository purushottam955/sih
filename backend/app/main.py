import os

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from sqlalchemy.orm import Session
from jose import jwt, JWTError

from .database import engine, Base, get_db
from .seed import seed_db
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
seed_db()


# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(
    title="Capacity Connect API",
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
                "competency": question.get("competency", "Data Analysis"),
            }
        )

    return {
        "assessment_id": assessment.id,
        "questions": safe_questions,
    }


# ============================================================
# SUBMIT ASSESSMENT (SCALE 1 TO 5)
# ============================================================

@app.post("/api/assessments/submit")
def submit_assessment(
    data: AssessmentSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy.orm.attributes import flag_modified

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
    comp_stats = {}

    for question in assessment.questions:
        user_answer = data.answers.get(question["id"])
        correct_answer = question["correct"]

        comp = (
            question.get("competency")
            or question.get("skill")
            or question.get("category")
            or "Data Analysis"
        )
        if comp not in comp_stats:
            comp_stats[comp] = {"correct": 0, "total": 0}
        comp_stats[comp]["total"] += 1

        if user_answer == correct_answer:
            score += 1
            comp_stats[comp]["correct"] += 1

    assessment.score = score
    assessment.total = len(assessment.questions)

    # --------------------------------------------------------
    # UPDATE USER COMPETENCY FROM ASSESSMENT PERFORMANCE (SCALE: 1-5)
    # Highest Level is 5
    # --------------------------------------------------------

    total_questions = max(assessment.total, 1)
    percentage = (score / total_questions) * 100

    def calculate_level(pct: float) -> int:
        if pct >= 85:
            return 5
        elif pct >= 70:
            return 4
        elif pct >= 50:
            return 3
        elif pct >= 30:
            return 2
        else:
            return 1

    overall_level = min(5, max(1, calculate_level(percentage)))

    competencies = dict(current_user.competencies or {})

    competency_breakdown = {}
    for comp, stats in comp_stats.items():
        comp_pct = (stats["correct"] / max(stats["total"], 1)) * 100
        comp_level = min(5, max(1, calculate_level(comp_pct)))
        competency_breakdown[comp] = {
            "score": stats["correct"],
            "total": stats["total"],
            "percentage": round(comp_pct, 1),
            "level": comp_level,
        }
        # Update official's competency level (capped between 1 and 5)
        old_level = competencies.get(comp, 1)
        competencies[comp] = min(5, max(old_level, comp_level))

    # Ensure profile competency values are strictly bounded [1, 5]
    for k in competencies:
        competencies[k] = min(5, max(1, int(competencies[k])))

    current_user.competencies = competencies
    flag_modified(current_user, "competencies")
    db.commit()
    db.refresh(current_user)

    return {
        "score": score,
        "total": assessment.total,
        "percentage": round(percentage, 1),
        "competency_level": overall_level,
        "scale_max": 5,
        "competency_breakdown": competency_breakdown,
        "updated_competencies": current_user.competencies,
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
    # Local fallback
    # --------------------------------------------------------
    def local_fallback():
        competencies = current_user.competencies or {}

        if not competencies:
            return (
                "I am currently operating in offline mode because "
                "the Gemini AI service is unavailable. "
                "Please complete an assessment to generate your "
                "personalized competency profile."
            )

        required_levels = {
            "Statistical": 5,
            "Data Analysis": 5,
            "Data Visualization": 4,
            "Digital Governance": 4,
            "Leadership": 4,
        }

        gaps = []
        for skill, required in required_levels.items():
            current = competencies.get(skill, 0)
            if current < required:
                gaps.append((skill, required - current, current, required))

        gaps.sort(key=lambda x: x[1], reverse=True)

        if not gaps:
            return (
                "Gemini is temporarily unavailable, but your competency "
                "profile shows that you currently meet the required "
                "levels for the target role. Keep strengthening your "
                "skills through continuous learning and reassessment."
            )

        lines = [
            "Gemini is temporarily unavailable, so I am using the "
            "platform's local competency guidance.",
            "",
            "Priority skill gaps:"
        ]

        for skill, gap, current, required in gaps[:3]:
            lines.append(
                f"? {skill}: current Level {current}, "
                f"required Level {required} (gap {gap})"
            )

        lines.extend([
            "",
            "Recommended action:",
            "1. Focus first on the largest competency gap.",
            "2. Complete the recommended training module.",
            "3. Take a reassessment after training.",
            "",
            "When Gemini becomes available again, the AI Assistant "
            "will automatically return to Gemini-powered responses."
        ])

        return "\n".join(lines)

    # --------------------------------------------------------
    # Try Gemini
    # --------------------------------------------------------
    try:
        if not settings.GEMINI_API_KEY:
            return {"response": local_fallback()}

        query_embedding = None

        # RAG is optional. If embedding fails, continue without it.
        try:
            query_embedding = get_embedding(
                req.message,
                task_type="retrieval_query",
            )
        except Exception as e:
            print(f"RAG embedding unavailable: {e}")

        context_text = ""

        if query_embedding is not None:
            chunks = db.query(DocumentChunk).all()
            scored_chunks = []

            for chunk in chunks:
                try:
                    similarity = cosine_similarity(
                        query_embedding,
                        chunk.embedding,
                    )
                    scored_chunks.append(
                        (similarity, chunk.text_chunk)
                    )
                except Exception as e:
                    print(f"RAG similarity error: {e}")

            if scored_chunks:
                best_chunk = max(
                    scored_chunks,
                    key=lambda x: x[0],
                )

                if best_chunk[0] > 0.5:
                    context_text = best_chunk[1]

        from .services import model

        if model is None:
            return {"response": local_fallback()}

        prompt = f"""
You are the AI Competency Assistant for Capacity Connect,
the MoSPI / NSSTA capacity-building ecosystem.

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

        response = model.generate_content(prompt)

        return {
            "response": response.text
        }

    except Exception as e:
        print(f"Gemini chat error - using local fallback: {e}")
        return {
            "response": local_fallback()
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



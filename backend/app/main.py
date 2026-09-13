import os
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
from jose import jwt, JWTError

from .database import engine, Base, get_db
from .models import User, Course, Assessment, DocumentChunk
from .schemas import Token, UserProfile, ChatRequest, AssessmentSubmit
from .security import verify_password, create_access_token, settings
from .services import extract_text, generate_questions_from_text, get_embedding, cosine_similarity

# Initialize DB (creates file and tables if not exist)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Skill Intelligence API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

REQUIRED_LEVELS = {
    "Statistical Officer": {"Statistical": 4, "Data Analysis": 3, "Data Visualization": 3, "Digital Governance": 2, "Leadership": 2},
    "Senior Statistical Officer": {"Statistical": 5, "Data Analysis": 4, "Data Visualization": 4, "Digital Governance": 3, "Leadership": 3},
    "Deputy Director (Statistics)": {"Statistical": 5, "Data Analysis": 5, "Data Visualization": 4, "Digital Governance": 4, "Leadership": 4},
}

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(status_code=401, detail="Could not validate credentials")
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        employee_id: str = payload.get("sub")
        if employee_id is None: raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.employee_id == employee_id).first()
    if user is None: raise credentials_exception
    return user

# --- AUTH ROUTES ---
@app.post("/api/auth/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.employee_id == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect Employee ID or password")
    access_token = create_access_token(data={"sub": user.employee_id})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/me", response_model=UserProfile)
def read_users_me(current_user: User = Depends(get_current_user)):
    initials = "".join([n[0] for n in current_user.name.split()[:2]]).upper()
    return UserProfile(
        employeeId=current_user.employee_id, name=current_user.name, designation=current_user.designation,
        department=current_user.department, qualification=current_user.qualification, email=current_user.email,
        initials=initials, competencies=current_user.competencies, is_admin=current_user.is_admin
    )

# --- COMPETENCY ENGINE ROUTES ---
@app.get("/api/gaps")
def get_gaps(target_role: str = "Senior Statistical Officer", current_user: User = Depends(get_current_user)):
    req_levels = REQUIRED_LEVELS.get(target_role, REQUIRED_LEVELS["Statistical Officer"])
    gaps, total_gap = {}, 0
    for comp, req in req_levels.items():
        cur = current_user.competencies.get(comp, 0)
        gap = max(0, req - cur)
        gaps[comp] = {"required": req, "current": cur, "gap": gap}
        total_gap += gap
    return {"gaps": gaps, "totalGap": total_gap}

@app.get("/api/courses/recommended")
def get_recommended_courses(target_role: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req_levels = REQUIRED_LEVELS.get(target_role, REQUIRED_LEVELS["Statistical Officer"])
    recommended = []
    courses = db.query(Course).all()
    for course in courses:
        cur_level = current_user.competencies.get(course.skill, 0)
        req_level = req_levels.get(course.skill, 0)
        gap = max(0, req_level - cur_level)
        if gap > 0:
            recommended.append({
                "id": course.id, "title": course.title, "skill": course.skill, "description": course.description,
                "gap": gap, "severity": "High" if gap >= 2 else "Low",
                "reason": f"Addresses {course.skill} competency gap of {gap} level(s)."
            })
    return sorted(recommended, key=lambda x: x["gap"], reverse=True)

# --- ASSESSMENT ROUTES (RAG) ---
os.makedirs("uploads", exist_ok=True)

@app.post("/api/assessments/upload")
async def upload_assessment(file: UploadFile = File(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    file_path = f"uploads/{file.filename}"
    with open(file_path, "wb") as buffer:
        buffer.write(await file.read())
    
    text = extract_text(file_path, file.filename)
    questions = generate_questions_from_text(text)
    
    assessment = Assessment(user_id=current_user.id, filename=file.filename, questions=questions)
    db.add(assessment)
    db.commit()
    db.refresh(assessment)
    
    # Store embedding for RAG Chat
    chunk = DocumentChunk(assessment_id=assessment.id, text_chunk=text[:2000], embedding=get_embedding(text[:2000]))
    db.add(chunk)
    db.commit()

    # Mask correct answers before returning
    safe_q = [{"id": q["id"], "question": q["question"], "options": q["options"]} for q in questions]
    return {"assessment_id": assessment.id, "questions": safe_q}

@app.post("/api/assessments/submit")
def submit_assessment(data: AssessmentSubmit, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    assess = db.query(Assessment).filter(Assessment.id == data.assessment_id, Assessment.user_id == current_user.id).first()
    if not assess: raise HTTPException(status_code=404, detail="Assessment not found")
    
    score = 0
    for q in assess.questions:
        if data.answers.get(q["id"]) == q["correct"]:
            score += 1
            
    assess.score = score
    assess.total = len(assess.questions)
    db.commit()
    return {"score": score, "total": assess.total}

# --- AI CHAT ---
@app.post("/api/ai/chat")
def ai_chat(req: ChatRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Fallback determinism if no API key
    if not settings.GEMINI_API_KEY:
        return {"response": "System: LLM API key not configured. I recommend reviewing your high-priority competency gaps first."}
    
    # RAG: Find relevant doc chunks
    query_emb = get_embedding(req.message)
    chunks = db.query(DocumentChunk).all()
    context_text = ""
    if chunks:
        scored = [(cosine_similarity(query_emb, c.embedding), c.text_chunk) for c in chunks]
        best_chunk = max(scored, key=lambda x: x[0])
        if best_chunk[0] > 0.5: context_text = best_chunk[1]

    from .services import model
    prompt = f"User is asking about career progression to {req.target_role}. Base knowledge: {context_text}. User Message: {req.message}"
    resp = model.generate_content(prompt)
    return {"response": resp.text}

# --- ADMIN ROUTES ---
@app.get("/api/admin/heatmap")
def get_heatmap(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_admin: raise HTTPException(status_code=403, detail="Admin only")
    users = db.query(User).all()
    return [{"name": u.name, "competencies": u.competencies} for u in users]

# Serve Frontend static files (MUST BE LAST)
app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")
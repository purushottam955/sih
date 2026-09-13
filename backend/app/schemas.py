from pydantic import BaseModel
from typing import List, Dict, Optional, Any

class Token(BaseModel):
    access_token: str
    token_type: str

class UserProfile(BaseModel):
    employeeId: str
    name: str
    designation: str
    department: str
    qualification: str
    email: str
    initials: str
    competencies: Dict[str, int]
    is_admin: bool

class ChatRequest(BaseModel):
    message: str
    target_role: str

class AssessmentSubmit(BaseModel):
    assessment_id: int
    answers: Dict[str, int]
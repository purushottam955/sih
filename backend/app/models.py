from sqlalchemy import Column, Integer, String, Boolean, JSON, ForeignKey, Text
from sqlalchemy.orm import relationship
from .database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(String, unique=True, index=True)
    name = Column(String)
    hashed_password = Column(String)
    designation = Column(String)
    department = Column(String)
    qualification = Column(String)
    email = Column(String)
    is_admin = Column(Boolean, default=False)
    competencies = Column(JSON) # e.g. {"Statistical": 4, "Leadership": 1}

class Course(Base):
    __tablename__ = "courses"
    id = Column(String, primary_key=True)
    title = Column(String)
    skill = Column(String)
    description = Column(String)

class Assessment(Base):
    __tablename__ = "assessments"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    filename = Column(String)
    questions = Column(JSON) # Generated questions with correct answers
    score = Column(Integer, nullable=True)
    total = Column(Integer, nullable=True)

class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    id = Column(Integer, primary_key=True, index=True)
    assessment_id = Column(Integer, ForeignKey("assessments.id"))
    text_chunk = Column(Text)
    embedding = Column(JSON) # Lightweight local array storage
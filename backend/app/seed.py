from .database import SessionLocal, engine, Base
from .models import User, Course
from .security import get_password_hash

def seed_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    if not db.query(User).filter(User.employee_id == "MOSPI-2024-0142").first():
        demo_user = User(
            employee_id="MOSPI-2024-0142",
            name="Ananya Sharma",
            hashed_password=get_password_hash("password"),
            designation="Statistical Officer",
            department="Ministry of Statistics & Programme Implementation",
            qualification="M.Sc. Statistics",
            email="ananya.sharma@mospi.gov.in",
            is_admin=False,
            competencies={"Statistical": 4, "Data Analysis": 1, "Data Visualization": 2, "Digital Governance": 2, "Leadership": 1}
        )
        admin_user = User(
            employee_id="ADMIN-001", name="Admin Director", hashed_password=get_password_hash("password"),
            designation="Director", department="MoSPI", qualification="Ph.D.", email="admin@mospi.gov.in",
            is_admin=True, competencies={"Statistical": 5, "Data Analysis": 5, "Data Visualization": 5, "Digital Governance": 5, "Leadership": 5}
        )
        db.add(demo_user)
        db.add(admin_user)
        
    if not db.query(Course).first():
        courses = [
            Course(id="c1", title="Advanced Data Analysis", skill="Data Analysis", description="Deepen your statistical modeling skills."),
            Course(id="c2", title="Power BI Fundamentals", skill="Data Visualization", description="Master interactive dashboards."),
            Course(id="c3", title="Leadership Essentials", skill="Leadership", description="Build team management capabilities."),
            Course(id="c4", title="Advanced Statistics", skill="Statistical", description="Advanced inferential statistics.")
        ]
        db.add_all(courses)
        
    db.commit()
    db.close()
    print("Database seeded successfully.")

if __name__ == "__main__":
    seed_db()
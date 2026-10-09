from datetime import datetime
from sqlalchemy import select, text
from app.database import Base, engine, SessionLocal
from app.models import (
    AcademicYear,
    Approval,
    College,
    Department,
    EmailDomain,
    ExitLog,
    ExtensionLog,
    GatePass,
    Hostel,
    HostelBlock,
    Role,
    Section,
    Semester,
    StaffProfile,
    StaffStatus,
    StudentProfile,
    User,
)
from app.auth import hash_password

# Ensure schema is up to date
Base.metadata.create_all(engine)
db = SessionLocal()

# College setup - JNN INSTITUTE
college = db.scalar(select(College).where(College.name.in_(["JNN INSTITUTE", "J.N.N. Institute of Technology"])))
if not college:
    college = College(name="JNN INSTITUTE")
    db.add(college)
    db.flush()
else:
    college.name = "JNN INSTITUTE"
    db.flush()

domain = db.scalar(select(EmailDomain).where(EmailDomain.domain == "jnn.edu.in", EmailDomain.college_id == college.id))
if not domain:
    db.add(EmailDomain(college_id=college.id, domain="jnn.edu.in"))
    db.flush()

# Helper to create or update users
def upsert_user(email, full_name, password, role, staff_status=StaffStatus.APPROVED):
    user = db.scalar(select(User).where(User.email == email.lower()))
    if not user:
        user = User(
            college_id=college.id,
            email=email.lower(),
            full_name=full_name,
            password_hash=hash_password(password),
            role=role,
            email_verified=True,
            staff_status=staff_status,
            active=True,
        )
        db.add(user)
        db.flush()
    else:
        user.full_name = full_name
        user.email_verified = True
        user.staff_status = staff_status
        user.active = True
        user.password_hash = hash_password(password)
        db.flush()
    return user

principal = upsert_user("principal@jnn.edu.in", "Dr. G. Mohanbabu", "DemoPass123!", Role.PRINCIPAL)
incharge = upsert_user("incharge@jnn.edu.in", "Vijaya Lakshmi K", "DemoPass123!", Role.CLASS_INCHARGE)
hod_aids = upsert_user("hod.aids@jnn.edu.in", "Dr. Nagarajan", "DemoPass123!", Role.HOD)
warden = upsert_user("warden@jnn.edu.in", "Mrs. Rama (Hostel Warden)", "DemoPass123!", Role.WARDEN)
security = upsert_user("security@jnn.edu.in", "Officer Suresh (Campus Security)", "DemoPass123!", Role.SECURITY)
student = upsert_user("student@jnn.edu.in", "Anjani Chowdary", "DemoPass123!", Role.STUDENT)

# Also ensure panjani72@jnn.edu.in is updated to Anjani Chowdary
user_panja = db.scalar(select(User).where(User.email == "panjani72@jnn.edu.in"))
if user_panja:
    user_panja.full_name = "Anjani Chowdary"
    user_panja.email_verified = True
    user_panja.active = True
    db.flush()

# Rename old "AI & Data Science" to "AI&DS" if present
old_dept = db.scalar(select(Department).where(Department.name == "AI & Data Science", Department.college_id == college.id))
if old_dept:
    old_dept.name = "AI&DS"
    db.flush()

# Requested departments list
department_names = [
    "CSE",
    "CYBER SECURITY",
    "AI&DS",
    "ECE",
    "VLSI",
    "AGRICULTURAL ENGINEERING",
    "BIO MEDICAL ENGINEERING",
    "AI&ML",
    "ROBOTICS AND AUTOMATION",
    "MBA",
]

seeded_depts = {}
for dname in department_names:
    d = db.scalar(select(Department).where(Department.name == dname, Department.college_id == college.id))
    if not d:
        d = Department(college_id=college.id, name=dname, hod_user_id=principal.id)
        db.add(d)
        db.flush()
    else:
        # AI&DS HOD is Dr. Nagarajan; all others default to principal
        if dname == "AI&DS":
            d.hod_user_id = hod_aids.id
        else:
            d.hod_user_id = principal.id
        db.flush()
    seeded_depts[dname] = d

    # Academic years and semesters
    is_mba = (dname == "MBA")
    year_configs = [
        ("1st Year", ["Semester 1", "Semester 2"]),
        ("2nd Year", ["Semester 3", "Semester 4"]),
    ]
    if not is_mba:
        year_configs.extend([
            ("3rd Year", ["Semester 5", "Semester 6"]),
            ("4th Year", ["Semester 7", "Semester 8"]),
        ])

    for y_name, sem_names in year_configs:
        yr = db.scalar(select(AcademicYear).where(AcademicYear.name == y_name, AcademicYear.department_id == d.id))
        if not yr:
            yr = AcademicYear(department_id=d.id, name=y_name)
            db.add(yr)
            db.flush()

        for s_name in sem_names:
            sm = db.scalar(select(Semester).where(Semester.name == s_name, Semester.year_id == yr.id))
            if not sm:
                sm = Semester(year_id=yr.id, name=s_name)
                db.add(sm)
                db.flush()

            # AI&DS 4th Year has only ONE section (A); other dept/years have A and B
            if dname == "AI&DS" and y_name == "4th Year":
                section_names = ["A"]
                # Remove Section B if it exists for AI&DS 4th Year
                sec_b = db.scalar(select(Section).where(Section.name == "B", Section.semester_id == sm.id))
                if sec_b:
                    db.delete(sec_b)
                    db.flush()
            else:
                section_names = ["A", "B"]

            for sec_name in section_names:
                sec = db.scalar(select(Section).where(Section.name == sec_name, Section.semester_id == sm.id))
                if not sec:
                    # AI&DS 4th year incharge is Vijaya Lakshmi
                    incharge_id = incharge.id if (dname == "AI&DS" and y_name == "4th Year") else None
                    sec = Section(semester_id=sm.id, name=sec_name, class_incharge_user_id=incharge_id)
                    db.add(sec)
                    db.flush()
                else:
                    if dname == "AI&DS" and y_name == "4th Year":
                        sec.class_incharge_user_id = incharge.id
                    db.flush()

hostel = db.scalar(select(Hostel).where(Hostel.name == "Main Campus Hostel", Hostel.college_id == college.id))
if not hostel:
    hostel = Hostel(college_id=college.id, name="Main Campus Hostel")
    db.add(hostel)
    db.flush()

# ── Clear all gate pass history & student profile details ──────────────────
print("Clearing gate pass history and student profile details...")
db.execute(text("DELETE FROM extension_logs"))
db.execute(text("DELETE FROM exit_logs"))
db.execute(text("DELETE FROM approvals"))
db.execute(text("DELETE FROM gate_passes"))
# Reset all student profile details (keep user_id and student_id only)
for sp_row in db.scalars(select(StudentProfile)).all():
    sp_row.phone = None
    sp_row.gender = None
    sp_row.department_id = None
    sp_row.year_id = None
    sp_row.semester_id = None
    sp_row.section_id = None
    sp_row.cgpa = None
    sp_row.arrears = None
    sp_row.guardian_name = None
    sp_row.guardian_relationship = None
    sp_row.guardian_phone = None
    sp_row.accommodation = None
    sp_row.hostel_block_id = None
    sp_row.room_number = None
db.flush()
print("Done clearing history.")

# ── Hostel blocks ──────────────────────────────────────────────────────────
# Remove old BLK-A block if it still has the old code
old_blk_a = db.scalar(select(HostelBlock).where(HostelBlock.code == "BLK-A"))
if old_blk_a:
    db.delete(old_blk_a)
    db.flush()

# Rename old plain 'Block A' → 'Block A - MTB' if present
old_block_a = db.scalar(select(HostelBlock).where(HostelBlock.hostel_id == hostel.id, HostelBlock.name == "Block A"))
if old_block_a:
    old_block_a.name = "Block A - MTB"
    old_block_a.code = "MTB"
    old_block_a.gender = "FEMALE"
    db.flush()

# Block A - MTB (Female)
block_mtb = db.scalar(select(HostelBlock).where(HostelBlock.name == "Block A - MTB", HostelBlock.hostel_id == hostel.id))
if not block_mtb:
    block_mtb = HostelBlock(hostel_id=hostel.id, name="Block A - MTB", code="MTB", capacity=120, warden_user_id=warden.id, gender="FEMALE")
    db.add(block_mtb)
    db.flush()
else:
    block_mtb.code = "MTB"
    block_mtb.gender = "FEMALE"
    block_mtb.warden_user_id = warden.id
    db.flush()

# Block B (Female)
block_b = db.scalar(select(HostelBlock).where(HostelBlock.name == "Block B", HostelBlock.hostel_id == hostel.id))
if not block_b:
    block_b = HostelBlock(hostel_id=hostel.id, name="Block B", code="BLK-B", capacity=120, warden_user_id=warden.id, gender="FEMALE")
    db.add(block_b)
    db.flush()
else:
    block_b.gender = "FEMALE"
    block_b.warden_user_id = warden.id
    db.flush()

# Block A - KB (Male)
block_kb = db.scalar(select(HostelBlock).where(HostelBlock.name == "Block A - KB", HostelBlock.hostel_id == hostel.id))
if not block_kb:
    block_kb = HostelBlock(hostel_id=hostel.id, name="Block A - KB", code="KB", capacity=120, warden_user_id=warden.id, gender="MALE")
    db.add(block_kb)
    db.flush()
else:
    block_kb.code = "KB"
    block_kb.gender = "MALE"
    block_kb.warden_user_id = warden.id
    db.flush()

# Block B - Male (separate from female Block B)
block_b_male = db.scalar(select(HostelBlock).where(HostelBlock.code == "BLK-B-M", HostelBlock.hostel_id == hostel.id))
if not block_b_male:
    block_b_male = HostelBlock(hostel_id=hostel.id, name="Block B", code="BLK-B-M", capacity=120, warden_user_id=warden.id, gender="MALE")
    db.add(block_b_male)
    db.flush()
else:
    block_b_male.name = "Block B"
    block_b_male.gender = "MALE"
    block_b_male.warden_user_id = warden.id
    db.flush()

block = block_mtb  # default block reference for demo student

# Target department for demo student (AI&DS 4th Year, Semester 8, Section A)
aids_dept = seeded_depts["AI&DS"]
aids_4th_year = db.scalar(select(AcademicYear).where(AcademicYear.name == "4th Year", AcademicYear.department_id == aids_dept.id))
aids_sem8 = db.scalar(select(Semester).where(Semester.name == "Semester 8", Semester.year_id == aids_4th_year.id))
aids_secA = db.scalar(select(Section).where(Section.name == "A", Section.semester_id == aids_sem8.id))

# Setup staff profiles
for user_obj, emp_id, phone, desig, dept_id, year_id_val, section_id_val in [
    (principal, "PRIN-001", "9876543209", "PRINCIPAL", None, None, None),
    (incharge, "STF-INCHARGE", "9876543210", "CLASS_INCHARGE", aids_dept.id, aids_4th_year.id, aids_secA.id if aids_secA else None),
    (hod_aids, "HOD-AIDS-001", "9876543213", "HOD", aids_dept.id, None, None),
    (warden, "STF-WARDEN", "9876543211", "WARDEN", None, None, None),
    (security, "SEC-001", "9876543212", "SECURITY", None, None, None),
]:
    sp = db.scalar(select(StaffProfile).where(StaffProfile.user_id == user_obj.id))
    if not sp:
        db.add(StaffProfile(
            user_id=user_obj.id,
            employee_id=emp_id,
            phone=phone,
            designation=desig,
            department_id=dept_id,
            year_id=year_id_val,
            section_id=section_id_val,
        ))
        db.flush()
    else:
        sp.phone = phone
        sp.designation = desig
        sp.department_id = dept_id
        sp.year_id = year_id_val
        sp.section_id = section_id_val
        db.flush()

# Also set AI&DS HOD on department
aids_dept.hod_user_id = hod_aids.id
db.flush()

# Resolve any conflict with student_id 110723102021
conflicting_sp = db.scalar(select(StudentProfile).where(StudentProfile.student_id == "110723102021"))
if conflicting_sp and conflicting_sp.user_id != student.id:
    conflicting_sp.student_id = f"110723102021-alt"
    db.flush()

# Student profile for demo student: only student_id is seeded — all details filled by student
stu_profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == student.id))
if not stu_profile:
    stu_profile = StudentProfile(
        user_id=student.id,
        student_id="110723102021",
    )
    db.add(stu_profile)
    db.flush()
else:
    # Only enforce the student_id; leave all other fields as-is (blank after reset above)
    stu_profile.student_id = "110723102021"
    db.flush()

db.commit()
db.close()
print("Database seeding completed successfully.")
print("College: JNN INSTITUTE")
print("Departments seeded:", len(department_names))
print("Demo accounts ready (password: DemoPass123!):")
print("  - Student:        student@jnn.edu.in (Anjani Chowdary - 110723102021)")
print("  - Class Incharge: incharge@jnn.edu.in (Vijaya Lakshmi K — AI&DS 4th Year)")
print("  - HOD:            hod.aids@jnn.edu.in (Dr. Nagarajan — AI&DS HOD)")
print("  - Principal:      principal@jnn.edu.in (Dr. G. Mohanbabu)")
print("  - Warden:         warden@jnn.edu.in (Mrs. Rama)")
print("  - Security Gate:  security@jnn.edu.in")

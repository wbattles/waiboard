import os
from datetime import datetime, timezone
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Text,
    DateTime,
    Boolean,
    ForeignKey,
    Table,
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

db_path = os.getenv("DATABASE_PATH", "./waiboard.db")
engine = create_engine(
    f"sqlite:///{db_path}", connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Many-to-many relationship between users and projects
user_projects = Table(
    "user_projects",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("project_id", Integer, ForeignKey("projects.id"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    projects = relationship("Project", secondary=user_projects, back_populates="users")
    assigned_tickets = relationship("Ticket", back_populates="assigned_user")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    acronym = Column(String(3), unique=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    users = relationship("User", secondary=user_projects, back_populates="projects")
    tickets = relationship(
        "Ticket", back_populates="project", cascade="all, delete-orphan"
    )


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, default="")
    column = Column(String, default="todo")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    assigned_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    project = relationship("Project", back_populates="tickets")
    assigned_user = relationship("User", back_populates="assigned_tickets")


def init_db():
    Base.metadata.create_all(bind=engine)
    _migrate()


def _migrate():
    """add missing columns to existing tables"""
    import sqlite3

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # get existing columns on tickets table
    cursor.execute("PRAGMA table_info(tickets)")
    existing = {row[1] for row in cursor.fetchall()}

    if "project_id" not in existing:
        cursor.execute(
            "ALTER TABLE tickets ADD COLUMN project_id INTEGER REFERENCES projects(id)"
        )

    if "assigned_user_id" not in existing:
        cursor.execute(
            "ALTER TABLE tickets ADD COLUMN assigned_user_id INTEGER REFERENCES users(id)"
        )

    conn.commit()
    conn.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

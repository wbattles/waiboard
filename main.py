from fastapi import FastAPI, Depends, HTTPException, Form, Response, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from datetime import timedelta

from database import init_db, get_db, Ticket, User, Project, ApiKey
from auth import (
    authenticate_user,
    create_access_token,
    get_current_user,
    get_admin_user,
    get_password_hash,
    verify_password,
    create_admin_if_none_exists,
    ACCESS_TOKEN_EXPIRE_HOURS,
)

app = FastAPI(title="Waiboard")

# Initialize database

init_db()

COLUMNS = ["todo", "inprogress", "testing", "done"]


class TicketCreate(BaseModel):
    title: str
    description: str = ""


class TicketUpdate(BaseModel):
    column: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_user_id: Optional[int] = None


class UserCreate(BaseModel):
    username: str
    password: str
    is_admin: bool = False


class PasswordChange(BaseModel):
    new_password: str


class ProjectCreate(BaseModel):
    name: str
    acronym: str
    user_ids: list[int] = []


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    acronym: Optional[str] = None
    user_ids: Optional[list[int]] = None


def ticket_to_dict(t: Ticket) -> dict:
    result = {
        "id": t.id,
        "ticket_number": t.ticket_number,
        "title": t.title,
        "description": t.description,
        "column": t.column,
        "assigned_user_id": t.assigned_user_id,
    }

    # Add project info if available
    if t.project:
        result["project"] = {
            "id": t.project.id,
            "name": t.project.name,
            "acronym": t.project.acronym,
        }

    # Add assigned user info if available
    if t.assigned_user:
        result["assigned_user"] = {
            "id": t.assigned_user.id,
            "username": t.assigned_user.username,
        }

    return result


# Auth endpoints


@app.get("/api/first-time-setup")
def check_first_time_setup(db: Session = Depends(get_db)):
    # Create admin user if no users exist
    create_admin_if_none_exists(db)
    user_count = db.query(User).count()
    return {"is_first_time": user_count <= 1}


@app.post("/api/login")
def login(
    response: Response,
    username: str = Form(),
    password: str = Form(),
    db: Session = Depends(get_db),
):
    user = authenticate_user(db, username, password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token(data={"sub": user.username})
    response.set_cookie(
        key="session_token",
        value=access_token,
        max_age=ACCESS_TOKEN_EXPIRE_HOURS * 3600,
        httponly=True,
        secure=False,  # Set to True in production with HTTPS
    )
    return {"message": "Login successful"}


@app.post("/api/logout")
def logout(response: Response):
    response.delete_cookie("session_token")
    return {"message": "Logged out"}


@app.get("/api/current-user")
def get_current_user_info(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "is_admin": current_user.is_admin,
    }


class MyPasswordChange(BaseModel):
    current_password: str
    new_password: str


@app.patch("/api/me/password")
def change_my_password(
    data: MyPasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="current password is incorrect")
    current_user.hashed_password = get_password_hash(data.new_password)
    db.commit()
    return {"message": "password updated"}


@app.get("/api/me/api-keys")
def get_my_api_keys(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    keys = db.query(ApiKey).filter(ApiKey.user_id == current_user.id).all()
    return [
        {
            "id": k.id,
            "key": k.key[:8] + "..." if len(k.key) > 8 else k.key,
            "created_at": k.created_at.isoformat() if k.created_at else None,
        }
        for k in keys
    ]


@app.post("/api/me/api-keys", status_code=201)
def create_api_key(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    import secrets

    raw_key = secrets.token_hex(32)
    api_key = ApiKey(key=raw_key, user_id=current_user.id)
    db.add(api_key)
    db.commit()
    db.refresh(api_key)
    # Return full key only on creation
    return {"id": api_key.id, "key": raw_key}


@app.delete("/api/me/api-keys/{key_id}")
def delete_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    api_key = (
        db.query(ApiKey)
        .filter(ApiKey.id == key_id, ApiKey.user_id == current_user.id)
        .first()
    )
    if not api_key:
        raise HTTPException(status_code=404, detail="api key not found")
    db.delete(api_key)
    db.commit()
    return {"message": "api key deleted"}


@app.get("/api/users")
def get_all_users(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    users = db.query(User).all()
    return [{"id": u.id, "username": u.username} for u in users]


# Admin endpoints


@app.get("/api/admin/users")
def get_users(
    admin_user: User = Depends(get_admin_user), db: Session = Depends(get_db)
):
    users = db.query(User).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "is_admin": u.is_admin,
            "created_at": u.created_at.isoformat(),
        }
        for u in users
    ]


@app.post("/api/admin/users", status_code=201)
def create_user(
    user_data: UserCreate,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    # Validate username length
    if len(user_data.username) > 15:
        raise HTTPException(
            status_code=400, detail="Username must be 15 characters or less"
        )

    # Check if username already exists
    existing_user = db.query(User).filter(User.username == user_data.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")

    new_user = User(
        username=user_data.username,
        hashed_password=get_password_hash(user_data.password),
        is_admin=user_data.is_admin,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "id": new_user.id,
        "username": new_user.username,
        "is_admin": new_user.is_admin,
        "created_at": new_user.created_at.isoformat(),
    }


@app.patch("/api/admin/users/{user_id}/password")
def change_user_password(
    user_id: int,
    password_data: PasswordChange,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    user_to_update = db.query(User).filter(User.id == user_id).first()
    if not user_to_update:
        raise HTTPException(status_code=404, detail="User not found")

    # Only the default admin can change the default admin's password
    if user_to_update.username == "admin" and admin_user.username != "admin":
        raise HTTPException(
            status_code=403, detail="Only the admin user can change the admin password"
        )

    user_to_update.hashed_password = get_password_hash(password_data.new_password)
    db.commit()
    return {"message": "Password updated"}


@app.delete("/api/admin/users/{user_id}")
def delete_user(
    user_id: int,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    user_to_delete = db.query(User).filter(User.id == user_id).first()
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="User not found")

    if user_to_delete.id == admin_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    if user_to_delete.username == "admin":
        raise HTTPException(
            status_code=400, detail="Cannot delete the default admin account"
        )

    db.delete(user_to_delete)
    db.commit()
    return {"message": "User deleted"}


# Admin project endpoints


@app.get("/api/admin/projects")
def get_all_projects(
    admin_user: User = Depends(get_admin_user), db: Session = Depends(get_db)
):
    projects = db.query(Project).all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "acronym": p.acronym,
            "user_count": len(p.users),
            "users": [{"id": u.id, "username": u.username} for u in p.users],
        }
        for p in projects
    ]


@app.post("/api/admin/projects", status_code=201)
def create_project(
    project: ProjectCreate,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):

    # Check if project with same name or acronym exists
    existing = (
        db.query(Project)
        .filter((Project.name == project.name) | (Project.acronym == project.acronym))
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400, detail="Project with this name or acronym already exists"
        )

    db_project = Project(name=project.name, acronym=project.acronym)

    # Add users to project
    if project.user_ids:
        users = db.query(User).filter(User.id.in_(project.user_ids)).all()
        db_project.users = users

    # Always add the admin user
    admin_user_db = db.query(User).filter(User.username == "admin").first()
    if admin_user_db and admin_user_db not in db_project.users:
        db_project.users.append(admin_user_db)

    db.add(db_project)
    db.commit()
    db.refresh(db_project)

    return {
        "id": db_project.id,
        "name": db_project.name,
        "acronym": db_project.acronym,
        "user_count": len(db_project.users),
        "users": [{"id": u.id, "username": u.username} for u in db_project.users],
    }


@app.patch("/api/admin/projects/{project_id}")
def update_project(
    project_id: int,
    project: ProjectUpdate,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):

    db_project = db.query(Project).filter(Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.name is not None:
        db_project.name = project.name
    if project.acronym is not None:
        db_project.acronym = project.acronym
    if project.user_ids is not None:
        users = db.query(User).filter(User.id.in_(project.user_ids)).all()
        # Always ensure admin user stays assigned
        admin_user_db = db.query(User).filter(User.username == "admin").first()
        if admin_user_db and admin_user_db not in users:
            users.append(admin_user_db)
        db_project.users = users

    db.commit()
    db.refresh(db_project)

    return {
        "id": db_project.id,
        "name": db_project.name,
        "acronym": db_project.acronym,
        "user_count": len(db_project.users),
        "users": [{"id": u.id, "username": u.username} for u in db_project.users],
    }


@app.delete("/api/admin/projects/{project_id}")
def delete_project(
    project_id: int,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):

    db_project = db.query(Project).filter(Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")

    db.delete(db_project)
    db.commit()
    return {"message": "Project deleted"}


# Ticket endpoints (now protected)


@app.get("/api/tickets")
def get_tickets(
    project_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Get user's projects (admins have access to all projects)
    if current_user.is_admin:
        # Admin can see all tickets
        query = db.query(Ticket)
        if project_id:
            query = query.filter(Ticket.project_id == project_id)
    else:
        user_project_ids = [p.id for p in current_user.projects]

        if not user_project_ids:
            return []  # User has no projects

        query = db.query(Ticket).filter(Ticket.project_id.in_(user_project_ids))

        if project_id:
            # Verify user has access to this project
            if project_id not in user_project_ids:
                raise HTTPException(
                    status_code=403, detail="Access denied to this project"
                )
            query = query.filter(Ticket.project_id == project_id)

    return [ticket_to_dict(t) for t in query.all()]


@app.post("/api/tickets", status_code=201)
def create_ticket(
    ticket: TicketCreate,
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Verify the project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Verify user has access to this project (admins have access to all projects)
    if not current_user.is_admin:
        user_project_ids = [p.id for p in current_user.projects]
        if project_id not in user_project_ids:
            raise HTTPException(status_code=403, detail="Access denied to this project")

    # Get next ticket number for this project
    from sqlalchemy import func

    max_num = (
        db.query(func.max(Ticket.ticket_number))
        .filter(Ticket.project_id == project_id)
        .scalar()
    ) or 0

    db_ticket = Ticket(
        title=ticket.title,
        description=ticket.description,
        project_id=project_id,
        ticket_number=max_num + 1,
    )
    db.add(db_ticket)
    db.commit()
    db.refresh(db_ticket)
    return ticket_to_dict(db_ticket)


@app.patch("/api/tickets/{ticket_id}")
def update_ticket(
    ticket_id: int,
    ticket: TicketUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not db_ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Verify user has access to this ticket's project (admins have access to all)
    if not current_user.is_admin:
        user_project_ids = [p.id for p in current_user.projects]
        if db_ticket.project_id not in user_project_ids:
            raise HTTPException(status_code=403, detail="Access denied to this ticket")

    if ticket.column is not None and ticket.column in COLUMNS:
        db_ticket.column = ticket.column
    if ticket.title is not None:
        db_ticket.title = ticket.title
    if ticket.description is not None:
        db_ticket.description = ticket.description
    if ticket.assigned_user_id is not None:
        # Validate that the user exists
        if ticket.assigned_user_id == 0:  # 0 means unassign
            db_ticket.assigned_user_id = None
        else:
            user_exists = (
                db.query(User).filter(User.id == ticket.assigned_user_id).first()
            )
            if user_exists:
                db_ticket.assigned_user_id = ticket.assigned_user_id
    db.commit()
    db.refresh(db_ticket)
    return ticket_to_dict(db_ticket)


@app.delete("/api/tickets/{ticket_id}")
def delete_ticket(
    ticket_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not db_ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Verify user has access to this ticket's project (admins have access to all)
    if not current_user.is_admin:
        user_project_ids = [p.id for p in current_user.projects]
        if db_ticket.project_id not in user_project_ids:
            raise HTTPException(status_code=403, detail="Access denied to this ticket")

    db.delete(db_ticket)
    db.commit()
    return {"ok": True}


@app.get("/api/projects")
def get_user_projects(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if current_user.is_admin:
        # Admin can see all projects
        projects = db.query(Project).all()
        return [{"id": p.id, "name": p.name, "acronym": p.acronym} for p in projects]
    else:
        return [
            {"id": p.id, "name": p.name, "acronym": p.acronym}
            for p in current_user.projects
        ]


@app.get("/api/projects/{project_id}/users")
def get_project_users(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return [{"id": u.id, "username": u.username} for u in project.users]


# Route handlers for protected pages


@app.get("/")
def serve_index(request: Request):
    try:
        # Try to get current user, but don't fail if not authenticated
        from auth import get_current_user

        user = get_current_user(
            session_token=request.cookies.get("session_token"), db=next(get_db())
        )
        return FileResponse("static/index.html")
    except HTTPException:
        # Not authenticated, redirect to login
        return RedirectResponse("/login")


@app.get("/admin")
def serve_admin(request: Request):
    try:
        from auth import get_admin_user, get_current_user

        user = get_current_user(
            session_token=request.cookies.get("session_token"), db=next(get_db())
        )
        if not user.is_admin:
            raise HTTPException(status_code=403, detail="Admin access required")
        return FileResponse("static/admin.html")
    except HTTPException:
        # Not authenticated or not admin, redirect to login
        return RedirectResponse("/login")


@app.get("/login")
def serve_login():
    return FileResponse("static/login.html")


@app.get("/settings")
def serve_settings(request: Request):
    try:
        from auth import get_current_user

        user = get_current_user(
            session_token=request.cookies.get("session_token"), db=next(get_db())
        )
        return FileResponse("static/settings.html")
    except HTTPException:
        return RedirectResponse("/login")


# Mount static files for CSS/JS (these don't need auth)
app.mount("/static", StaticFiles(directory="static"), name="static")


# Catch-all for other static files
@app.get("/{file_path:path}")
def serve_static_files(file_path: str):
    # Allow access to CSS, JS, and other assets
    if file_path.endswith((".css", ".js", ".png", ".jpg", ".ico")):
        return FileResponse(f"static/{file_path}")
    # Redirect everything else to login
    return RedirectResponse("/login")

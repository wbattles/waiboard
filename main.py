from fastapi import FastAPI, Depends, HTTPException, Form, Response, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from datetime import timedelta

from database import init_db, get_db, Ticket, User
from auth import (
    authenticate_user,
    create_access_token,
    get_current_user,
    get_admin_user,
    get_password_hash,
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


class UserCreate(BaseModel):
    username: str
    password: str
    is_admin: bool = False


class PasswordChange(BaseModel):
    new_password: str


def ticket_to_dict(t: Ticket) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "column": t.column,
    }


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
    if len(user_data.username) > 30:
        raise HTTPException(
            status_code=400, detail="Username must be 30 characters or less"
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


# Ticket endpoints (now protected)


@app.get("/api/tickets")
def get_tickets(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return [ticket_to_dict(t) for t in db.query(Ticket).all()]


@app.post("/api/tickets", status_code=201)
def create_ticket(
    ticket: TicketCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_ticket = Ticket(title=ticket.title, description=ticket.description)
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
    if ticket.column is not None and ticket.column in COLUMNS:
        db_ticket.column = ticket.column
    if ticket.title is not None:
        db_ticket.title = ticket.title
    if ticket.description is not None:
        db_ticket.description = ticket.description
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
    db.delete(db_ticket)
    db.commit()
    return {"ok": True}


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

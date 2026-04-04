from fastapi import FastAPI, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from database import init_db, get_db, Ticket

app = FastAPI(title="Waiboard")

init_db()

COLUMNS = ["todo", "inprogress", "testing", "done"]


class TicketCreate(BaseModel):
    title: str
    description: str = ""


class TicketUpdate(BaseModel):
    column: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None


def ticket_to_dict(t: Ticket) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "column": t.column,
    }


@app.get("/api/tickets")
def get_tickets(db: Session = Depends(get_db)):
    return [ticket_to_dict(t) for t in db.query(Ticket).all()]


@app.post("/api/tickets", status_code=201)
def create_ticket(ticket: TicketCreate, db: Session = Depends(get_db)):
    db_ticket = Ticket(title=ticket.title, description=ticket.description)
    db.add(db_ticket)
    db.commit()
    db.refresh(db_ticket)
    return ticket_to_dict(db_ticket)


@app.patch("/api/tickets/{ticket_id}")
def update_ticket(ticket_id: int, ticket: TicketUpdate, db: Session = Depends(get_db)):
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
def delete_ticket(ticket_id: int, db: Session = Depends(get_db)):
    db_ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not db_ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    db.delete(db_ticket)
    db.commit()
    return {"ok": True}


app.mount("/", StaticFiles(directory="static", html=True), name="static")

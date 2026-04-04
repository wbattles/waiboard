# waiboard

A simple kanban board.

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Open http://localhost:8000

## Run with Docker

```bash
docker compose up
```

Open http://localhost:8000

Data persists in `./data/waiboard.db`.

## Helm

```bash
helm install waiboard ./charts/waiboard
```

With persistent storage:

```bash
helm install waiboard ./charts/waiboard --set persistence.enabled=true
```

Persistence options:

| Value | Default | Description |
|---|---|---|
| `persistence.enabled` | `false` | use a PVC for the database |
| `persistence.size` | `1Gi` | PVC size |
| `persistence.storageClass` | `""` | storage class (uses cluster default if empty) |

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_PATH` | `./waiboard.db` | Path to the SQLite database file |

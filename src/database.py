import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Migration for relative import mapping
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from utils import BASE_MEDIA_PATH

DB_PATH = BASE_MEDIA_PATH / "database" / "aia_studio.db"

DB_PATH.parent.mkdir(parents=True, exist_ok=True)
engine = create_engine(
    f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

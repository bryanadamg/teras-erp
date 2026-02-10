import threading
import logging
import os
from pathlib import Path
from typing import Generator, Optional, List
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from app.db.base import Base
from app.schemas import DatabaseResponse, ConnectionProfile

logger = logging.getLogger(__name__)

class DatabaseManager:
    _instance = None
    _init_lock = threading.Lock()

    def __init__(self):
        self._engine = None
        self._session_factory = None
        self._current_url = None
        self._profiles_path = Path("database_profiles.json")

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            with cls._init_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def initialize(self, database_url: str) -> DatabaseResponse:
        """
        Initializes or re-initializes the database engine.
        Handles schema creation and initial seeding if necessary.
        """
        with self._init_lock:
            try:
                if self._engine:
                    logger.info("Disposing existing database engine...")
                    self._engine.dispose()

                self._current_url = database_url
                logger.info(f"Connecting to database: {database_url}")

                # SQLite specific arguments
                connect_args = {"check_same_thread": False} if "sqlite" in database_url else {}
                
                self._engine = create_engine(
                    database_url,
                    pool_pre_ping=True,
                    connect_args=connect_args
                )
                
                self._session_factory = sessionmaker(
                    autocommit=False,
                    autoflush=False,
                    bind=self._engine
                )

                # Ensure tables exist
                Base.metadata.create_all(bind=self._engine)
                
                # Note: Run migrations here if using Alembic
                # self._run_migrations()

                return DatabaseResponse(message="Database initialized successfully", status=True)
            except Exception as e:
                logger.error(f"Database initialization failed: {e}")
                return DatabaseResponse(message=str(e), status=False)

    def switch_database(self, new_url: str) -> DatabaseResponse:
        """
        Hot-swaps the database connection at runtime.
        """
        logger.info(f"Switching database to: {new_url}")
        return self.initialize(new_url)

    def get_session(self) -> Generator[Session, None, None]:
        if not self._session_factory:
            raise RuntimeError("DatabaseManager not initialized.")
        
        db = self._session_factory()
        try:
            yield db
        finally:
            db.close()

    @property
    def engine(self):
        if not self._engine:
            raise RuntimeError("DatabaseManager not initialized.")
        return self._engine

    @property
    def current_url(self):
        return self._current_url

# Global instance
db_manager = DatabaseManager.get_instance()
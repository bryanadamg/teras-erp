import threading
import logging
import os
import subprocess
import shutil
from datetime import datetime
from pathlib import Path
from typing import Generator, Optional, List
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.engine import make_url
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
        self._snapshots_dir = Path("snapshots")
        self._snapshots_dir.mkdir(exist_ok=True)

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            with cls._init_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def create_snapshot(self, label: str = "manual") -> DatabaseResponse:
        """Creates a snapshot of the current database."""
        if not self._current_url:
            return DatabaseResponse(message="No database connection", status=False)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"snapshot_{label}_{timestamp}"
        
        try:
            if "postgresql" in self._current_url:
                # Handle PostgreSQL via pg_dump
                # Note: This requires postgresql-client installed in the container
                url = make_url(self._current_url)
                
                env = os.environ.copy()
                if url.password:
                    env["PGPASSWORD"] = url.password
                
                filepath = self._snapshots_dir / f"{filename}.sql"
                
                cmd = [
                    "pg_dump",
                    "-h", url.host or "localhost",
                    "-p", str(url.port or 5432),
                    "-U", url.username or "postgres",
                    "-f", str(filepath),
                    url.database
                ]
                subprocess.run(cmd, env=env, check=True)
                return DatabaseResponse(message=f"Postgres snapshot created: {filename}", status=True, data={"filename": f"{filename}.sql"})

            elif "sqlite" in self._current_url:
                # Handle SQLite via file copy
                db_path = self._current_url.replace("sqlite:///", "")
                filepath = self._snapshots_dir / f"{filename}.sqlite"
                shutil.copy2(db_path, filepath)
                return DatabaseResponse(message=f"SQLite snapshot created: {filename}", status=True, data={"filename": f"{filename}.sqlite"})

            return DatabaseResponse(message="Unsupported database provider for snapshots", status=False)
        except Exception as e:
            logger.error(f"Snapshot failed: {e}")
            return DatabaseResponse(message=f"Snapshot failed: {str(e)}", status=False)

    def list_snapshots(self) -> List[dict]:
        """Lists all available snapshots."""
        files = []
        for f in self._snapshots_dir.glob("*"):
            stats = f.stat()
            files.append({
                "name": f.name,
                "size": stats.st_size,
                "created_at": datetime.fromtimestamp(stats.st_ctime).isoformat()
            })
        return sorted(files, key=lambda x: x["created_at"], reverse=True)

    def get_snapshot_path(self, filename: str) -> Path:
        """Returns the absolute path to a snapshot file."""
        return self._snapshots_dir / filename

    def restore_snapshot(self, filename: str) -> DatabaseResponse:
        """Restores the current database from a snapshot."""
        if not self._current_url:
            return DatabaseResponse(message="No active database connection", status=False)
        
        filepath = self._snapshots_dir / filename
        if not filepath.exists():
            return DatabaseResponse(message="Snapshot file not found", status=False)

        try:
            # 1. Close current connections
            if self._engine:
                self._engine.dispose()

            if "postgresql" in self._current_url:
                url = make_url(self._current_url)
                
                env = os.environ.copy()
                if url.password:
                    env["PGPASSWORD"] = url.password
                
                cmd = [
                    "psql", 
                    "-h", url.host or "localhost",
                    "-p", str(url.port or 5432),
                    "-U", url.username or "postgres",
                    "-d", url.database,
                    "-f", str(filepath)
                ]
                subprocess.run(cmd, env=env, check=True)
                
            elif "sqlite" in self._current_url:
                db_path = self._current_url.replace("sqlite:///", "")
                shutil.copy2(filepath, db_path)

            # 2. Re-initialize
            return self.initialize(self._current_url)
        except Exception as e:
            logger.error(f"Restore failed: {e}")
            return DatabaseResponse(message=f"Restore failed: {str(e)}", status=False)

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
                
                # SQLAlchemy Pooling Configuration for High Concurrency
                self._engine = create_engine(
                    database_url,
                    pool_pre_ping=True,
                    pool_size=20,         # Base pool size
                    max_overflow=10,      # Temporary spike allowance
                    pool_recycle=3600,    # Refresh connections hourly
                    connect_args=connect_args
                )
                
                self._session_factory = sessionmaker(
                    autocommit=False,
                    autoflush=False,
                    bind=self._engine
                )

                # Ensure tables exist
                Base.metadata.create_all(bind=self._engine)
                
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
    def session_factory(self):
        if not self._session_factory:
            raise RuntimeError("DatabaseManager not initialized.")
        return self._session_factory

    @property
    def current_url(self):
        return self._current_url

# Global instance
db_manager = DatabaseManager.get_instance()

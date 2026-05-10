FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN addgroup --system appgroup && adduser --system --group appuser

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code, Alembic config, and startup scripts
COPY app app
COPY alembic alembic
COPY alembic.ini alembic.ini
COPY scripts scripts

# Chown the application directory to the non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

CMD ["bash", "-c", "python -m app.backend_pre_start && bash scripts/migrate.sh && python -m app.db.init_db && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
FROM python:3.11-slim

# Create a non-root user
RUN addgroup --system appgroup && adduser --system --group appuser

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app app

# Chown the application directory to the non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

CMD ["bash", "-c", "python -m app.backend_pre_start && python -m app.db.init_db && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
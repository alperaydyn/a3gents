FROM mcr.microsoft.com/playwright/python:v1.48.0-jammy

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN mkdir -p static output session

# Persistent volumes
VOLUME ["/app/output", "/app/session"]

ENV SESSION_DIR=/app/session
ENV OUTPUT_DIR=/app/output

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
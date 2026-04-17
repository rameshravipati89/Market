FROM python:3.12-slim

WORKDIR /app

# System deps for lxml / trafilatura
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libxml2-dev libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install spaCy model directly (en_core_web_lg 3.7.1 matches spacy 3.7.4)
RUN pip install --no-cache-dir \
    https://github.com/explosion/spacy-models/releases/download/en_core_web_lg-3.7.1/en_core_web_lg-3.7.1-py3-none-any.whl

# Copy pipeline code
COPY pipeline/ ./pipeline/

CMD ["python", "-u", "-m", "pipeline.main"]

# Bridge-Node Docker Image
# Multi-agent collaboration server (Python + Node.js)

FROM python:3.11-slim-bookworm

# Labels
LABEL maintainer="BridgeNode Team"
LABEL description="Multi-agent collaboration server with Python backend and Node.js examples"

# Install system dependencies including Node.js 18.x
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8888 \
    NODE_ENV=production

# Create app directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy package.json for Node.js dependencies
COPY package.json .

# Install Node.js dependencies
RUN npm install --production

# Copy application code
COPY . .

# Create non-root user for security
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE ${PORT}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8888/api/status')" || exit 1

# Run the application
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8888"]

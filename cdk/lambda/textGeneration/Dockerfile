FROM public.ecr.aws/lambda/python:3.12 as builder

# Update glib2 for CVE-2025-13601 mitigation (dnf in AL2023, fallback to yum)
RUN if command -v dnf >/dev/null 2>&1; then \
        dnf -y upgrade glib2 && dnf clean all; \
    else \
        yum -y update glib2 && yum clean all; \
    fi

# Install build-time dependencies in a single layer (kept out of final image)
RUN if command -v dnf >/dev/null 2>&1; then \
        dnf -y install postgresql-devel gcc libpq gcc-c++ python3-devel && \
        dnf clean all; \
    else \
        yum -y install postgresql-devel gcc libpq gcc-c++ python3-devel && \
        yum clean all; \
    fi && \
    rm -rf /var/cache/dnf /var/cache/yum /tmp/* /var/tmp/*

# Install Python deps into a portable path
WORKDIR /opt
COPY requirements.txt ./
RUN pip install --no-cache-dir --target /opt/python -r requirements.txt

FROM public.ecr.aws/lambda/python:3.12

# Update glib2 in the runtime image as well
RUN if command -v dnf >/dev/null 2>&1; then \
        dnf -y upgrade glib2 && dnf clean all; \
    else \
        yum -y update glib2 && yum clean all; \
    fi && \
    rm -rf /var/cache/dnf /var/cache/yum /tmp/* /var/tmp/*

WORKDIR ${LAMBDA_TASK_ROOT}

# Copy only the optimized Python dependencies (no build tools)
COPY --from=builder /opt/python ${LAMBDA_RUNTIME_DIR}

# Copy source code (done last for better layer caching)
COPY src/ ${LAMBDA_TASK_ROOT}

# Set environment variables for Python optimization
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONOPTIMIZE=2

# Validate the installation and clean up any remaining artifacts
RUN python -c "import sys; print(f'Python version: {sys.version}')" && \
    find ${LAMBDA_TASK_ROOT} -name "*.pyc" -delete && \
    find ${LAMBDA_TASK_ROOT} -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

CMD [ "main.handler" ]
# Dependency Management Guide

## Overview

This document explains how Python dependencies are locked and managed across Lambda functions in this project to ensure reproducible builds and security.

## Lambda Functions with Locked Dependencies

The following Lambda functions have their dependencies locked using pip-tools:

| Lambda Function    | Location                       | Requirements File  |
| ------------------ | ------------------------------ | ------------------ |
| `textGeneration`   | `cdk/lambda/textGeneration/`   | `requirements.txt` |
| `practiceMaterial` | `cdk/lambda/practiceMaterial/` | `requirements.txt` |

## How Dependencies Were Locked

### 1. Requirements Structure

Each Lambda function uses a two-file approach:

- `requirements.in` - Contains high-level dependencies (what we directly need)
- `requirements.txt` - Contains all dependencies with exact versions (generated from requirements.in)

### 2. Locking Process

Dependencies were locked using pip-tools within locally built Docker containers to ensure consistency.

Steps:

```bash
# Navigate to the Lambda function directory (example: textGeneration)
cd cdk/lambda/textGeneration

# Build the Docker image
docker build -t textgeneration-img .

# Run pip-tools inside the container
docker run --rm -v ${PWD}:/app -w /app --entrypoint="" textgeneration-img bash -c "
  pip install pip-tools &&
  pip-compile requirements.in
"
```

### 3. Key Locked Dependencies

Example from the textGeneration Lambda function:

**AWS Services:**

```
boto3>=1.35.0
botocore>=1.35.0
```

**LangChain & AI:**

```
langchain>=0.3.0
langchain-aws>=0.2.0
langchain-postgres>=0.0.12
```

**Database Connectivity:**

```
psycopg2-binary>=2.9.0
psycopg[binary]>=3.1
```

## How to Modify Dependencies

### Adding New Dependencies

1. **Add to requirements.in:**
   Add the new package to requirements.in. You may optionally specify a version (e.g., requests>=2.31.0 or just requests).

2. **Build Docker image locally:**
   Open the Docker Desktop app and keep it running during this process.
   In the terminal run the following commands in order to build the Docker image locally.

   ```bash
   # Navigate to the Lambda function directory (example: textGeneration)
   cd cdk/lambda/textGeneration

   # Build the Docker image locally
   docker build -t textgeneration-img .
   ```

3. **Regenerate requirements.txt:**
   Once the image has been built, run this command in the terminal to compile the requirements and regenerate the requirements.txt version:

   ```bash
   # Run pip-compile inside the built container
   docker run --rm -v ${PWD}:/app -w /app textgeneration-img bash -c "
     pip install pip-tools &&
     pip-compile requirements.in
   "
   ```

4. **Commit and Push Changes:**
   After regenerating requirements.txt, commit and push the updated files to trigger the deployment pipeline.

   **Option 1: Using Git in the Terminal**

   ```bash
   # Stage the updated files
   git add requirements.in requirements.txt

   # Commit with a descriptive message
   git commit -m "Add new dependency to textGeneration Lambda"

   # Push to your working branch (e.g., main or dev)
   git push origin <branch-name>
   ```

   **Option 2: Using Git in Your IDE (e.g., VS Code)**

   1. Go to the Source Control tab.

   2. You'll see requirements.in and requirements.txt listed under Changes.

   3. Write a commit message (e.g., "Add new dependency to textGeneration Lambda").

   4. Click ✓ Commit.

   5. Click the … menu or right-click → Push to send your changes to the remote repository.

Once the push is complete, CodePipeline will automatically detect the change, rebuild the Docker image, and redeploy the Lambda function.

### Updating Existing Dependencies

1. **Update version in requirements.in:**

   ```bash
   # Change from: langchain>=0.3.0
   # To: langchain>=0.3.5
   ```

2. **Build Docker image locally:**
   Make sure to keep Docker Desktop running during this process.

   ```bash
   # Navigate to the Lambda function directory (example: textGeneration)
   cd cdk/lambda/textGeneration

   # Build the Docker image locally
   docker build -t textgeneration-img .
   ```

3. **Regenerate requirements.txt:**

   ```bash
   # Run pip-compile inside the built container
   docker run --rm -v ${PWD}:/app -w /app textgeneration-img bash -c "
     pip install pip-tools &&
     pip-compile requirements.in
   "
   ```

4. **Commit and Push Changes:**

Once `requirements.txt` has been updated, commit and push the changes to trigger the CI/CD pipeline and redeploy the updated Lambda function.

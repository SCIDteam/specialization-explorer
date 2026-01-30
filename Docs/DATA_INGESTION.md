# Data Ingestion Documentation

## Overview

The Specialization Explorer platform implements a sophisticated, event-driven data ingestion pipeline that processes educational content from various sources. The pipeline is designed to handle textbook metadata, web content scraping, image extraction, and media processing (PDFs, PowerPoint presentations, and transcripts).

This document provides a comprehensive overview of how data flows through the system, from initial CSV upload to final database storage with embeddings.

---

## Architecture Overview

The data ingestion pipeline consists of the following key components:

1. **S3 CSV Bucket**: Entry point for data ingestion via CSV file uploads
2. **CSV Processor Lambda**: Parses CSV files and dispatches processing jobs
3. **SQS FIFO Queues**: Rate-limited queues for textbook and media processing
4. **Job Processor Lambdas**: Coordinate and trigger Glue jobs
5. **AWS Glue Jobs**: Heavy-lifting ETL jobs for data processing and embedding generation
6. **RDS PostgreSQL Database**: Final storage for all processed data

```
┌─────────────────────┐
│   CSV Upload to     │
│     S3 Bucket       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  CSV Processor      │
│     Lambda          │
└──────┬──────┬───────┘
       │      │
       │      └──────────────────┐
       ▼                         ▼
┌──────────────────┐    ┌──────────────────┐
│   Textbook       │    │     Media        │
│ Ingestion Queue  │    │ Ingestion Queue  │
│   (SQS FIFO)     │    │   (SQS FIFO)     │
└─────────┬────────┘    └─────────┬────────┘
          │                       │
          ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│ Job Processor    │    │ Media Job        │
│     Lambda       │    │ Processor Lambda │
└─────────┬────────┘    └─────────┬────────┘
          │                       │
          ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│  Data Processing │    │ Media Processing │
│    Glue Job      │    │    Glue Job      │
└─────────┬────────┘    └─────────┬────────┘
          │                       │
          └───────────┬───────────┘
                      ▼
              ┌───────────────┐
              │ RDS PostgreSQL│
              │   Database    │
              └───────────────┘
```

---

## Detailed Component Breakdown

### 1. CSV Bucket (S3)

**Purpose**: Entry point for all data ingestion operations.

**Configuration**:

- Bucket Name: `{stack-id}-csv-ingestion-bucket`
- Encryption: SSL enforced
- CORS: Enabled for web uploads
- Auto-delete: Enabled (for development/testing)

**Trigger**: Any `.csv` file uploaded to this bucket triggers the CSV Processor Lambda.

**Expected CSV Format**:
The CSV file should contain rows with the following information:

- Textbook metadata (title, author, subject, etc.)
- Source URLs for web content
- References to media items (PDFs, PowerPoints, video URLs)

---

### 2. CSV Processor Lambda

**Function**: `{stack-id}-CsvProcessorFunction`

**Responsibilities**:

1. Parse uploaded CSV files
2. Validate data format and required fields
3. Create or update textbook records in the database
4. Dispatch textbook processing jobs to the Textbook Ingestion Queue
5. Dispatch media processing jobs to the Media Ingestion Queue

**Environment Variables**:

- `QUEUE_URL`: URL of the Textbook Ingestion Queue
- `MEDIA_QUEUE_URL`: URL of the Media Ingestion Queue
- `REGION`: AWS region

**Timeout**: 10 minutes  
**Memory**: 512 MB  
**VPC**: Runs in VPC with database access

**Output**: Sends JSON messages to SQS queues containing:

- `textbook_id`: Unique identifier for the textbook
- `source_url`: URL of the content to process
- `batch_id`: Unique identifier for tracking this ingestion batch
- Additional metadata as needed

---

### 3. SQS Queues

#### Textbook Ingestion Queue

**Queue Name**: `{stack-id}-textbook-ingestion-queue.fifo`

**Configuration**:

- Type: FIFO (First-In-First-Out)
- Content-based deduplication: Enabled
- Visibility timeout: 5 minutes
- Message retention: 14 days
- Dead Letter Queue: Yes (max 10 retries)

**Purpose**: Rate-limits textbook processing to prevent overwhelming downstream services and APIs.

#### Media Ingestion Queue

**Queue Name**: `{stack-id}-media-ingestion-queue.fifo`

**Configuration**:

- Type: FIFO (First-In-First-Out)
- Content-based deduplication: Enabled
- Visibility timeout: 10 minutes (longer for media processing)
- Message retention: 14 days
- Dead Letter Queue: Yes (max 5 retries)

**Purpose**: Handles processing of supplementary media like PDFs, PowerPoint presentations, and transcripts.

---

### 4. Job Processor Lambdas

#### Textbook Job Processor

**Function**: `{stack-id}-job-processor`

**Responsibilities**:

1. Consume messages from Textbook Ingestion Queue
2. Check current Glue job concurrency
3. Start Data Processing Glue job with appropriate parameters
4. Pass textbook metadata and configuration to Glue

**Environment Variables**:

- `GLUE_JOB_NAME`: Name of the data processing Glue job
- `MAX_CONCURRENT_GLUE_JOBS`: Maximum concurrent Glue jobs (default: 3)
- `DATA_PROCESSING_BUCKET`: S3 bucket for processing
- `REGION`: AWS region

**Event Source Mapping**:

- Batch size: 1 message at a time
- Max concurrency: 2 parallel executions

#### Media Job Processor

**Function**: `{stack-id}-media-job-processor`

**Responsibilities**:

1. Consume messages from Media Ingestion Queue
2. Check current Glue job concurrency for media processing
3. Start Media Processing Glue job with appropriate parameters

**Environment Variables**:

- `GLUE_JOB_NAME`: Name of the media processing Glue job
- `MAX_CONCURRENT_GLUE_JOBS`: Maximum concurrent media jobs (default: 10)
- `REGION`: AWS region

**Event Source Mapping**:

- Batch size: 1 message at a time
- Max concurrency: 10 parallel executions

---

### 5. AWS Glue Jobs

#### Data Processing Job

**Job Name**: `{stack-id}-data-processing-job`

**Script Location**: `s3://{glue-bucket}/glue/scripts/data_processing.py`

**Responsibilities**:

1. **Web Scraping**: Extract content from OpenStax and other educational websites
2. **Content Parsing**: Parse HTML and extract meaningful text, images, and metadata
3. **Text Chunking**: Split content into semantically meaningful chunks for embedding
4. **Image Processing**: Extract and catalog images with descriptions
5. **Embedding Generation**: Generate embeddings using AWS Bedrock (Cohere Embed v4)
6. **Database Storage**: Store all processed data in PostgreSQL via RDS Proxy

**Key Parameters**:

- `--CSV_BUCKET`: S3 bucket containing source data
- `--GLUE_BUCKET`: S3 bucket for temporary storage
- `--rds_secret`: Secrets Manager secret for database credentials
- `--rds_proxy_endpoint`: RDS Proxy endpoint for database connection
- `--SQS_QUEUE_URL`: Queue URL for job coordination
- `--pipeline_mode`: "full_update" or "incremental"
- `--batch_id`: Unique identifier for this processing batch
- `--embedding_model_id`: Bedrock model ID (cohere.embed-v4:0)

**Python Dependencies**:

- `scrapy`: Web scraping framework
- `beautifulsoup4==4.14.2`: HTML parsing
- `pandas==2.3.3`: Data manipulation
- `psycopg2-binary==2.9.10`: PostgreSQL connector
- `langchain-text-splitters==1.0.0`: Intelligent text chunking
- `langchain-aws==1.0.0`: AWS Bedrock integration
- `langchain-postgres==0.0.16`: Vector store for PostgreSQL
- `boto3==1.40.72`: AWS SDK

**Resource Configuration**:

- Max concurrent runs: 3
- Max capacity: 2 DPU (Data Processing Units)
- Timeout: 2880 minutes (48 hours)
- Glue version: 5.0
- Python version: 3

**Network Configuration**:

- Runs in VPC with connection to RDS database
- Uses Glue VPC connection for secure database access

**Processing Flow**:

1. Receive textbook metadata from SQS message
2. Scrape content from source URL
3. Extract chapters, sections, and subsections
4. Extract and process images
5. Generate text chunks with semantic boundaries
6. Create embeddings for each chunk using Bedrock
7. Store textbook metadata, sections, chunks, embeddings, and media items in database
8. Update job status and metrics

#### Media Processing Job

**Job Name**: `{stack-id}-media-processing-job`

**Script Location**: `s3://{glue-bucket}/glue/scripts/media_processing.py`

**Responsibilities**:

1. **PDF Processing**: Extract text and structure from PDF documents
2. **PowerPoint Processing**: Extract text and slides from PPTX files
3. **Web Transcript Processing**: Scrape and parse video transcripts from web pages
4. **Embedding Generation**: Generate embeddings for extracted content
5. **Database Storage**: Link processed media to textbook records

**Key Parameters**:

- `--GLUE_BUCKET`: S3 bucket for temporary storage
- `--rds_secret`: Secrets Manager secret for database credentials
- `--rds_proxy_endpoint`: RDS Proxy endpoint for database connection
- `--SQS_QUEUE_URL`: Media queue URL for job coordination
- `--embedding_model_id`: Bedrock model ID (cohere.embed-v4:0)

**Python Dependencies**:

- `PyPDF2==3.0.1`: PDF parsing
- `python-pptx==0.6.21`: PowerPoint processing
- `beautifulsoup4==4.12.2`: HTML/transcript parsing
- `pandas==2.3.3`: Data manipulation
- `psycopg2-binary==2.9.10`: PostgreSQL connector
- `langchain-*`: Text splitting and embedding generation
- `boto3==1.40.72`: AWS SDK

**Resource Configuration**:

- Max concurrent runs: 10
- Max capacity: 2 DPU
- Timeout: 2880 minutes (48 hours)
- Glue version: 5.0
- Python version: 3

**⚠️ Current Limitations**:

**VIDEO TRANSCRIPT EXTRACTION IS NOT YET IMPLEMENTED**

The current system does **not** extract video transcripts automatically. This functionality needs to be developed and integrated. Future implementation should:

1. Accept video URLs (YouTube, Vimeo, etc.)
2. Extract transcript/caption data using appropriate APIs
3. Process and chunk transcript text
4. Generate embeddings for searchability
5. Link transcripts to relevant textbook sections

This is a **planned feature** that requires additional development work.

---

### 6. Database Storage

All processed data is stored in the PostgreSQL database managed by RDS. The relevant tables include:

#### `textbooks` Table

Stores textbook metadata:

- `textbook_id` (Primary Key)
- `title`, `subject`, `author`
- `source_url`, `cover_image_url`
- Created/updated timestamps

#### `sections` Table

Stores hierarchical content structure:

- `section_id` (Primary Key)
- `textbook_id` (Foreign Key)
- `title`, `content`, `section_type`
- `chapter_number`, `section_number`
- Parent-child relationships

#### `chunk_metadata` Table

Stores text chunks with embeddings:

- `chunk_id` (Primary Key)
- `section_id` (Foreign Key)
- `chunk_text`, `chunk_index`
- `embedding` (vector column for pgvector)

#### `media_items` Table

Stores media references:

- `media_id` (Primary Key)
- `textbook_id`, `section_id` (Foreign Keys)
- `media_type` (image, pdf, powerpoint, video_transcript)
- `url`, `description`
- `chapter_number`, `chapter_title`

#### `ingest_jobs` Table

Tracks ingestion job status:

- `job_id` (Primary Key)
- `textbook_id` (Foreign Key)
- `job_status`, `job_error`
- `total_sections`, `ingested_sections`
- Start/end timestamps

---

## Data Flow Example

### Example: Uploading a Textbook CSV

1. **Admin uploads CSV** to S3 bucket via the admin panel

   - CSV contains: Title, Subject, Source URL, Author, etc.

2. **S3 triggers CSV Processor Lambda**

   - Lambda reads the CSV file
   - Creates/updates textbook record in `textbooks` table
   - Creates ingest job record in `ingest_jobs` table
   - Sends message to Textbook Ingestion Queue

3. **Job Processor Lambda receives SQS message**

   - Checks Glue job concurrency (max 3)
   - Starts Data Processing Glue job with textbook metadata

4. **Data Processing Glue Job executes**

   - Scrapes content from source URL (e.g., OpenStax)
   - Extracts chapters and sections
   - Downloads and catalogs images
   - Splits text into semantic chunks
   - Generates embeddings using Bedrock Cohere Embed v4
   - Stores all data in PostgreSQL

5. **Updates job status**
   - Updates `ingest_jobs` table with completion status
   - Admin can monitor progress via the admin panel

### Example: Processing Media Items

1. **CSV Processor identifies media items** in the CSV

   - PDF URLs, PowerPoint URLs, or transcript URLs
   - Sends messages to Media Ingestion Queue

2. **Media Job Processor Lambda receives messages**

   - Starts Media Processing Glue job for each item

3. **Media Processing Glue Job executes**

   - Downloads PDF/PPTX file or scrapes transcript
   - Extracts text content
   - Generates embeddings
   - Links to parent textbook in `media_items` table

4. **Completion**
   - Media items appear in admin panel under textbook details
   - Content is searchable via the chat interface

---

## Configuration and Customization

### Embedding Model

The system uses **Cohere Embed v4** via AWS Bedrock for generating embeddings:

- Model ID: `cohere.embed-v4:0`
- Embedding dimension: 1024
- Supports semantic search and similarity matching

### Processing Modes

The Data Processing Glue job supports two modes:

1. **Full Update** (`pipeline_mode: "full_update"`)

   - Processes all content from scratch
   - Replaces existing data
   - Recommended for initial ingestion or major updates

2. **Incremental** (`pipeline_mode: "incremental"`)
   - Processes only new or changed content
   - Preserves existing embeddings
   - More efficient for minor updates

### Concurrency Limits

To prevent overwhelming external services and manage costs:

- **Textbook processing**: Max 3 concurrent Glue jobs
- **Media processing**: Max 10 concurrent Glue jobs
- **Lambda concurrency**: Controlled via SQS event source mapping

### Retry and Error Handling

- **SQS Dead Letter Queues**: Captures failed messages after max retries
- **Textbook Queue**: Max 10 retries before DLQ
- **Media Queue**: Max 5 retries before DLQ
- **Job Status Tracking**: All failures logged in `ingest_jobs` table

---

## Monitoring and Troubleshooting

### CloudWatch Logs

All components log to CloudWatch:

- CSV Processor Lambda: `/aws/lambda/{stack-id}-CsvProcessorFunction`
- Job Processor Lambda: `/aws/lambda/{stack-id}-job-processor`
- Media Processor Lambda: `/aws/lambda/{stack-id}-media-job-processor`
- Data Processing Job: `/aws-glue/jobs/{stack-id}-data-processing-job`
- Media Processing Job: `/aws-glue/jobs/{stack-id}-media-processing-job`

### Common Issues

#### Issue: Glue job fails to start

- **Check**: IAM permissions for Job Processor Lambda
- **Check**: Glue job script exists in S3
- **Solution**: Verify S3 bucket deployment and IAM role policies

#### Issue: Database connection timeout

- **Check**: VPC configuration and security groups
- **Check**: RDS Proxy endpoint accessibility
- **Solution**: Ensure Glue connection uses correct VPC and subnet

#### Issue: Embedding generation fails

- **Check**: Bedrock service availability in region
- **Check**: IAM permissions for Bedrock InvokeModel
- **Solution**: Verify Bedrock model access and region configuration

#### Issue: Messages stuck in Dead Letter Queue

- **Check**: CloudWatch logs for error details
- **Check**: Message format and required fields
- **Solution**: Fix data issues and replay messages from DLQ

### Admin Panel Monitoring

The admin panel provides real-time monitoring:

- **Textbook Details Page**: Shows ingestion status, section counts, image counts
- **Job Status**: Displays current job state (pending, running, completed, failed)
- **Media Items**: Lists all extracted media with metadata

---

## Future Enhancements

### Planned Features

1. **Video Transcript Extraction** ⚠️ **NOT YET IMPLEMENTED**

   - Automatic extraction from YouTube, Vimeo
   - Caption/subtitle parsing
   - Timestamp-based chunking
   - Integration with existing media pipeline

2. **Incremental Updates**

   - Delta detection for changed content
   - Efficient re-processing of modified sections
   - Version tracking

3. **Advanced Media Support**

   - Audio transcription
   - Image OCR for diagrams and equations
   - Interactive content parsing

4. **Performance Optimizations**
   - Parallel section processing
   - Caching for frequently accessed content
   - Batch embedding generation

---

## References

### Related Documentation

- [Architecture Deep Dive](./ARCHITECTURE_DEEP_DIVE.md)
- [Database Migrations](./DATABASE_MIGRATIONS.md)
- [Dependency Management](./DEPENDENCY_MANAGEMENT.MD)
- [Deployment Guide](./DEPLOYMENT_GUIDE.md)

### Code References

- Data Pipeline Stack: `cdk/lib/data-pipeline-stack.ts`
- CSV Processor: `cdk/lambda/csvProcessor/`
- Job Processors: `cdk/lambda/jobProcessor/`, `cdk/lambda/mediaJobProcessor/`
- Glue Scripts: `cdk/glue/scripts/`

---

## Support

For issues or questions about data ingestion:

1. Check CloudWatch logs for detailed error messages
2. Review the admin panel for job status
3. Inspect SQS dead letter queues for failed messages
4. Refer to related documentation for specific components

import json
import os
import boto3
import logging
import psycopg2
from datetime import datetime
from typing import Dict, Any, List, Optional

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get('REGION', 'ca-central-1')
GLUE_JOB_NAME = os.environ.get('GLUE_JOB_NAME')
MAX_CONCURRENT_GLUE_JOBS = int(os.environ.get('MAX_CONCURRENT_GLUE_JOBS', '3'))
DB_SECRET_NAME = os.environ.get('SM_DB_CREDENTIALS')
RDS_PROXY_ENDPOINT = os.environ.get('RDS_PROXY_ENDPOINT')

# Initialize AWS clients
glue_client = boto3.client('glue', region_name=REGION)
secrets_manager = boto3.client('secretsmanager', region_name=REGION)

# Database connection cache
db_connection = None
db_secret = None

def get_db_secret() -> Dict[str, Any]:
    """
    Retrieve database credentials from Secrets Manager.
    Cached for Lambda container reuse.
    """
    global db_secret
    if db_secret is None:
        try:
            response = secrets_manager.get_secret_value(SecretId=DB_SECRET_NAME)
            db_secret = json.loads(response['SecretString'])
            logger.info("Retrieved database credentials from Secrets Manager")
        except Exception as e:
            logger.error(f"Error fetching database secret: {e}")
            raise
    return db_secret

def connect_to_db():
    """
    Connect to the database using RDS Proxy.
    Connection is cached for Lambda container reuse.
    """
    global db_connection
    if db_connection is None or db_connection.closed:
        try:
            secret = get_db_secret()
            db_connection = psycopg2.connect(
                dbname=secret["dbname"],
                user=secret["username"],
                password=secret["password"],
                host=RDS_PROXY_ENDPOINT,
                port=int(secret["port"]),
                sslmode='require'
            )
            logger.info("Connected to the database via RDS Proxy")
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            raise
    return db_connection

def create_job_record(textbook_id: Optional[str] = None) -> Optional[str]:
    """
    Create or reset a job record in the database for the ingestion process.
    
    For re-ingestion (textbook_id provided):
        - Resets the existing job record
    For new ingestion (textbook_id is None):
        - Creates new job without textbook_id (will be assigned later in Glue)
    
    Args:
        textbook_id: UUID of the textbook (for re-ingestion) or None (for new ingestion)
        
    Returns:
        job_id (UUID as string) or None if creation/update failed
    """
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        try:
            if textbook_id:
                # Re-ingestion: Check if a job already exists for this textbook
                cursor.execute("""
                    SELECT id FROM jobs
                    WHERE textbook_id = %s
                    LIMIT 1
                """, (textbook_id,))
                
                existing_job = cursor.fetchone()
            else:
                existing_job = None
            
            if existing_job:
                # Re-ingestion: Reset the existing job record
                job_id = existing_job[0]
                cursor.execute("""
                    UPDATE jobs
                    SET status = 'pending',
                        started_at = NOW(),
                        completed_at = NULL,
                        error_message = NULL,
                        ingested_sections = 0,
                        ingested_images = 0,
                        ingested_videos = 0,
                        glue_job_run_id = NULL,
                        updated_at = NOW()
                    WHERE id = %s
                    RETURNING id
                """, (job_id,))
                
                job_id = cursor.fetchone()[0]
                conn.commit()
                logger.info(f"Reset existing job record {job_id} for re-ingestion of textbook: {textbook_id}")
                
            else:
                if textbook_id:
                    # New ingestion: Create a new job record (textbook_id may be NULL)
                    cursor.execute("""
                        INSERT INTO jobs (textbook_id, status, started_at)
                        VALUES (%s, 'pending', NOW())
                        RETURNING id
                    """, (textbook_id,))
                else:
                    # New ingestion: Create a new job record (textbook_id is NULL)
                    cursor.execute("""
                        INSERT INTO jobs (status, started_at)
                        VALUES ('pending', NOW())
                        RETURNING id
                    """)
                
                job_id = cursor.fetchone()[0]
                conn.commit()
                if textbook_id:
                    logger.info(f"Created new job record {job_id} for textbook: {textbook_id}")
                else:
                    logger.info(f"Created new job record {job_id} (textbook_id will be assigned later)")
            
            return str(job_id)
            
        finally:
            cursor.close()
            
    except Exception as e:
        logger.error(f"Error creating/resetting job record: {e}")
        if conn:
            conn.rollback()
        return None

def update_job_with_glue_run_id(job_id: str, glue_job_run_id: str) -> bool:
    """
    Update the job record with the Glue job run ID for CloudWatch tracking.
    
    Args:
        job_id: UUID of the job record
        glue_job_run_id: Glue job run ID from start_job_run response
        
    Returns:
        True if update succeeded, False otherwise
    """
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                UPDATE jobs
                SET glue_job_run_id = %s,
                    status = 'running',
                    updated_at = NOW()
                WHERE id = %s
            """, (glue_job_run_id, job_id))
            
            conn.commit()
            logger.info(f"Updated job {job_id} with Glue run ID: {glue_job_run_id}")
            return True
            
        finally:
            cursor.close()
            
    except Exception as e:
        logger.error(f"Error updating job with Glue run ID: {e}")
        if conn:
            conn.rollback()
        return False

def get_running_job_count(job_name: str) -> int:
    """
    Get the count of currently running Glue jobs for the specified job name.
    
    Args:
        job_name: Name of the Glue job to check
        
    Returns:
        Number of jobs currently in RUNNING state
    """
    try:
        response = glue_client.get_job_runs(JobName=job_name)
        
        # Count jobs that are currently running
        running_jobs = [
            run for run in response.get('JobRuns', [])
            if run['JobRunState'] == 'RUNNING'
        ]
        
        count = len(running_jobs)
        logger.info(f"Currently running jobs for '{job_name}': {count}")
        
        # Log details of running jobs for visibility
        for job in running_jobs:
            logger.info(f"  - JobRunId: {job['JobRunId']}, Started: {job.get('StartedOn', 'N/A')}")
        
        return count
        
    except Exception as e:
        logger.error(f"Error getting running job count: {str(e)}")
        # In case of error, assume no jobs are running to avoid blocking
        return 0

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda function to process SQS messages and trigger Glue jobs with concurrency control.
    
    This function ensures that no more than MAX_CONCURRENT_GLUE_JOBS are running at once.
    If the limit is reached, it throws an error to return the message to SQS for retry.
    """
    logger.info("=== JOB PROCESSOR LAMBDA START ===")
    logger.info(f"Environment - GLUE_JOB_NAME: {GLUE_JOB_NAME}")
    logger.info(f"Environment - REGION: {REGION}")
    logger.info(f"Environment - MAX_CONCURRENT_GLUE_JOBS: {MAX_CONCURRENT_GLUE_JOBS}")
    logger.info(f"Received SQS event: {json.dumps(event, default=str)}")
    
    # Use the configured Glue job name
    job_name = GLUE_JOB_NAME
    if not job_name:
        raise ValueError("GLUE_JOB_NAME environment variable not set")
    
    # Check current running job count BEFORE processing any messages
    running_count = get_running_job_count(job_name)
    
    if running_count >= MAX_CONCURRENT_GLUE_JOBS:
        error_msg = f"Maximum concurrent Glue jobs ({MAX_CONCURRENT_GLUE_JOBS}) reached. Currently running: {running_count}. Message will be retried."
        logger.warning(f"⏸️  {error_msg}")
        
        # Throw an error to return ALL messages in this batch to SQS
        # SQS will retry after the visibility timeout
        raise Exception(error_msg)
    
    results = []
    
    for record in event.get('Records', []):
        job_id = None
        try:
            logger.info(f"=== Processing SQS Record ===")
            logger.info(f"Message ID: {record.get('messageId')}")
            logger.info(f"Receipt Handle: {record.get('receiptHandle', 'N/A')}")
            
            # Parse the SQS message
            message_body = json.loads(record['body'])
            logger.info(f"SQS Message Body: {message_body}")
            
            # Check if this is a re-ingestion (textbook_id provided) or new ingestion
            textbook_id = message_body.get('textbook_id')  # Present for re-ingestion
            
            if textbook_id:
                # RE-INGESTION: textbook already exists
                logger.info(f"Re-ingestion detected for textbook_id: {textbook_id}")
                job_id = create_job_record(textbook_id)
            else:
                # NEW INGESTION: textbook doesn't exist yet, will be created in Glue
                logger.info("New ingestion detected - creating job without textbook_id")
                job_id = create_job_record(textbook_id=None)
            
            if not job_id:
                raise Exception("Failed to create job record in database")
            
            logger.info(f"✅ Job record created with ID: {job_id}")
            
            # Create a unique batch ID for this run
            batch_id = f"batch-{int(datetime.now().timestamp())}"
            
            # Prepare Glue job arguments - pass SQS message data AND job_id as job parameters
            glue_job_args = {
                '--batch_id': batch_id,
                '--sqs_message_id': record.get('messageId', 'unknown'),
                '--sqs_message_body': json.dumps(message_body),
                '--trigger_timestamp': datetime.now().isoformat(),
                '--job_id': job_id,  # Pass job_id to Glue job for tracking
            }
            
            logger.info(f"=== Starting Glue Job ===")
            logger.info(f"Job Name: {job_name}")
            logger.info(f"Job ID: {job_id}")
            logger.info(f"Job Arguments: {glue_job_args}")
            logger.info(f"Available slots: {MAX_CONCURRENT_GLUE_JOBS - running_count}")
            
            # Start the Glue job
            response = glue_client.start_job_run(
                JobName=job_name,
                Arguments=glue_job_args
            )
            
            glue_job_run_id = response['JobRunId']
            logger.info(f"✅ Glue job started successfully!")
            logger.info(f"Glue JobRunId: {glue_job_run_id}")
            
            # Update job record with Glue job run ID for CloudWatch tracking
            if not update_job_with_glue_run_id(job_id, glue_job_run_id):
                logger.warning(f"Failed to update job {job_id} with Glue run ID, but job is running")
            
            # Increment running count for subsequent messages in this batch
            running_count += 1
            
            results.append({
                'messageId': record['messageId'],
                'status': 'success',
                'jobId': job_id,
                'glueJobRunId': glue_job_run_id,
                'jobName': job_name,
                'batchId': batch_id,
                'textbookId': textbook_id,
                'timestamp': datetime.now().isoformat()
            })
            
        except Exception as error:
            logger.error(f"❌ Error processing message {record.get('messageId', 'unknown')}: {str(error)}")
            
            # Re-raise the error to return the message to SQS
            # This ensures the message will be retried
            raise error
    
    response_body = {
        'message': 'SQS messages processed - Glue jobs triggered',
        'results': results,
        'processedCount': len(results),
        'successCount': len([r for r in results if r['status'] == 'success']),
        'errorCount': len([r for r in results if r['status'] == 'error'])
    }
    
    logger.info("=== JOB PROCESSOR LAMBDA COMPLETE ===")
    logger.info(f"Final Results: {response_body}")
    
    return {
        'statusCode': 200,
        'body': json.dumps(response_body, default=str)
    }
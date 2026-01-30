import json
import os
import boto3
import logging
from datetime import datetime
from typing import Dict, Any, List

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get('REGION', 'us-east-1')
GLUE_JOB_NAME = os.environ.get('GLUE_JOB_NAME')
MAX_CONCURRENT_GLUE_JOBS = int(os.environ.get('MAX_CONCURRENT_GLUE_JOBS', '10'))

# Initialize AWS clients
glue_client = boto3.client('glue', region_name=REGION)

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
        logger.info(f"Currently running media jobs for '{job_name}': {count}")
        
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
    Lambda function to process media SQS messages and trigger Glue jobs with concurrency control.
    
    This function processes media items (video transcripts, PDFs, PPTs) and ensures that 
    no more than MAX_CONCURRENT_GLUE_JOBS are running at once.
    """
    logger.info("=== MEDIA JOB PROCESSOR LAMBDA START ===")
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
        error_msg = f"Maximum concurrent media Glue jobs ({MAX_CONCURRENT_GLUE_JOBS}) reached. Currently running: {running_count}. Message will be retried."
        logger.warning(f"⏸️  {error_msg}")
        
        # Throw an error to return ALL messages in this batch to SQS
        # SQS will retry after the visibility timeout
        raise Exception(error_msg)
    
    results = []
    
    for record in event.get('Records', []):
        try:
            logger.info(f"=== Processing Media SQS Record ===")
            logger.info(f"Message ID: {record.get('messageId')}")
            logger.info(f"Receipt Handle: {record.get('receiptHandle', 'N/A')}")
            
            # Parse the SQS message
            message_body = json.loads(record['body'])
            logger.info(f"SQS Message Body: {message_body}")
            
            # Extract fields - handle both direct messages and CSV-based messages
            media_url = message_body.get('media_url')
            media_type = message_body.get('media_type')
            metadata = message_body.get('metadata', {})
            
            # Validate required fields for media processing
            if not media_url:
                error_msg = "Missing required field: media_url"
                logger.error(error_msg)
                raise ValueError(error_msg)
            
            if not media_type:
                error_msg = "Missing required field: media_type"
                logger.error(error_msg)
                raise ValueError(error_msg)
            
            # Only process supported media types (PDF and PPTX)
            # H5P video transcripts are not yet supported
            supported_types = ['pdf', 'pptx', 'ppt']
            if media_type not in supported_types:
                logger.warning(f"⏭️  Skipping unsupported media type: {media_type}")
                logger.warning(f"Supported types: {', '.join(supported_types)}")
                logger.info(f"Message will be deleted from queue (not retried)")
                
                # Add to results as skipped
                results.append({
                    'messageId': record['messageId'],
                    'status': 'skipped',
                    'reason': f'Unsupported media type: {media_type}',
                    'mediaUrl': media_url,
                    'mediaType': media_type,
                    'timestamp': datetime.now().isoformat()
                })
                
                # Continue to next message (don't trigger Glue job)
                continue
            
            # Create a unique batch ID for this run
            batch_id = f"media-batch-{int(datetime.now().timestamp())}"
            
            # Prepare Glue job arguments - pass SQS message data as job parameters
            glue_job_args = {
                '--batch_id': batch_id,
                '--sqs_message_id': record.get('messageId', 'unknown'),
                '--sqs_message_body': json.dumps(message_body),
                '--trigger_timestamp': datetime.now().isoformat(),
                '--media_url': media_url,
                '--media_type': media_type,
            }
            
            logger.info(f"=== Starting Media Glue Job ===")
            logger.info(f"Job Name: {job_name}")
            logger.info(f"Media URL: {media_url}")
            logger.info(f"Media Type: {media_type}")
            logger.info(f"Metadata: {metadata}")
            logger.info(f"Job Arguments: {glue_job_args}")
            logger.info(f"Available slots: {MAX_CONCURRENT_GLUE_JOBS - running_count}")
            
            # Start the Glue job
            response = glue_client.start_job_run(
                JobName=job_name,
                Arguments=glue_job_args
            )
            
            logger.info(f"✅ Media Glue job started successfully!")
            logger.info(f"JobRunId: {response['JobRunId']}")
            
            # Increment running count for subsequent messages in this batch
            running_count += 1
            
            results.append({
                'messageId': record['messageId'],
                'status': 'success',
                'glueJobRunId': response['JobRunId'],
                'jobName': job_name,
                'batchId': batch_id,
                'mediaUrl': media_url,
                'mediaType': media_type,
                'timestamp': datetime.now().isoformat()
            })
            
        except Exception as error:
            logger.error(f"❌ Error processing media message {record.get('messageId', 'unknown')}: {str(error)}")
            
            # Re-raise the error to return the message to SQS
            # This ensures the message will be retried
            raise error
    
    response_body = {
        'message': 'Media SQS messages processed - Glue jobs triggered',
        'results': results,
        'processedCount': len(results),
        'successCount': len([r for r in results if r['status'] == 'success']),
        'errorCount': len([r for r in results if r['status'] == 'error'])
    }
    
    logger.info("=== MEDIA JOB PROCESSOR LAMBDA COMPLETE ===")
    logger.info(f"Final Results: {response_body}")
    
    return {
        'statusCode': 200,
        'body': json.dumps(response_body, default=str)
    }

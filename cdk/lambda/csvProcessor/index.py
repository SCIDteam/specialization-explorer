import json
import csv
import os
import boto3
import re
from datetime import datetime
from io import StringIO
from urllib.parse import unquote_plus

REGION = os.environ.get('REGION', 'ca-central-1')
TEXTBOOK_QUEUE_URL = os.environ.get('QUEUE_URL')
MEDIA_QUEUE_URL = os.environ.get('MEDIA_QUEUE_URL')

s3_client = boto3.client('s3', region_name=REGION)
sqs_client = boto3.client('sqs', region_name=REGION)

def normalize_media_type(media_type_str):
    """
    Normalize media type string to match expected values for media processing.
    
    Rules:
    - "H5P" in string -> "video_transcript"
    - "video" in string -> "video"
    - "PDF" in string -> "pdf"
    - "PowerPoint slides" -> "pptx"
    """
    if not media_type_str:
        return "unknown"
    
    media_type_lower = media_type_str.lower()
    
    # Check for PDF
    if "pdf" in media_type_lower:
        return "pdf"
    
    # Check for PowerPoint
    if media_type_str == "PowerPoint slides":
        return "pptx"

    # Check for H5P first (video transcripts)
    if "h5p" in media_type_lower or "video" in media_type_lower:
        return "video_transcript"
    
    return "unknown"

def is_media_upload(key):
    """Check if the S3 key is for a media upload"""
    return key.startswith('uploads/media/')

def is_textbook_upload(key):
    """Check if the S3 key is for a textbook upload"""
    return key.startswith('uploads/textbooks/')

def process_textbook_csv(csv_records, bucket, key):
    """Process textbook CSV and send to textbook ingestion queue"""
    success_count = 0
    error_count = 0
    
    for index, csv_record in enumerate(csv_records):
        try:
            # Extract the source URL from the CSV record
            link = csv_record.get('Source')
            
            if not link:
                print(f"No 'Source' link found in record {index + 1}: {csv_record}")
                error_count += 1
                continue
            
            # Prepare message for SQS with structured metadata
            message_body = {
                'link': link,
                'metadata': {
                    'source': 'csv-upload',
                    'bucket': bucket,
                    'csvFile': key,
                    'recordIndex': index,
                    'timestamp': datetime.utcnow().isoformat(),
                    'title': csv_record.get('Title', ''),
                    'author': csv_record.get('Author', ''),
                    'licence': csv_record.get('Licence', ''),
                    'numberOfH5P': csv_record.get('Number of H5P', ''),
                    'visits12Months': csv_record.get('Visits (past 12 months)', ''),
                    'visitsMonthlyAvg': csv_record.get('Visits (monthly average)', ''),
                    'bookId': csv_record.get('Book ID', '')
                }
            }
            
            # Send message to textbook SQS FIFO queue
            sanitized_key = re.sub(r'[^a-zA-Z0-9-_]', '_', key)
            message_group_id = f"csv-{sanitized_key}"
            deduplication_id = f"{sanitized_key}-{index}-{int(datetime.utcnow().timestamp() * 1000)}"
            
            sqs_client.send_message(
                QueueUrl=TEXTBOOK_QUEUE_URL,
                MessageBody=json.dumps(message_body),
                MessageGroupId=message_group_id,
                MessageDeduplicationId=deduplication_id
            )
            
            success_count += 1
            print(f"Sent textbook link {index + 1} to SQS: {link}")
            
        except Exception as error:
            print(f"Error processing textbook record {index + 1}: {str(error)}")
            error_count += 1
    
    return success_count, error_count

def process_media_csv(csv_records, bucket, key):
    """Process media CSV and send to media ingestion queue"""
    success_count = 0
    error_count = 0
    
    for index, csv_record in enumerate(csv_records):
        try:
            # Extract required fields from CSV
            # Expected columns: Book Title, Media title, raw_media_url, media_type, Chapter title, Chapter URL
            book_title = csv_record.get('Book Title', '')
            media_title = csv_record.get('Media title', '')
            raw_media_url = csv_record.get('raw_media_url', '')
            media_type_raw = csv_record.get('media_type', '')
            chapter_title = csv_record.get('Chapter title', '')
            chapter_url = csv_record.get('Chapter URL', '')
            
            if not raw_media_url:
                print(f"No 'raw_media_url' found in record {index + 1}: {csv_record}")
                error_count += 1
                continue
            
            # Normalize media type
            media_type = normalize_media_type(media_type_raw)
            
            # Prepare message for media ingestion queue
            # Format expected by media processing Glue job:
            # {
            #   "media_item_id": "uuid",
            #   "textbook_id": "uuid",
            #   "section_id": "uuid",
            #   "media_type": "transcript|pdf|pptx|video",
            #   "media_url": "s3://bucket/key or https://..."
            # }
            
            message_body = {
                'media_url': raw_media_url,
                'media_type': media_type,
                'metadata': {
                    'source': 'csv-upload',
                    'bucket': bucket,
                    'csvFile': key,
                    'recordIndex': index,
                    'timestamp': datetime.utcnow().isoformat(),
                    'book_title': book_title,
                    'media_title': media_title,
                    'chapter_title': chapter_title,
                    'chapter_url': chapter_url,
                    'media_type_raw': media_type_raw
                }
            }
            
            # Send message to media SQS FIFO queue
            sanitized_key = re.sub(r'[^a-zA-Z0-9-_]', '_', key)
            message_group_id = f"media-csv-{sanitized_key}"
            deduplication_id = f"{sanitized_key}-{index}-{int(datetime.utcnow().timestamp() * 1000)}"
            
            sqs_client.send_message(
                QueueUrl=MEDIA_QUEUE_URL,
                MessageBody=json.dumps(message_body),
                MessageGroupId=message_group_id,
                MessageDeduplicationId=deduplication_id
            )
            
            success_count += 1
            print(f"Sent media item {index + 1} to SQS: {media_title} ({media_type}) - {raw_media_url}")
            
        except Exception as error:
            print(f"Error processing media record {index + 1}: {str(error)}")
            error_count += 1
    
    return success_count, error_count

def handler(event, context):
    """
    Lambda handler to process CSV files uploaded to S3 and send to appropriate SQS queue
    Routes to textbook queue or media queue based on S3 key prefix
    """
    print(f"Event received: {json.dumps(event)}")
    
    try:
        # Process each S3 record from the event
        for record in event['Records']:
            bucket = record['s3']['bucket']['name']
            key = unquote_plus(record['s3']['object']['key'])
            
            print(f"Processing file: {key} from bucket: {bucket}")
            
            # Only process CSV files
            if not key.lower().endswith('.csv'):
                print(f"Skipping non-CSV file: {key}")
                continue
            
            # Get the CSV file from S3
            response = s3_client.get_object(Bucket=bucket, Key=key)
            csv_content = response['Body'].read().decode('utf-8')
            
            # Parse CSV content
            csv_reader = csv.DictReader(StringIO(csv_content))
            records = list(csv_reader)
            
            print(f"Parsed {len(records)} records from CSV")
            
            # Route to appropriate processor based on S3 key prefix
            if is_media_upload(key):
                print(f"Processing as MEDIA CSV")
                success_count, error_count = process_media_csv(records, bucket, key)
            elif is_textbook_upload(key):
                print(f"Processing as TEXTBOOK CSV")
                success_count, error_count = process_textbook_csv(records, bucket, key)
            else:
                # Default to textbook for backward compatibility
                print(f"Processing as TEXTBOOK CSV (default)")
                success_count, error_count = process_textbook_csv(records, bucket, key)
            
            print(f"Processing complete for {key}: {success_count} successful, {error_count} errors")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'CSV processing completed successfully'
            })
        }
        
    except Exception as error:
        print(f"Error processing CSV: {str(error)}")
        raise error

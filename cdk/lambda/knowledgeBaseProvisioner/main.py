import json
import boto3
import logging
import time

logger = logging.getLogger()
logger.setLevel(logging.INFO)

bedrock_agent = boto3.client('bedrock-agent')

KB_CREATE_RETRY_WINDOW_SECONDS = 300
KB_CREATE_RETRY_SLEEP_SECONDS = 15

def handler(event, context):
    logger.info(f"Received event: {json.dumps(event)}")
    request_type = event['RequestType']
    
    try:
        if request_type == 'Create':
            return on_create(event)
        elif request_type == 'Update':
            return on_update(event)
        elif request_type == 'Delete':
            return on_delete(event)
        else:
            raise Exception(f"Invalid request type: {request_type}")
    except Exception as e:
        logger.error(f"Error handling event: {str(e)}")
        raise e

def on_create(event):
    props = event['ResourceProperties']
    name = props['Name']
    role_arn = props['RoleArn']
    embedding_model_arn = props['EmbeddingModelArn']
    collection_arn = props['CollectionArn']
    vector_index_name = props['VectorIndexName']
    vector_field = props['VectorField']
    text_field = props['TextField']
    metadata_field = props['MetadataField']
    description = props.get('Description', '')

    logger.info(f"Creating Knowledge Base: {name}")

    deadline = time.time() + KB_CREATE_RETRY_WINDOW_SECONDS
    attempt = 0
    while True:
        attempt += 1
        try:
            response = bedrock_agent.create_knowledge_base(
                name=name,
                description=description,
                roleArn=role_arn,
                knowledgeBaseConfiguration={
                    'type': 'VECTOR',
                    'vectorKnowledgeBaseConfiguration': {
                        'embeddingModelArn': embedding_model_arn
                    }
                },
                storageConfiguration={
                    'type': 'OPENSEARCH_SERVERLESS',
                    'opensearchServerlessConfiguration': {
                        'collectionArn': collection_arn,
                        'vectorIndexName': vector_index_name,
                        'fieldMapping': {
                            'vectorField': vector_field,
                            'textField': text_field,
                            'metadataField': metadata_field
                        }
                    }
                }
            )
            break
        except bedrock_agent.exceptions.ValidationException as e:
            message = str(e)
            is_index_not_ready = (
                "no such index" in message.lower()
                or "storage configuration provided is invalid" in message.lower()
            )

            if is_index_not_ready and time.time() < deadline:
                seconds_left = int(deadline - time.time())
                logger.warning(
                    "Knowledge base create attempt %s failed because index is not visible yet. "
                    "Retrying in %ss (time left: %ss). Error: %s",
                    attempt,
                    KB_CREATE_RETRY_SLEEP_SECONDS,
                    seconds_left,
                    message,
                )
                time.sleep(KB_CREATE_RETRY_SLEEP_SECONDS)
                continue
            raise
    
    kb_id = response['knowledgeBase']['knowledgeBaseId']
    logger.info(f"Successfully created Knowledge Base. ID: {kb_id}")
    
    # Create Data Sources
    s3_bucket_arn = props.get('S3BucketArn')
    s3_ds_id = ''
    if s3_bucket_arn:
        logger.info(f"Creating S3 Data Source for bucket: {s3_bucket_arn}")
        ds_response = bedrock_agent.create_data_source(
            knowledgeBaseId=kb_id,
            name=f"{name}-s3-source",
            dataSourceConfiguration={
                'type': 'S3',
                's3Configuration': {
                    'bucketArn': s3_bucket_arn
                }
            },
            vectorIngestionConfiguration={
                'chunkingConfiguration': {
                    'chunkingStrategy': 'SEMANTIC',
                    'semanticChunkingConfiguration': {
                        'maxTokens': 512,
                        'bufferSize': 1,
                        'breakpointPercentileThreshold': 85
                    }
                }
            }
        )
        s3_ds_id = ds_response['dataSource']['dataSourceId']
        logger.info(f"Successfully created S3 Data Source. ID: {s3_ds_id}")

    web_urls_str = props.get('WebCrawlerUrls', '')
    web_ds_id = ''
    if web_urls_str and web_urls_str != "dummy-value":
        urls = [url.strip() for url in web_urls_str.split(',') if url.strip()]
        if urls:
            logger.info(f"Creating Web Crawler Data Source for URLs: {urls}")
            try:
                ds_response = bedrock_agent.create_data_source(
                    knowledgeBaseId=kb_id,
                    name=f"{name}-web-source",
                    dataSourceConfiguration={
                        'type': 'WEB',
                        'webConfiguration': {
                            'sourceConfiguration': {
                                'urlConfiguration': {
                                    'seedUrls': [{'url': url} for url in urls]
                                }
                            }
                        }
                    },
                    vectorIngestionConfiguration={
                        'chunkingConfiguration': {
                            'chunkingStrategy': 'SEMANTIC',
                            'semanticChunkingConfiguration': {
                                'maxTokens': 512,
                                'bufferSize': 1,
                                'breakpointPercentileThreshold': 85
                            }
                        }
                    }
                )
                web_ds_id = ds_response['dataSource']['dataSourceId']
                logger.info(f"Successfully created Web Crawler Data Source. ID: {web_ds_id}")
            except Exception as e:
                logger.warning(f"Could not create Web Crawler Data Source. This might happen if 'urls' are invalid or dummy variables were passed. Error: {str(e)}")
    
    return {
        'PhysicalResourceId': kb_id,
        'Data': {
            'KnowledgeBaseId': kb_id,
            'S3DataSourceId': s3_ds_id,
            'WebCrawlerDataSourceId': web_ds_id
        }
    }

def on_update(event):
    # Depending on properties, update the Knowledge Base
    # For now, simply return the existing Physical Resource ID
    # True updates require complex logic mapping (checking what changed), which falls outside basic provisioning
    physical_id = event['PhysicalResourceId']
    logger.info(f"Update operation requested for: {physical_id}. Returning success without changes.")
    return {
        'PhysicalResourceId': physical_id,
        'Data': {}
    }

def on_delete(event):
    kb_id = event['PhysicalResourceId']
    if kb_id and kb_id != 'failed-to-create' and not kb_id.startswith('CustomResource'):
        try:
            logger.info(f"Deleting Knowledge Base: {kb_id}")
            # Note: Deleting a knowledge base automatically deletes its data sources
            bedrock_agent.delete_knowledge_base(knowledgeBaseId=kb_id)
            logger.info(f"Successfully deleted Knowledge Base: {kb_id}")
        except bedrock_agent.exceptions.ResourceNotFoundException:
            logger.info(f"Knowledge Base {kb_id} already deleted.")
        except Exception as e:
            logger.error(f"Error deleting knowledge base: {str(e)}")
            raise e
    return {
        'PhysicalResourceId': event['PhysicalResourceId'],
        'Data': {}
    }

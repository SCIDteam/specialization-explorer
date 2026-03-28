import json
import logging
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

bedrock_agent = boto3.client("bedrock-agent")


def _response(status_code: int, body: dict):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "*",
        },
        "body": json.dumps(body),
    }


def _normalize_status(bedrock_status: str | None) -> str | None:
    if not bedrock_status:
        return None

    if bedrock_status == "COMPLETE":
        return "completed"

    if bedrock_status == "FAILED":
        return "failed"

    if bedrock_status in {"STARTING", "IN_PROGRESS", "STOPPING"}:
        return "running"

    return None


def _extract_event_details(event: dict) -> dict:
    detail = event.get("detail", {}) or {}

    return {
        "knowledge_base_id": detail.get("knowledgeBaseId"),
        "data_source_id": detail.get("dataSourceId"),
        "ingestion_job_id": detail.get("ingestionJobId"),
        "status": detail.get("status"),
        "failure_reasons": detail.get("failureReasons", []) or [],
        "raw_detail": detail,
    }


def _fetch_ingestion_job_if_possible(event_details: dict) -> dict | None:
    kb_id = event_details.get("knowledge_base_id")
    ds_id = event_details.get("data_source_id")
    job_id = event_details.get("ingestion_job_id")

    if not kb_id or not ds_id or not job_id:
        return None

    try:
        resp = bedrock_agent.get_ingestion_job(
            knowledgeBaseId=kb_id,
            dataSourceId=ds_id,
            ingestionJobId=job_id,
        )
        return resp.get("ingestionJob")
    except Exception as e:
        logger.warning("Could not fetch ingestion job details from Bedrock: %s", e)
        return None


def _update_ingestion_run(connection, *, ingestion_job_id: str, status: str, error_message: str | None):
    terminal = status in {"completed", "failed"}

    with connection.cursor() as cursor:
        if terminal:
            cursor.execute(
                """
                UPDATE ingestion_runs
                SET
                    status = %s::ingestion_status,
                    error_message = %s,
                    completed_at = NOW()
                WHERE metadata->>'bedrock_ingestion_job_id' = %s
                """,
                (status, error_message, ingestion_job_id),
            )
        else:
            cursor.execute(
                """
                UPDATE ingestion_runs
                SET
                    status = %s::ingestion_status,
                    error_message = %s
                WHERE metadata->>'bedrock_ingestion_job_id' = %s
                """,
                (status, error_message, ingestion_job_id),
            )

        return cursor.rowcount


def update_status(event, connection):
    logger.info("Received Bedrock EventBridge event: %s", json.dumps(event))

    event_details = _extract_event_details(event)
    ingestion_job_id = event_details.get("ingestion_job_id")

    if not ingestion_job_id:
        return _response(400, {"error": "Missing ingestion job ID in Bedrock event"})

    # Prefer the fresh Bedrock API read if enough identifiers are present
    ingestion_job = _fetch_ingestion_job_if_possible(event_details)

    if ingestion_job:
        bedrock_status = ingestion_job.get("status")
        failure_reasons = ingestion_job.get("failureReasons", []) or []
    else:
        bedrock_status = event_details.get("status")
        failure_reasons = event_details.get("failure_reasons", [])

    normalized_status = _normalize_status(bedrock_status)
    if not normalized_status:
        return _response(
            200,
            {
                "message": "Ignored non-terminal or unsupported Bedrock ingestion status event.",
                "ingestion_job_id": ingestion_job_id,
                "bedrock_status": bedrock_status,
            },
        )

    error_message = "; ".join(failure_reasons) if failure_reasons else None

    try:
        rows_updated = _update_ingestion_run(
            connection,
            ingestion_job_id=ingestion_job_id,
            status=normalized_status,
            error_message=error_message,
        )
        connection.commit()
    except Exception:
        connection.rollback()
        raise

    if rows_updated == 0:
        return _response(
            404,
            {
                "error": "No matching ingestion_runs row found for Bedrock ingestion job ID",
                "ingestion_job_id": ingestion_job_id,
            },
        )

    return _response(
        200,
        {
            "message": "Ingestion run status updated successfully.",
            "ingestion_job_id": ingestion_job_id,
            "status": normalized_status,
            "rows_updated": rows_updated,
        },
    )
import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)


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


def add_website(event, body):
    name = body.get("name")
    include_patterns = body.get("include_patterns", [])
    exclude_patterns = body.get("exclude_patterns", [])
    created_by = body.get("created_by")

    if not name:
        return _response(400, {"error": "Missing name of the website"})

    if not created_by:
        return _response(400, {"error": "Missing admin who is trying to add this website to knowledge base"})

    if not isinstance(include_patterns, list):
        return _response(400, {"error": "include_patterns must be an array"})

    if not isinstance(exclude_patterns, list):
        return _response(400, {"error": "exclude_patterns must be an array"})

    logger.info(
        "Received add website request: name=%s include_patterns=%s exclude_patterns=%s created_by=%s",
        name,
        include_patterns,
        exclude_patterns,
        created_by,
    )

    return _response(
        200,
        {
            "message": "Hello World",
            "name": name,
            "include_patterns": include_patterns,
            "exclude_patterns": exclude_patterns,
            "created_by": created_by,
        },
    )
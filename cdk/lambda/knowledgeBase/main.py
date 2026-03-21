import json
import logging

from helpers.add_website import add_website

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


def _parse_body(event):
    body = {}
    raw_body = event.get("body")

    if not raw_body:
        return body

    try:
        if isinstance(raw_body, str):
            body = json.loads(raw_body)
        elif isinstance(raw_body, dict):
            body = raw_body
        else:
            raise ValueError("Unsupported body format")
    except Exception as e:
        logger.error("Failed to parse body: %s", e)
        raise ValueError("Invalid JSON body")

    return body


def handler(event, context=None):
    logger.info("Event: %s", json.dumps(event))

    try:
        method = event.get("httpMethod", "")
        resource = event.get("resource", "")
        path = event.get("path", "")

        try:
            body = _parse_body(event)
        except ValueError as e:
            return _response(400, {"error": str(e)})

        # Route: POST /admin/data_sources/website
        if method == "POST" and (
            resource == "/admin/data_sources/website"
            or path.endswith("/admin/data_sources/website")
        ):
            return add_website(event=event, body=body)

        return _response(
            404,
            {
                "error": "Route not found",
                "method": method,
                "resource": resource,
                "path": path,
            },
        )

    except Exception as e:
        logger.error("Error: %s", e, exc_info=True)
        return _response(500, {"error": "Internal server error"})
"""
Security helper functions for chat session validation and protection.

This module provides critical security functions to prevent unauthorized access
to chat sessions and protect against injection attacks.
"""

import uuid
import re
import logging
import secrets

logger = logging.getLogger(__name__)


def validate_uuid_format(session_id):
    """
    Validate that a session ID is a properly formatted UUID.
    
    Args:
        session_id: The session ID to validate
        
    Returns:
        bool: True if valid UUID format, False otherwise
    """
    if not session_id:
        return False
    
    try:
        # Try to parse as UUID
        uuid.UUID(session_id)
        return True
    except (ValueError, AttributeError):
        # Check if it's a legacy fallback session (for backward compatibility)
        # Pattern: default-{timestamp}
        if re.match(r'^default-\d{10,}$', session_id):
            logger.warning(f"Legacy fallback session ID detected: {session_id[:20]}...")
            return True
        
        return False


def validate_session_ownership(connection, chat_session_id, user_session_id):
    """
    Verify that a user session owns a specific chat session.
    
    CRITICAL SECURITY FUNCTION: This prevents unauthorized access to other users' conversations.
    
    Args:
        connection: Database connection
        chat_session_id: The chat session ID to validate
        user_session_id: The user session ID claiming ownership
        
    Returns:
        bool: True if user owns the session, False otherwise
        
    Raises:
        Exception: If database query fails
    """
    if not chat_session_id or not user_session_id:
        logger.error("Missing session IDs for ownership validation")
        return False
    
    try:
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT 1 FROM chat_sessions 
                WHERE id = %s AND user_session_id = %s
                LIMIT 1
                """,
                (chat_session_id, user_session_id)
            )
            
            result = cur.fetchone()
            is_owner = result is not None
            
            if not is_owner:
                logger.warning(
                    f"Ownership validation failed: chat_session={chat_session_id[:8]}..., "
                    f"user_session={user_session_id[:8]}..."
                )
            
            return is_owner
            
    except Exception as e:
        logger.error(f"Error validating session ownership: {e}")
        # Fail closed - deny access on error
        return False


def sanitize_session_id(session_id):
    """
    Sanitize and validate a session ID before use in database operations.
    
    This prevents injection attacks and ensures only valid session IDs are processed.
    
    Args:
        session_id: The session ID to sanitize
        
    Returns:
        str: The sanitized session ID
        
    Raises:
        ValueError: If session ID is invalid or potentially malicious
    """
    if not session_id:
        raise ValueError("Session ID cannot be empty")
    
    # Remove any whitespace
    session_id = session_id.strip()
    
    # Check length (UUIDs are 36 characters, allow some buffer for legacy formats)
    if len(session_id) > 100:
        raise ValueError("Session ID exceeds maximum length")
    
    # Validate format
    if not validate_uuid_format(session_id):
        raise ValueError(f"Invalid session ID format: {session_id[:20]}...")
    
    # Check for suspicious patterns
    suspicious_patterns = [
        r'[;\'"\\]',  # SQL injection characters
        r'\.\.',      # Path traversal
        r'<script',   # XSS attempts
        r'DROP\s+TABLE',  # SQL commands
        r'--',        # SQL comments
    ]
    
    for pattern in suspicious_patterns:
        if re.search(pattern, session_id, re.IGNORECASE):
            logger.error(f"Suspicious pattern detected in session ID: {pattern}")
            raise ValueError("Session ID contains suspicious characters")
    
    return session_id


def generate_secure_session_id():
    """
    Generate a cryptographically secure session ID.
    
    This replaces the predictable timestamp-based fallback with a secure random UUID.
    
    Returns:
        str: A secure UUID v4 session ID
    """
    # Use UUID v4 for cryptographically secure random generation
    session_id = str(uuid.uuid4())
    
    # Add additional entropy check
    # Ensure the UUID has sufficient randomness (not all zeros, etc.)
    if session_id.count('0') > 20:  # Sanity check
        logger.warning("Generated UUID has unusual pattern, regenerating")
        session_id = str(uuid.uuid4())
    
    logger.info(f"Generated secure session ID: {session_id[:8]}...")
    return session_id


def verify_session_exists(connection, chat_session_id):
    """
    Verify that a chat session exists in the database.
    
    Args:
        connection: Database connection
        chat_session_id: The chat session ID to verify
        
    Returns:
        bool: True if session exists, False otherwise
    """
    try:
        with connection.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM chat_sessions WHERE id = %s LIMIT 1",
                (chat_session_id,)
            )
            return cur.fetchone() is not None
    except Exception as e:
        logger.error(f"Error verifying session existence: {e}")
        return False


def get_user_session_from_chat_session(connection, chat_session_id):
    """
    Get the user_session_id associated with a chat_session_id.
    
    Args:
        connection: Database connection
        chat_session_id: The chat session ID
        
    Returns:
        str: The user_session_id, or None if not found
    """
    try:
        with connection.cursor() as cur:
            cur.execute(
                "SELECT user_session_id FROM chat_sessions WHERE id = %s LIMIT 1",
                (chat_session_id,)
            )
            result = cur.fetchone()
            return result[0] if result else None
    except Exception as e:
        logger.error(f"Error getting user session from chat session: {e}")
        return None
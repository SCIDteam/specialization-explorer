"""
Token Limit Service using 24-hour rolling window in user_sessions table

This service tracks daily token usage per user session with automatic reset after 24 hours.
Token limits are enforced based on SSM parameters.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple, Dict
import boto3

logger = logging.getLogger(__name__)

def get_user_session_from_chat_session(
    connection,
    chat_session_id: str
) -> Optional[str]:
    """
    Get user_session_id from chat_session_id using the foreign key relationship.
    
    Args:
        connection: Database connection
        chat_session_id: Chat session ID
    
    Returns:
        user_session_id or None if not found
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT user_session_id 
                FROM chat_sessions 
                WHERE id = %s
            """, (chat_session_id,))
            
            result = cursor.fetchone()
            if result:
                return result[0]
            else:
                logger.warning(f"No user_session found for chat_session {chat_session_id}")
                return None
    except Exception as e:
        logger.error(f"Error getting user_session from chat_session {chat_session_id}: {e}")
        return None

def check_and_update_token_limit(
    connection, 
    user_session_id: str,
    tokens_to_add: int,
    global_limit_param_name: str,
    ssm_client=None
) -> Tuple[bool, Dict]:
    """
    Check if user session can use the specified number of tokens and update their count if allowed.
    Uses 24-hour rolling window stored in user_sessions table.
    
    Args:
        connection: Database connection
        user_session_id: User session ID to check
        tokens_to_add: Number of tokens this request will consume
        global_limit_param_name: SSM parameter name for global token limit
        ssm_client: Optional SSM client
    
    Returns:
        Tuple of (can_proceed: bool, usage_info: Dict)
    """
    if ssm_client is None:
        ssm_client = boto3.client('ssm')
    
    try:
        with connection.cursor() as cursor:
            # Get user session's current token data
            cursor.execute("""
                SELECT 
                    tokens_used,
                    updated_at
                FROM user_sessions 
                WHERE id = %s
            """, (user_session_id,))
            
            session_data = cursor.fetchone()
            if not session_data:
                raise ValueError(f"User session {user_session_id} not found")
            
            current_tokens, last_updated = session_data
            now = datetime.now(timezone.utc)
            
            # Initialize if null
            if current_tokens is None:
                current_tokens = 0
            if last_updated is None:
                last_updated = now
            
            # Check if 24 hours have passed since last update
            hours_since_reset = (now - last_updated).total_seconds() / 3600
            needs_reset = hours_since_reset >= 24
            
            if needs_reset:
                # Reset the counter for the new 24-hour period
                current_tokens = 0
                last_updated = now
                logger.info(f"Reset daily token count for user_session {user_session_id}")
            
            # Get effective limit from SSM
            effective_limit = None
            try:
                response = ssm_client.get_parameter(
                    Name=global_limit_param_name,
                    WithDecryption=True
                )
                limit_value = response['Parameter']['Value'].strip().upper()
                if limit_value in ('NONE', 'INFINITY', 'UNLIMITED'):
                    effective_limit = float('inf')
                else:
                    effective_limit = int(limit_value)
            except Exception as e:
                logger.error(f"Error fetching global token limit: {e}")
                effective_limit = 100000  # Fallback to 100k tokens
            
            # Check if user would exceed their limit
            new_token_count = current_tokens + tokens_to_add
            
            if effective_limit != float('inf') and new_token_count > effective_limit:
                # User would exceed their limit
                remaining = max(0, effective_limit - current_tokens)
                usage_info = {
                    'can_proceed': False,
                    'tokens_used': current_tokens,
                    'tokens_requested': tokens_to_add,
                    'daily_limit': effective_limit,
                    'remaining_tokens': remaining,
                    'hours_until_reset': max(0, 24 - hours_since_reset),
                    'reset_time': (last_updated + timedelta(hours=24)).isoformat(),
                    'message': f"Token limit exceeded. You have {remaining} tokens remaining out of {effective_limit}. Limit resets in {max(0, 24 - hours_since_reset):.1f} hours."
                }
                return False, usage_info
            
            # Update the token count
            cursor.execute("""
                UPDATE user_sessions 
                SET tokens_used = %s,
                    updated_at = %s
                WHERE id = %s
            """, (new_token_count, now, user_session_id))
            connection.commit()
            
            logger.info(f"Updated token count for user_session {user_session_id}: {new_token_count}/{effective_limit}")
            
            # Calculate remaining tokens
            if effective_limit == float('inf'):
                remaining = float('inf')
            else:
                remaining = max(0, effective_limit - new_token_count)
            
            usage_info = {
                'can_proceed': True,
                'tokens_used': new_token_count,
                'tokens_added': tokens_to_add,
                'daily_limit': effective_limit,
                'remaining_tokens': remaining,
                'hours_until_reset': max(0, 24 - hours_since_reset) if not needs_reset else 24,
                'reset_time': (last_updated + timedelta(hours=24)).isoformat(),
                'was_reset': needs_reset
            }
            
            return True, usage_info
            
    except Exception as e:
        logger.error(f"Error checking/updating token limit for user_session {user_session_id}: {e}")
        connection.rollback()
        raise

def get_session_token_status(
    connection,
    user_session_id: str,
    global_limit_param_name: str,
    ssm_client=None
) -> Dict:
    """
    Get user session's current token usage status without modifying count.
    
    Args:
        connection: Database connection
        user_session_id: User session ID to check
        global_limit_param_name: SSM parameter name for global token limit
        ssm_client: Optional SSM client
    
    Returns:
        Dict with usage information
    """
    if ssm_client is None:
        ssm_client = boto3.client('ssm')
    
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    tokens_used,
                    updated_at
                FROM user_sessions 
                WHERE id = %s
            """, (user_session_id,))
            
            session_data = cursor.fetchone()
            if not session_data:
                raise ValueError(f"User session {user_session_id} not found")
            
            current_tokens, last_updated = session_data
            now = datetime.now(timezone.utc)
            
            # Initialize if null
            if current_tokens is None:
                current_tokens = 0
            if last_updated is None:
                last_updated = now
                
            hours_since_reset = (now - last_updated).total_seconds() / 3600
            
            # If 24 hours passed, the count would be reset on next request
            if hours_since_reset >= 24:
                current_tokens = 0
                next_reset = now + timedelta(hours=24)
            else:
                next_reset = last_updated + timedelta(hours=24)
            
            # Get effective limit
            effective_limit = None
            try:
                response = ssm_client.get_parameter(
                    Name=global_limit_param_name,
                    WithDecryption=True
                )
                limit_value = response['Parameter']['Value'].strip().upper()
                if limit_value in ('NONE', 'INFINITY', 'UNLIMITED'):
                    effective_limit = float('inf')
                else:
                    effective_limit = int(limit_value)
            except Exception as e:
                logger.error(f"Error fetching global token limit: {e}")
                effective_limit = 100000
            
            if effective_limit == float('inf'):
                remaining = float('inf')
            else:
                remaining = max(0, effective_limit - current_tokens)
            
            return {
                'tokens_used': current_tokens,
                'daily_limit': effective_limit,
                'remaining_tokens': remaining,
                'hours_until_reset': max(0, 24 - hours_since_reset) if hours_since_reset < 24 else 0,
                'reset_time': next_reset.isoformat(),
                'needs_reset': hours_since_reset >= 24
            }
            
    except Exception as e:
        logger.error(f"Error getting token status for user_session {user_session_id}: {e}")
        raise

def reset_session_daily_tokens(
    connection,
    user_session_id: str
) -> bool:
    """
    Manually reset a user session's daily token count (admin function).
    
    Args:
        connection: Database connection
        user_session_id: User session ID to reset
    
    Returns:
        bool: True if successful
    """
    try:
        with connection.cursor() as cursor:
            now = datetime.now(timezone.utc)
            cursor.execute("""
                UPDATE user_sessions 
                SET tokens_used = 0,
                    updated_at = %s
                WHERE id = %s
            """, (now, user_session_id))
            
            if cursor.rowcount == 0:
                raise ValueError(f"User session {user_session_id} not found")
            
            connection.commit()
            logger.info(f"Manually reset daily tokens for user_session {user_session_id}")
            return True
            
    except Exception as e:
        logger.error(f"Error resetting daily tokens for user_session {user_session_id}: {e}")
        connection.rollback()
        raise
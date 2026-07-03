from datetime import datetime
from croniter import croniter

def get_next_cron_time(cron_expression, base_time=None):
    """
    Parses a cron expression and returns the next execution datetime.
    :param cron_expression: Standard 5-field cron string (e.g. "*/5 * * * *")
    :param base_time: The starting datetime, defaults to current time (UTC)
    :return: datetime object of the next execution time
    """
    if base_time is None:
        base_time = datetime.utcnow()
    
    # Standardize expression (strip spaces)
    cron_str = cron_expression.strip()
    
    # croniter expects the base time to determine next execution
    iter = croniter(cron_str, base_time)
    return iter.get_next(datetime)

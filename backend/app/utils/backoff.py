from datetime import datetime, timedelta

def calculate_next_retry(strategy, backoff_interval, retry_count, max_delay_cap=None):
    """
    Calculates the next run datetime based on backoff strategy.
    :param strategy: 'FIXED', 'LINEAR', or 'EXPONENTIAL'
    :param backoff_interval: base interval in seconds
    :param retry_count: current retry attempt index (1-based)
    :param max_delay_cap: optional maximum delay ceiling in seconds
    :return: datetime object for next retry run
    """
    if strategy == 'LINEAR':
        seconds = backoff_interval * retry_count
    elif strategy == 'EXPONENTIAL':
        seconds = backoff_interval * (2 ** (retry_count - 1))
    else: # FIXED
        seconds = backoff_interval

    if max_delay_cap is not None:
        seconds = min(seconds, max_delay_cap)

    return datetime.utcnow() + timedelta(seconds=seconds)

import unittest
from datetime import datetime, timedelta
from app.utils.backoff import calculate_next_retry
from app.utils.cron import get_next_cron_time

class TestSchedulerUtilities(unittest.TestCase):

    def test_fixed_backoff(self):
        # Base interval 10s, retry 1
        next_run = calculate_next_retry('FIXED', 10, 1)
        now = datetime.utcnow()
        diff = (next_run - now).total_seconds()
        self.assertTrue(9 <= diff <= 11)

        # Base interval 10s, retry 3 (should remain fixed at 10s)
        next_run_3 = calculate_next_retry('FIXED', 10, 3)
        diff_3 = (next_run_3 - now).total_seconds()
        self.assertTrue(9 <= diff_3 <= 11)

    def test_linear_backoff(self):
        # Base interval 5s, retry 1 -> 5s
        next_run_1 = calculate_next_retry('LINEAR', 5, 1)
        now = datetime.utcnow()
        diff_1 = (next_run_1 - now).total_seconds()
        self.assertTrue(4 <= diff_1 <= 6)

        # Base interval 5s, retry 3 -> 15s
        next_run_3 = calculate_next_retry('LINEAR', 5, 3)
        diff_3 = (next_run_3 - now).total_seconds()
        self.assertTrue(14 <= diff_3 <= 16)

    def test_exponential_backoff(self):
        # Base interval 2s, retry 1 -> 2 * (2^0) = 2s
        next_run_1 = calculate_next_retry('EXPONENTIAL', 2, 1)
        now = datetime.utcnow()
        diff_1 = (next_run_1 - now).total_seconds()
        self.assertTrue(1 <= diff_1 <= 3)

        # Base interval 2s, retry 3 -> 2 * (2^2) = 8s
        next_run_3 = calculate_next_retry('EXPONENTIAL', 2, 3)
        diff_3 = (next_run_3 - now).total_seconds()
        self.assertTrue(7 <= diff_3 <= 9)

        # Base interval 2s, retry 4 -> 2 * (2^3) = 16s
        next_run_4 = calculate_next_retry('EXPONENTIAL', 2, 4)
        diff_4 = (next_run_4 - now).total_seconds()
        self.assertTrue(15 <= diff_4 <= 17)

    def test_cron_parsing(self):
        # Run every 5 minutes
        cron_expr = "*/5 * * * *"
        base = datetime(2026, 7, 3, 12, 0, 0) # 12:00
        next_run = get_next_cron_time(cron_expr, base)
        self.assertEqual(next_run, datetime(2026, 7, 3, 12, 5, 0)) # Should be 12:05

        # Run at 8 AM every day
        cron_daily = "0 8 * * *"
        next_run_daily = get_next_cron_time(cron_daily, base)
        self.assertEqual(next_run_daily, datetime(2026, 7, 4, 8, 0, 0)) # Should be next day 8:00 AM

if __name__ == '__main__':
    unittest.main()

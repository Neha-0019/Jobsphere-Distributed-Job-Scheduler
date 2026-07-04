import os
import sys
import time
import signal
from dotenv import load_dotenv
from app import create_app
from app.worker import WorkerDaemon

# Load environmental variables
load_dotenv()

app = create_app()
worker = None

def signal_handler(sig, frame):
    """Signal handler for clean SIGINT / SIGTERM shutdown."""
    print("\nReceived shutdown signal. Stopping services...")
    if worker:
        worker.stop()
    sys.exit(0)

# Register signal handlers
signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

if __name__ == '__main__':
    mode = 'both'
    if len(sys.argv) > 1:
        arg = sys.argv[1].lower()
        if arg in ['api', 'worker', 'both']:
            mode = arg

    # Configs
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'True').lower() == 'true'

    if mode == 'worker':
        # Start Worker only
        worker = WorkerDaemon(
            app=app,
            max_concurrency=app.config['MAX_WORKER_CONCURRENCY'],
            poll_interval=app.config['POLL_INTERVAL'],
            heartbeat_interval=app.config['HEARTBEAT_INTERVAL']
        )
        worker.start()
        print(f"Running in Worker-Only mode. Press Ctrl+C to exit.")
        # Keep main thread alive
        try:
            while True:
                signal.pause() if hasattr(signal, 'pause') else time.sleep(1)
        except (KeyboardInterrupt, SystemExit):
            worker.stop()
            
    elif mode == 'api':
        # Start API only
        print(f"Running in API-Only mode on port {port}...")
        app.run(host='0.0.0.0', port=port, debug=debug, use_reloader=False)
        
    else:
        # Start both API and Worker (Default)
        print("Starting in Combined mode (API + Worker)...")
        worker = WorkerDaemon(
            app=app,
            max_concurrency=app.config['MAX_WORKER_CONCURRENCY'],
            poll_interval=app.config['POLL_INTERVAL'],
            heartbeat_interval=app.config['HEARTBEAT_INTERVAL']
        )
        worker.start()
        
        # Run Flask server
        try:
            app.run(host='0.0.0.0', port=port, debug=debug, use_reloader=False)
        finally:
            # When flask server exits, stop background worker
            worker.stop()

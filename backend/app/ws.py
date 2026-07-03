from flask_sock import Sock
import json
import logging

logger = logging.getLogger(__name__)

sock = Sock()
active_connections = set()

def init_ws(app):
    """Initializes the Flask-Sock extension with the app."""
    sock.init_app(app)
    logger.info("WebSocket server endpoint initialized at /ws")

@sock.route('/ws')
def ws_handler(ws):
    """Handles incoming WebSocket connections and keeps them active."""
    active_connections.add(ws)
    logger.info(f"WebSocket client connected. Active connections: {len(active_connections)}")
    try:
        while True:
            # Block and wait for messages from the client (or connection close)
            # We don't expect client messages, but this keeps the socket open
            ws.receive()
    except Exception:
        pass
    finally:
        active_connections.discard(ws)
        logger.info(f"WebSocket client disconnected. Active connections: {len(active_connections)}")

def broadcast_event(event_name, data=None):
    """Broadcasts a JSON event to all currently connected clients."""
    if not active_connections:
        return
        
    message = json.dumps({
        'event': event_name,
        'data': data
    })
    
    # Broadcast copy to avoid modification during iteration
    for ws in list(active_connections):
        try:
            ws.send(message)
        except Exception:
            active_connections.discard(ws)

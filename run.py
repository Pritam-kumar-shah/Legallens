"""
LegalLens — Local Development Server
Starts a lightweight local HTTP server with automatic browser launch.
Usage: python run.py [port]
"""

import sys
import os
import webbrowser
import http.server
import socketserver

DEFAULT_PORT = 8080

class LegalLensHandler(http.server.SimpleHTTPRequestHandler):
    """Custom HTTP request handler with proper MIME types and CORS headers."""
    
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def log_message(self, format, *args):
        # Clean terminal output
        sys.stdout.write(f"[LegalLens] {args[0]} - {args[1]}\n")

def run(port=DEFAULT_PORT):
    # Ensure working directory is the script directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    handler = LegalLensHandler
    
    try:
        with socketserver.TCPServer(("", port), handler) as httpd:
            url = f"http://localhost:{port}"
            print("=" * 60)
            print("  ⚖️  LegalLens — AI Legal Document Assistant")
            print("=" * 60)
            print(f"  Server running at: {url}")
            print("  Opening browser automatically...")
            print("  Press Ctrl+C to stop the server.")
            print("=" * 60)
            
            try:
                webbrowser.open(url)
            except Exception:
                pass
                
            httpd.serve_forever()
    except OSError as e:
        if "Address already in use" in str(e) or e.errno == 98 or e.errno == 10048:
            print(f"Port {port} is in use, trying {port + 1}...")
            run(port + 1)
        else:
            raise e
    except KeyboardInterrupt:
        print("\n[LegalLens] Server stopped. Goodbye!")

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    run(port)

"""Static server for local testing.

Sends no-store on everything. Plain `python -m http.server` lets mobile Safari
cache ES modules independently, which can leave a device running a mix of old
and new files — the symptoms of that look like application bugs.

Also collects the ?debug readout from a device into debug.log, via GET /log?m=…
so it works without fetch, beacons or CORS.

    python dev-server.py [port]
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote_plus

PIXEL = bytes.fromhex('47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b')


def record(line):
    with open('debug.log', 'a', encoding='utf-8') as f:
        f.write(line + '\n')
    print('  LOG', line, flush=True)


class DevHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def send_header(self, keyword, value):
        # Last-Modified is what lets a browser cache heuristically and then skip
        # revalidating entirely. Without it there is nothing to go stale on.
        if keyword == 'Last-Modified':
            return
        super().send_header(keyword, value)

    def do_GET(self):
        # Never answer 304: a conditional request means the device still holds a
        # copy, and during device testing it should always take the new one.
        del self.headers['If-Modified-Since']
        del self.headers['If-None-Match']

        parsed = urlparse(self.path)
        if parsed.path == '/log':
            record(unquote_plus(parse_qs(parsed.query).get('m', [''])[0]))
            self.send_response(200)
            self.send_header('Content-Type', 'image/gif')
            self.send_header('Content-Length', str(len(PIXEL)))
            self.end_headers()
            self.wfile.write(PIXEL)
            return
        super().do_GET()

    def do_POST(self):
        if self.path != '/log':
            self.send_error(404)
            return
        length = int(self.headers.get('Content-Length', 0))
        record(self.rfile.read(length).decode('utf-8', 'replace'))
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        # Keep the access log — knowing whether a device fetched anything at all
        # is the difference between a code bug and a stale cache.
        sys.stderr.write('%s %s\n' % (self.address_string(), fmt % args))


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    print(f'serving with no-store on 0.0.0.0:{port}', flush=True)
    ThreadingHTTPServer(('0.0.0.0', port), DevHandler).serve_forever()

import os
from http.server import SimpleHTTPRequestHandler, HTTPServer

os.chdir('.')
server_address = ('', 8000)
Handler = SimpleHTTPRequestHandler
Handler.extensions_map.update({
      ".js": "application/javascript",
})
httpd = HTTPServer(server_address, Handler)
httpd.serve_forever()
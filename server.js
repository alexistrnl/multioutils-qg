const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = 5500
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' }

http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0]
  const filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath))

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Pas de fichier a ce chemin : c'est probablement une route cote client
      // (/accueil, /tournoi1, ...), pas un asset manquant -> on sert la page
      // et le routeur JS se charge d'afficher la bonne vue.
      if (!path.extname(urlPath)) {
        fs.readFile(path.join(__dirname, 'index.html'), (err2, indexData) => {
          if (err2) {
            res.writeHead(404)
            res.end('Not found')
            return
          }
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(indexData)
        })
        return
      }
      res.writeHead(404)
      res.end('Not found')
      return
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream' })
    res.end(data)
  })
}).listen(PORT, () => console.log(`http://localhost:${PORT}`))

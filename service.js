import process from 'process'
import { exec } from 'child_process'
import OrionDB from './index.js'

const port = process.env.SOCKET_PORT || 5665
const PASSWORD = process.env.PASSWORD || '12345';

let WebSocket

try {
    WebSocket = await import('ws')
    socketInit()
} catch(e) {
    exec('npm install ws', async (err, out, dec) => {
        WebSocket = await import('ws')
        socketInit()
    })
}

function socketInit() {
    let server = new WebSocket.WebSocketServer({port: port})
    console.log('</>', 'Service Started At Port', port)

    orionConnect(server)
}

function orionConnect(server) {
    server.on('connection', (ws, req, client) => {
        const path = req.url
        const match = path.match(/^\/([^@]+)@([^/]+)\/(.+)$/)
        if(!match) {
            return ws.close(1000, 'Invalid format');
        } 

        const [_, dbname, passw, col] = match

        if(passw !== PASSWORD) {
            ws.send(message('error', 'wrong password'));
            ws.close()
            return false
        }

        const db = new OrionDB(dbname).select(col)

        ws.on('message', async (data, binary) => {
            try {
                data = JSON.parse(data) || null
                if(!data || !('method' in data)) {
                    return ws.send(message('error', 'Data is null or method'))
                }
            } catch(e) {
                return ws.send(message('error', e.message))
            }

            const method = getMethods(data, db)[data.method]
            if(!method) {return ws.send(message('error', `Unknown method: ${data.method}`))}

            try {
                const result = await method(data)
                ws.send(message(data.method, result))
            } catch(e) {
                ws.send(message('error', `Method ${data.method} failed: ${e.message}`))
            }
        })

        let ping = setInterval(() => {
            ws.send((message('ping', 1)))
        }, 10000)

        ws.on('close', e => { clearInterval(ping) })
        ws.send(message('connection', 'ok'))
    })
}

function getMethods(data, db) {
    return {
            insert: (data) => db.insert(data.value),
            insertMany: (data) => db.insertMany(data.value),
            update: (data) => db.update(data.value[0], data.value[1]),
            remove: (data) => db.remove(data.value),
            get: (data) => db.get(data.value ?? true),
            search: async (data) => await db.search(data.value),
    }
}

function message(type, text) {
    return JSON.stringify({type: type, message: text})
}
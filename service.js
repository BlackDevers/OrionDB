import process from 'process'
import { exec } from 'child_process'
import OrionDB from './index.js'

const port = process.env.SOCKET_PORT || 5665

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
    console.log('Socket Started At Port', port)

    orionConnect(server)
}

function orionConnect(server) {
    server.on('connection', (ws, req, client) => {
        const path = req.url
        const match = path.match(/^\/([^@]+)@([^/]+)\/(.+)$/)

        if(!match) {
            ws.send('Error: Invalid format');
            ws.close()
            return false
        }
        const dbname = match[1]
        const passw = match[2]
        const col = match[3]

        if(passw !== process.env.PASSWORD) {
            ws.send(message('error', 'wrong password'));
            ws.close()
            return false
        }

        const db = new OrionDB(dbname).select(col)

        ws.on('message', async (data, binary) => {
            data = JSON.parse(data) || null
            if(!data) {
                ws.send(message('error', 'data is null'))
                return false
            }

            if('method' in data) {
                if(data.method == 'insert') {
                    let res = db.insert(data.value)
                    ws.send(message('insert', res))
                }
                if(data.method == 'insertMany') {
                     db.insertMany(data.value)
                    ws.send(message('insertMany', 'insertMany()'))
                }
                if(data.method == 'update') {
                    if(data.value.length < 1) {
                        return ws.send(message('error', 'value required: [{}, {}]'))
                    }
                    db.update(data.value[0], data.value[1])
                    ws.send(message('update', 'update()'))
                }
                if(data.method == 'remove') {
                    db.update(data.value)
                    ws.send(message('remove', 'remove()'))
                }
                if(data.method == 'get') {
                    let res = db.get(data.value)
                    ws.send(message('get', res))
                }
                if(data.method == 'search') {
                    let res = await db.search(data.value)
                    ws.send(message('search', res))
                }
            }
        })

        let ping = setInterval(() => {
            ws.send((message('ping', 1)))
        }, 10000)

        ws.on('close', e => {
            ws.close()
            return false
        })

        ws.send(message('connection', 'ok'))
    })
}

function message(type, text) {
    return JSON.stringify({type: type, message: text})
}
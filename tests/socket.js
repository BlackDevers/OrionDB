import WebSocket from "ws"

function run() {
    let socket = new WebSocket('ws://localhost:5665/test_db@12345/users')
    socket.on('open', async (ws) => {
        search(socket)
    })
    
    socket.on('message', (data, buffer) => {
        let dif = JSON.parse(data)
        console.log(dif)
    })

}

function insertMany(ws) {
    let req = {
        method: 'insertMany', 
        value: [{id: 1, test: 'test', cool: 1}, {id: 2, test: 'test2', cool: 2}]
    }
    ws.send(JSON.stringify(req))
    return true
}
run()
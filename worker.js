import { Worker, isMainThread, parentPort, workerData } from 'worker_threads'
import fs from 'fs'
import path from 'path'

if (!isMainThread) {
    const { shard, collectionPath, query } = workerData
    const data = JSON.parse(fs.readFileSync(path.join(collectionPath, shard), 'utf-8'))
    const result = data.filter(item => Object.keys(query).every(key => item[key] === query[key]))
    parentPort.postMessage(result)
}
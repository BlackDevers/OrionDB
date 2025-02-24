const fs = require('fs')
const path = require('path')
const { Worker, isMainThread, parentPort } = require('worker_threads')
const os = require('os')

const SHARD_SIZE = 5000
const CACHE_LIMIT = 10
const MAX_THREADS = Math.min(os.cpus().length, 8) + 2

class OrionDB {
    constructor(dbName, options = { strictData: true }) {
        this.dbPath = path.join('./', dbName)
        this.options = options
        if (!fs.existsSync(this.dbPath)) fs.mkdirSync(this.dbPath)
    }

    select(collectionName, options = { threads: false }) {
        return new CollectionManager(this.dbPath, collectionName, { ...this.options, ...options })
    }
}

class CollectionManager {
    constructor(dbPath, collectionName, options) {
        this.collectionPath = path.join(dbPath, collectionName)
        this.options = options
        if (!fs.existsSync(this.collectionPath)) fs.mkdirSync(this.collectionPath)
        this.schemaPath = path.join(this.collectionPath, 'schema.json')
        if (!fs.existsSync(this.schemaPath)) fs.writeFileSync(this.schemaPath, JSON.stringify({}), 'utf-8')
        this.schema = JSON.parse(fs.readFileSync(this.schemaPath, 'utf-8'))
        this.cache = new Map()
    }

    getShardFiles() {
        return fs.readdirSync(this.collectionPath).filter(f => f.endsWith('.shard'))
    }

    getLatestShard() {
        const shards = this.getShardFiles().sort()
        return shards.length ? shards[shards.length - 1] : this.createNewShard()
    }

    readShard(shard) {
        if (this.cache.has(shard)) return this.cache.get(shard)
        const data = JSON.parse(fs.readFileSync(path.join(this.collectionPath, shard), 'utf-8'))
        this.updateCache(shard, data)
        return data
    }

    writeShard(shard, data) {
        fs.writeFileSync(path.join(this.collectionPath, shard), JSON.stringify(data, null, 2), 'utf-8')
        this.updateCache(shard, data)
    }

    updateCache(shard, data) {
        if (this.cache.size >= CACHE_LIMIT) {
            const oldestKey = this.cache.keys().next().value
            this.cache.delete(oldestKey)
        }
        this.cache.set(shard, data)
    }

    createNewShard() {
        const newShardName = `data_${this.getShardFiles().length + 1}.shard`
        this.writeShard(newShardName, [])
        return newShardName
    }

    validateAndTransform(record) {
        if (!this.options.strictData || !this.schema || Object.keys(this.schema).length === 0) return record
        let transformed = {}
        for (let key in this.schema) {
            let type = this.schema[key]
            let value = record[key]
            if (value === undefined) continue
            if (type === "STRING") transformed[key] = String(value)
            else if (type === "INT") transformed[key] = Number.isInteger(value) ? value : parseInt(value) || null
            else if (type === "FLOAT") transformed[key] = parseFloat(value) || null
            else transformed[key] = value
        }
        return transformed
    }

    insert(record) {
        this.insertMany([record])
    }

    insertMany(records) {
        let latestShard = this.getLatestShard()
        let data = latestShard ? this.readShard(latestShard) : []

        while (records.length > 0) {
            let spaceLeft = SHARD_SIZE - data.length
            let batch = records.splice(0, spaceLeft).map(r => this.validateAndTransform(r))
            data.push(...batch)
            this.writeShard(latestShard, data)
            if (records.length > 0) {
                latestShard = this.createNewShard()
                data = []
            }
        }
    }

    async search(query) {
        return this.options.threads ? this.parallelSearch(query) : this.serialSearch(query)
    }

    serialSearch(query) {
        const results = []
        for (let shard of this.getShardFiles()) {
            let data = this.readShard(shard)
            results.push(...data.filter(item => Object.keys(query).every(key => item[key] === query[key])))
        }
        return results
    }

    parallelSearch(query) {
        return new Promise((resolve, reject) => {
            const shards = this.getShardFiles()
            const workers = []
            const results = []
            let completed = 0
            let activeWorkers = 0

            const startWorker = (shard) => {
                if (activeWorkers >= MAX_THREADS) return

                activeWorkers++
                const worker = new Worker(path.join(__dirname, "worker.js"), {
                    workerData: { shard, collectionPath: this.collectionPath, query }
                })

                worker.on('message', (data) => {
                    results.push(...data)
                    activeWorkers--
                    completed++
                    if (completed === shards.length || shards.length === 0) resolve(results)
                    else if (shards.length > 0) startWorker(shards.shift())
                })
                
                workers.push(worker)
            }

            while (shards.length > 0 && activeWorkers < MAX_THREADS) {
                startWorker(shards.shift())
            }
        })
    }

    remove(query) {
        for (let shard of this.getShardFiles()) {
            let data = this.readShard(shard)
            const filteredData = data.filter(item => !Object.keys(query).every(key => item[key] === query[key]))
            if (filteredData.length !== data.length) {
                this.writeShard(shard, filteredData)
            }
        }
    }

    get(asSingleArray = true) {
        const allData = this.getShardFiles().map(shard => this.readShard(shard))
        return asSingleArray ? allData.flat() : allData
    }
}

module.exports = OrionDB

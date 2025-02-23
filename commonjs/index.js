const fs = require('fs');
const path = require('path');
const { Worker, isMainThread, parentPort } = require('worker_threads');

const SHARD_SIZE = 5000;
const CACHE_LIMIT = 10000;

class OrionDB {
    constructor(dbName, options = { strictData: true }) {
        this.dbPath = path.join('./', dbName);
        this.options = options;
        if (!fs.existsSync(this.dbPath)) fs.mkdirSync(this.dbPath);
    }

    select(collectionName, options = { threads: false }) {
        return new CollectionManager(this.dbPath, collectionName, { ...this.options, ...options });
    }
}

class CollectionManager {
    constructor(dbPath, collectionName, options) {
        this.collectionPath = path.join(dbPath, collectionName);
        this.options = options;
        if (!fs.existsSync(this.collectionPath)) fs.mkdirSync(this.collectionPath);
        this.schemaPath = path.join(this.collectionPath, 'schema.json');
        this.indexPath = path.join(this.collectionPath, 'index.json');
        if (!fs.existsSync(this.schemaPath)) fs.writeFileSync(this.schemaPath, JSON.stringify({}), 'utf-8');
        if (!fs.existsSync(this.indexPath)) fs.writeFileSync(this.indexPath, JSON.stringify({}), 'utf-8');
        this.schema = JSON.parse(fs.readFileSync(this.schemaPath, 'utf-8'));
        this.index = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'));
        this.cache = new Map();
    }

    getShardFiles() {
        return fs.readdirSync(this.collectionPath).filter(f => f.endsWith('.shard'));
    }

    getLatestShard() {
        const shards = this.getShardFiles().sort();
        return shards.length ? shards[shards.length - 1] : this.createNewShard();
    }

    readShard(shard) {
        return JSON.parse(fs.readFileSync(path.join(this.collectionPath, shard), 'utf-8'));
    }

    writeShard(shard, data) {
        fs.writeFileSync(path.join(this.collectionPath, shard), JSON.stringify(data, null, 2), 'utf-8');
    }

    createNewShard() {
        const newShardName = `data_${this.getShardFiles().length + 1}.shard`;
        this.writeShard(newShardName, []);
        return newShardName;
    }

    insert(record) {
        this.insertMany([record]);
    }

    insertMany(records) {
        let latestShard = this.getLatestShard();
        let data = latestShard ? this.readShard(latestShard) : [];

        while (records.length > 0) {
            let spaceLeft = SHARD_SIZE - data.length;
            let batch = records.splice(0, spaceLeft);
            data.push(...batch);
            this.writeShard(latestShard, data);
            if (records.length > 0) {
                latestShard = this.createNewShard();
                data = [];
            }
        }
    }

    search(query) {
        if (this.options.threads) {
            return this.parallelSearch(query);
        }
        return this.serialSearch(query);
    }

    serialSearch(query) {
        const results = [];
        for (let shard of this.getShardFiles()) {
            let data = this.readShard(shard);
            results.push(...data.filter(item => Object.keys(query).every(key => item[key] === query[key])));
        }
        return results;
    }

    parallelSearch(query) {
        return new Promise((resolve) => {
            const shards = this.getShardFiles();
            let results = [];
            let completed = 0;
            
            for (let shard of shards) {
                const worker = new Worker(__filename, { workerData: { shard, collectionPath: this.collectionPath, query } });
                worker.on('message', (data) => {
                    results.push(...data);
                    if (++completed === shards.length) resolve(results);
                });
            }
        });
    }

    match(field, regex) {
        const results = [];
        for (let shard of this.getShardFiles()) {
            let data = this.readShard(shard);
            data.forEach((item, index) => {
                if (regex.test(item[field])) {
                    results.push({ shard, index, data: item });
                }
            });
        }
        return results;
    }

    update(query, newValues) {
        for (let shard of this.getShardFiles()) {
            let data = this.readShard(shard);
            let modified = false;
            for (let item of data) {
                if (Object.keys(query).every(key => item[key] === query[key])) {
                    Object.assign(item, newValues);
                    modified = true;
                }
            }
            if (modified) this.writeShard(shard, data);
        }
    }

    remove(query) {
        for (let shard of this.getShardFiles()) {
            let data = this.readShard(shard);
            const filteredData = data.filter(item => !Object.keys(query).every(key => item[key] === query[key]));
            if (filteredData.length !== data.length) this.writeShard(shard, filteredData);
        }
    }

    get(asSingleArray = true) {
        const allData = this.getShardFiles().map(shard => this.readShard(shard));
        return asSingleArray ? allData.flat() : allData;
    }
}

if (!isMainThread) {
    const { workerData } = require('worker_threads');
    const { shard, collectionPath, query } = workerData;
    const data = JSON.parse(fs.readFileSync(path.join(collectionPath, shard), 'utf-8'));
    const result = data.filter(item => Object.keys(query).every(key => item[key] === query[key]));
    parentPort.postMessage(result);
}

module.exports = OrionDB
import OrionDB from '../index.js'

const db = new OrionDB('test_db', {strict: 0}).select('users', {threads: 0})
const mass = []

for(let i = 0; i <= 25000; i++) {
    mass.push({
        id: i,
        username: 'user'+i
    })
}

db.insertMany(mass)

async function run() {
    console.log(await db.search({id: 7777}))
}

run()

console.log('ok')
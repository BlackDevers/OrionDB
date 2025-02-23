import OrionDB from '../index.js'

const db = new OrionDB('test_db', {strict: 0}).select('users', {threads: 0})
const mass = []

for(let i = 0; i < 10000; i++) {
    mass.push({
        id: i,
        username: 'user'+i
    })
}

db.insertMany(mass)

async function run() {
    console.log(await db.search({id: 529505}))
}

run()

console.log('ok')
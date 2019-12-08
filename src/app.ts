import * as admin from 'firebase-admin'

let serviceAccount = require('../credentials/lcz-db-0dfaa858e54c.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()

interface BookData {
  id: number,
  url: string,
  shelfs: string[],
  rating: number | undefined,
  title: string,
  author: string,
  genre: string,
  pages: number,
  ISBN: number
}

let books: BookData[]
db.collection('books').get()
  .then(snapshot => {
    snapshot.forEach(doc => {
      console.log(doc.id, '=>', doc.data());
    })
  })

/** @format */

import * as admin from 'firebase-admin'
import * as cheerio from 'cheerio'
import * as request from 'request'
import * as fs from 'fs'

import { data } from '../data'

let serviceAccount = require('../credentials/lcz-db-0dfaa858e54c.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const db = admin.firestore()

interface BookData {
  id: number
  url: string
  shelfs: string[]
  rating: number | undefined
  title: string
  author: string
  genre: string
  pages: number
  ISBN: number | string | null
}

interface GenreData {
  genre: string
  numberOfBooks: number
  books: number[]
}

interface ShelfData {
  shelf: string
  numberOfBooks: number
  numberOfPages: number
  books: number[]
}

interface PageData {
  book: BookData[]
  genre: GenreData[]
  shelfs: ShelfData[]
}

interface InputData {
  url: string
  shelfs: string[]
  rating: number
}

async function app() {
  const inputData: InputData = {
    url: 'https://lubimyczytac.pl/ksiazka/4937141/ikabog',
    shelfs: ['Przeczytane', '2023'],
    rating: 5
  }
  // 'Uczta wyobraźni'
  let newBookData: BookData = await getNewBookData(inputData)

  console.log(` == New book data == `)
  console.log(newBookData)

  // await insertNewBook(newBookData)

  // await printYear()
  // console.log('shelfBooks', shelfBooks)
  // updatePagesCountInShelfs(['Przeczytane', '2020'])
  // udateGenres()
}

const removeEmptySpacesFromTtiles = async () => {
  const booksRef = db.collection('books');
  const snapshot = await booksRef.get();
  const regex = /^\s+|\s+$/gm

  for (let i = 0; i < snapshot.docs.length; i++) {
    const bookDoc = snapshot.docs[i]
    const bookData = bookDoc.data()

    const regexReturn = regex.test(bookData.title)

    if (regexReturn) {
      const newTitle = bookData.title.trim()
      console.log(newTitle)
      await db.collection('books').doc(bookDoc.id).update({title: newTitle})
    }
  }
}

const getAllDataFromFirebase = async (): Promise<PageData> => {
  return {
    book: await getBooksData(),
    genre: await getGenreData(),
    shelfs: await getShelfsData(),
  }
}

const getBooksData = async (): Promise<BookData[]> => {
  return await db
    .collection('books')
    .get()
    .then((data): BookData[] => {
      let books: BookData[] = []
      data.forEach((doc) => {
        let docData = doc.data()
        books.push({
          id: docData.id,
          url: docData.url,
          shelfs: docData.shelfs,
          rating: docData.rating,
          title: docData.title,
          author: docData.author,
          genre: docData.genre,
          pages: docData.pages,
          ISBN: docData.ISBN,
        })
      })
      return books
    })
}

const getGenreData = async (): Promise<GenreData[]> => {
  return await db
    .collection('genres')
    .get()
    .then((data) => {
      let genres: GenreData[] = []
      data.forEach((doc) => {
        let docData = doc.data()
        genres.push({
          genre: docData.genre,
          numberOfBooks: docData.numberOfBooks,
          books: docData.books,
        })
      })
      return genres
    })
}

const getShelfsData = async (): Promise<ShelfData[]> => {
  return await db
    .collection('shelfs')
    .get()
    .then((data) => {
      let shelfs: ShelfData[] = []
      data.forEach((doc) => {
        let docData = doc.data()
        shelfs.push({
          shelf: docData.shelf,
          numberOfBooks: docData.numberOfBooks,
          numberOfPages: docData.numberOfPages,
          books: docData.books,
        })
      })
      return shelfs
    })
}

const getNewBookData = async (inputData: InputData): Promise<BookData> => {
  const $ = cheerio.load(await readPageHtml(inputData.url))
  console.log(` == Reading page html == `)
  return {
    id: Number($('button.btn-rate').attr('data-bookid')),
    url: inputData.url,
    shelfs: inputData.shelfs,
    rating: inputData.rating,
    title: $("h1.book__title").text().substring(1).trim(),
    // title: $('meta[property="og:title"]').attr('content'),
    author: $('a.link-name').text(),
    genre: $('li.breadcrumb-item').slice(2).children('a').text(),
    pages: Number(
      $('#book-details dl dt:contains("Liczba stron:")').next().text()
    ),
    ISBN: $('meta[property="books:isbn"]').attr('content'),
  }
}

const readPageHtml = (pageURL: string): Promise<string> => {
  console.log(` == Requesting page: ${pageURL} == `)
  return new Promise((resolve, reject) => {
    request(pageURL, (error, response, BODY) => {
      resolve(BODY)
    })
  })
}

const insertNewBook = async (bookData: BookData) => {
  console.log(' === Inserting new book === ')
  await db.collection('books').doc(bookData.id.toString()).set(bookData)

  bookData.shelfs.forEach(async (shelf) => {
    addBookToShelf(shelf, bookData)
  })
  console.log(' === New book added === ')
}

const deleteBookFromShelf = async (shelf: string, bookData: BookData) => {
  let shelfData: ShelfData = await db
    .collection('shelfs')
    .doc(shelf)
    .get()
    .then((doc): ShelfData => {
      let data = doc.data()
      return {
        shelf: data.shelf,
        numberOfBooks: data.numberOfBooks,
        numberOfPages: data.numberOfPages,
        books: data.books,
      }
    })
  await db
    .collection('shelfs')
    .doc(shelf)
    .update({
      numberOfBooks: shelfData.numberOfBooks--,
      numberOfPages: shelfData.numberOfPages - bookData.pages,
      books: admin.firestore.FieldValue.arrayRemove(bookData.id),
    })
  console.log(` == Book deleted from shelf: ${shelf} == `)
}

const addBookToShelf = async (shelf: string, bookData: BookData) => {
  let shelfData: ShelfData = await db
    .collection('shelfs')
    .doc(shelf)
    .get()
    .then((doc): ShelfData => {
      let data = doc.data()
      return {
        shelf: data.shelf,
        numberOfBooks: data.numberOfBooks,
        numberOfPages: data.numberOfPages,
        books: data.books,
      }
    })
  await db
    .collection('shelfs')
    .doc(shelf)
    .update({
      numberOfBooks: shelfData.numberOfBooks + 1,
      numberOfPages: shelfData.numberOfPages + bookData.pages,
      books: admin.firestore.FieldValue.arrayUnion(bookData.id),
    })
  console.log(` == Book added to shelf: ${shelf} == `)
}

const updatePagesCountInShelfs = async (shelfsToUpdate: string[]) => {
  let books: BookData[] = await getBooksData()
  let shelfs: ShelfData[] = await getShelfsData()

  let numberOfPages: number[] = shelfsToUpdate.map((shelf): number => {
    let pagesNumber = 0
    shelfs
      .find((el: ShelfData) => el.shelf === shelf)
      .books.forEach((bookId) => {
        pagesNumber += books.find((el: BookData) => el.id === bookId).pages
      })
    return pagesNumber
  })

  for (let id in shelfsToUpdate) {
    db.collection('shelfs').doc(shelfsToUpdate[id]).update({
      numberOfPages: numberOfPages[id],
    })
    console.log(` == Shelf pages count updated: ${shelfsToUpdate[id]} == `)
  }
}

const updateGenres = async () => {
  const shelfData: ShelfData = await db
    .collection('shelfs')
    .doc('Przeczytane')
    .get()
    .then((data) => {
      let docData = data.data()
      return {
        shelf: docData.shelf,
        numberOfBooks: docData.numberOfBooks,
        numberOfPages: docData.numberOfPages,
        books: docData.books,
      }
    })

  let promises = []
  promises.push(shelfData.books.map(async (bookId) => {}))
}

const printYear = async () => {
  const shelfsData = await getShelfsData()
  const books = await getBooksData()
  const data = shelfsData[8]

  const numberOfBooks = data.numberOfBooks
  const numberOfPages = data.numberOfPages
  const shelfBooksIds = data.books

  const shelfBooks = books.filter((book) => shelfBooksIds.includes(book.id))

  const booksToSave = shelfBooks.map((book) => ({
    title: book.title,
    author: book.author,
    genre: book.genre,
    pages: book.pages,
    rating: book.rating,
  }))

  console.log(' ===  2021 ===')
  console.log('')
  console.log('numberOfBooks', numberOfBooks)
  console.log('numberOfPages', numberOfPages)
  console.log('pages per book avg:', numberOfPages / numberOfBooks)
  console.log('')

  booksToSave.map((book) => {
    console.log(`== ${book.title} ==`)
    console.log(`author: ${book.author}`)
    console.log(`genre: ${book.genre}`)
    console.log(`pages: ${book.pages}`)
    console.log(`rating: ${book.rating}`)
    console.log('')
  })
}

app()

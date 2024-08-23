import pg from "pg";
import bodyParser from "body-parser";
import express from "express"
import session from "express-session";
import { check } from "express-validator";
import axios from "axios";


const app = express();
const port = 3000;
const API = "https://openlibrary.org/search.json"
var is_auth = false;

app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static("public"));

const db = new pg.Client({
    user: process.env.USERNAME,
    host: process.env.HOST,
    database: process.env.DATABASE,
    password: process.env.PASSWORD,
    port: process.env.PORT
});

db.connect();

app.use(session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false
}));

const checkAuthentication = (req, res, next) => {
    if (req.session.user) {
        res.locals.isAuthenticated = true;
        next();
    } else {
        res.locals.isAuthenticated = false;
        res.redirect('/login'); // Redirect to login if not authenticated
    }
};

// async function isAuthenticated(user_id){
//     const user = await db.query("SELECT user")
// }

app.get("/", async(req, res) => {
    const users = await db.query("SELECT * FROM Users");
    // console.log(users.rows);
    return res.render("index.ejs", {users: users.rows});
})

app.all("/login", async (req, res) => {
    if (req.method === "POST") {
        const { username, email, password } = req.body;
        
        try {
            // Fetch the user with the provided username or email
            const userResult = await db.query("SELECT * FROM Users WHERE username = $1 OR email = $2", [username, email]);
            
            if (userResult.rows.length === 0) {
                throw new Error("No user found with the given username or email.");
            }
            
            const user = userResult.rows[0];

            // Validate the password
            if (user.password !== password) {
                throw new Error("Invalid password.");
            }

            // Establish session
            req.session.user = user;

            // Fetch user's book collection
            const bookDetailsResult = await db.query("SELECT * FROM Users JOIN books ON Users.id = books.user_id WHERE Users.id = $1", [user.id]);
            
            res.render("Book_collection.ejs", { 
                book_details: bookDetailsResult.rows, 
                name: user.username, 
                isAuthenticated: req.session.user ? true : false 
            });

        } catch (error) {
            console.error(error);
            const message = error.message;
            return res.render("login.ejs", { error_message: message });
        }
    } else {
        // if(res.session.user ? true : false){
        //     res.redirect(`/collection/${res.session.user.id}`);
        // }
        return res.render("login.ejs", {error_message: false});
    }
});

app.all("/register", async(req, res) => {
    if (req.method === "POST"){
        try{
            const name = req.body.name;
            const username = req.body.username;
            const email = req.body.email;
            const password = req.body.password;
            const collection = req.body.collection;
            const about = req.body.about;
            console.log(name, username, email, password, collection, about);

            await db.query("INSERT INTO Users(name, username, email, password, collection, about) VALUES($1, $2, $3, $4, $5, $6)", [name.toUpperCase(), username, email, password, collection, about]);
            return res.render("login.ejs")
        }
        catch(error){
            return res.render("login.ejs", {error_message: "User is already registered Login instead."});
        }
    }
    return res.render("register.ejs");
})

app.all("/create", checkAuthentication, async(req, res) => {
    if (req.method === "POST"){
        try{
            const book_name = req.body.book_name;
            const author_name = req.body.author_name;
            const isbn = req.body.isbn;
            const description = req.body.description;
            const notes = req.body.my_notes;
            const cover = req.body.cover;
            const date = req.body.date;
            const rating = req.body.rating;
            const user_id = req.session.user.id;

            await db.query("INSERT INTO books (book_name, author_name, isbn, description, notes, cover, date, rating, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ", [book_name.toUpperCase(), author_name.toUpperCase(), isbn, description, notes, cover, date, rating, user_id]);
            const bookDetailsResult = await db.query("SELECT * FROM Users JOIN books ON Users.id = books.user_id WHERE Users.id = $1", [user_id]);
                
            return res.render("Book_collection.ejs", { 
                book_details: bookDetailsResult.rows, 
                name: bookDetailsResult.rows[0].username, 
                isAuthenticated: req.session.user ? true : false 
            });
            // return res.redirect(`/collection/${user_id}`);
        }catch(error){
            return res.render("Book_collection.ejs",{
                book_details: bookDetailsResult.rows,
                name: req.session.user.username,
                isAuthenticated: req.session.user? true: false
            });
            // return res.redirect(`/collection/${req.session.user.id}`);
        }

    }
    return res.render("Create.ejs", {book_details: false});
})

app.all("/book_read/:id", async (req, res) => {
    const id = req.params.id;
    try {
        const bookResult = await db.query("SELECT * FROM books WHERE id = $1", [id]);
        
        if (bookResult.rows.length === 0) {
            return res.status(404).send('Book not found');
        }

        const book = bookResult.rows[0];
        const userResult = await db.query("SELECT username FROM Users WHERE id = $1", [book.user_id]);

        if (userResult.rows.length === 0) {
            return res.status(404).send('User not found');
        }

        const username = userResult.rows[0].username;

        res.render("Book_read.ejs", {
            my_book: book,
            username: username,
            isAuthenticated: req.session.user ? true : false
        });
    } catch (err) {
        console.error('Error fetching book or user:', err);
        return res.status(500).send('Internal Server Error');
    }
});

app.get("/collection/:id", async(req, res) => {
    const id = req.params.id;
    try {
        const all_books = await db.query("SELECT * FROM Users JOIN books ON Users.id = user_id WHERE user_id = $1", [id]);
        // console.log(all_books.rows);
        const user = await db.query("SELECT username FROM Users WHERE id = $1", [id]);
        
        if (all_books.rows.length > 0) {
            return res.render("Book_collection.ejs", {
                book_details: all_books.rows,
                name: all_books.rows[0].username,
                isAuthenticated: req.session.user ? true : false
            });
        } else {
            // const username = await db.query("SELECT username FROM Users WHERE id = $1", [id]);
            return res.render("Book_collection.ejs", {
                book_details: [],
                name: user.rows[0].username,
                isAuthenticated: req.session.user ? true : false
            });
        }
    } catch (error) {
        console.error("Error fetching books:", error);
        return res.status(500).send("Internal Server Error");
    }
})

app.all("/update_book/:book_name/:id", checkAuthentication, async(req, res) => {
    const book_id = req.params.id;
    const b_name = req.params.book_name;
    
    if(req.method === "POST"){
        const {book_name, author_name, isbn, description, notes, date, rating, cover} = req.body;
        await db.query("UPDATE books SET book_name = $1, author_name = $2, isbn = $3, description = $4, notes = $5, date = $6, rating = $7, user_id = $8, cover = $9 WHERE user_id = $10 and book_name = $11", [book_name, author_name, isbn, description, notes, date, rating, book_id, cover, book_id, book_name]);
        const books = await db.query("SELECT * FROM Users JOIN books ON Users.id = user_id WHERE user_id = $1", [book_id]);
        const user_name = books.rows[0].username;
        // console.log(books.rows);
        return res.render("Book_collection.ejs", {book_details: books.rows, name: user_name, isAuthenticated: req.session.user ? true: false});
    }
    const book = await db.query("SELECT * FROM books WHERE user_id = $1 AND book_name = $2", [book_id, b_name]);
    // console.log(book.rows);

    res.render("Create.ejs", {book_details : book.rows[0]});
})

// app.get("/update_book/:book_name/:id", checkAuthentication, async (req, res) => {
//     const book_id = req.params.id;
//     const book_name = req.params.book_name;
//     console.log("GET request received");
//     console.log("Book ID:", book_id);
//     console.log("Book Name:", book_name);

//     try {
//         const book = await db.query("SELECT * FROM books WHERE user_id = $1 AND book_name = $2", [book_id, book_name]);
//         console.log("Book query result:", book.rows);

//         if (book.rows.length > 0) {
//             res.render("Create.ejs", { book_details: book.rows[0] });
//         } else {
//             res.status(404).send("Book not found");
//         }
//     } catch (error) {
//         console.error("Error fetching book:", error);
//         res.status(500).send("Internal Server Error");
//     }
// });


// app.post("/update_book/:book_name/:id", checkAuthentication, async (req, res) => {
//     const book_id = req.params.id;
//     const book_name = req.params.book_name;
//     console.log("POST request received");
//     console.log("Book ID:", book_id);
//     console.log("Book Name:", book_name);

//     try {
//         const books = await db.query("SELECT * FROM Users JOIN books ON Users.id = user_id WHERE user_id = $1", [book_id]);
//         const user_name = books.rows[0].username;
//         console.log("Books query result:", books.rows);

//         res.render("Book_collection.ejs", { book_details: books.rows, name: user_name, isAuthenticated: req.session.user ? true : false });
//     } catch (error) {
//         console.error("Error updating book:", error);
//         res.status(500).send("Internal Server Error");
//     }
// });


app.all("/search", async(req, res) => {
    if (req.method === 'POST') {
        const name = req.body.search;
        const ref_name = name.replaceAll(' ', '+');
        const lower_name = ref_name.toLowerCase();

        try {
            const response = await axios.get(`https://openlibrary.org/search.json?title=${lower_name}`);
            const book = response.data;
            // console.log(book.docs[2].isbn[0]);
            return res.render('Create.ejs', { books: book.docs, title: name.toUpperCase(), book_details: false }); // Pass book data to the template
        } catch (error) {
            console.error(error);
            return res.render('Create.ejs', { error: 'An error occurred while fetching book data.', book_details: false });
        }
    } else {
        return res.render('Create.ejs', {book_details: false});
    }
})

app.all("/search_author", async(req, res) => {
    if(req.method === "POST"){
        const name = req.body.search_me;
        try{
            const user = await db.query("SELECT * FROM Users WHERE name = $1 OR username = $2", [name.toUpperCase(), name]);
            return res.render("index.ejs", {users: user.rows, no_users: false});

        }
        catch(error){
            return res.render("index.ejs", {users: false, no_users: true});
        }
    }
    
})

app.get("/logout", async(req, res)=>{
    req.session.destroy();
  
    // const users = await db.query("SELECT * FROM Users");
    // return res.render("index.js", {users: users.rows});
    res.redirect("/");
})

app.get("/delete/:book_name/:user_id", async(req, res) =>{
    // const book_id = req.params.book_id;
    // await db.query("DELETE FROM books WHERE id = $1", [book_id]);
    // const user_id = await db.query("SELECT user_id FROM books WHERE id = $1", [book_id]);
    // res.redirect(`/collection/${user_id}`);
    const book_name = req.params.book_name;
    const id = req.params.user_id;
    try {
        // Delete the book with the given id
        
        await db.query("DELETE FROM books WHERE user_id = $1 AND book_name = $2", [id, book_name]);
        // Fetch the user_id from the deleted book (assuming you have the user_id in your book's table)
        // const result = await db.query("SELECT user_id FROM books WHERE book_name = $1", [id]);
        // if (result.rows.length === 0) {
        //     return res.status(404).send('Book not found');
        // }

        // const user_id = result.rows[0].user_id;

        // Redirect to the user's collection
        // return res.redirect(`/collection/${id}`);
        const books = await db.query("SELECT * FROM Users JOIN books ON Users.id = user_id WHERE user_id = $1", [id]);
        return res.render("Book_collection.ejs", {
            book_details: books.rows,
            name: req.session.user.username,
            isAuthenticated: req.session.user? true:false
        });
    } catch (error) {
        console.error("Error deleting book or fetching user:", error);
        return res.status(500).send("Internal Server Error");
    }
})


app.listen(port, ()=>{
    console.log(`The app is listening at port ${port}`);
})
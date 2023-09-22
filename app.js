require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const { default: mongoose } = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { assert } = require('console');

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({extended: true}));
app.use(session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Specify the directory where you want to store the images
    cb(null, './public/uploads/');
  },
  filename: function (req, file, cb) {
    // Generate a unique filename for the uploaded file
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

const transporter = nodemailer.createTransport({
  service: process.env.SERVICE,
  auth: {
    user: process.env.USER,
    pass: process.env.PASS // Use the app password instead of your regular password
  },
  secure: false
});

async function sendOrderConfirmationEmail(customerEmail, emailText, emailSubject) {
  const mailOptions = {
    from: process.env.MYMAIL,
    to: customerEmail,
    subject: emailSubject,
    text: emailText
  };

  await transporter.sendMail(mailOptions, function(error, info) {
    if (error) {
      console.error(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });
}
  

main().catch(err => console.log(err));

async function main(){
  mongoose.connect('mongodb://127.0.0.1:27017/moviesDB', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('MongoDB connected successfully');
})
.catch((err) => {
  console.error('MongoDB connection error:', err);
});

  const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    username: String,
    phone: Number,
    password: String,
    type: Number,
    cart: [{type: String}],
    resetPasswordToken: String,
    resetPasswordExpires: Number,
    verificationToken: String,
    verified: Boolean
  });

  const movieSchema = new mongoose.Schema({
    name: String,
    startdate: Number,
    enddate: Number,
    languages: [{type: String}],
    price: Number,
    genre: String,
    duration: String,
    is2D: Boolean,
    is3d: Boolean,
    ticketsold: Number,
    starttime: String,
    image: String,
    video: String
  });

  const ticketSchema = new mongoose.Schema({
    userid: String,
    movieid: String,
    timing: String,
    screen: String,
    language: String,
    date: Number,
    people: Number,
    price: Number,
    bought: Boolean
  });

  userSchema.plugin(passportLocalMongoose);

  const User = mongoose.model('User', userSchema);
  const Movie = mongoose.model('Movie', movieSchema);
  const Ticket = mongoose.model('Ticket', ticketSchema);

  passport.use(User.createStrategy());

  passport.serializeUser(User.serializeUser());
  passport.deserializeUser(User.deserializeUser());

  app.get('/', async function(req, res){
    const movies = await Movie.find();
    res.render('index', {auth: req.isAuthenticated(), movies: movies});
  });

  app.get('/signup', function (req, res) {
    res.render('signup', { message: "" });
  });

  app.get('/login', function (req, res) {
    res.render('login', { message: "" });
  });
  
  app.get('/loginFail', function (req, res) {
    req.logout(function (err) {
        if (err) {
            console.log(err);
        }
    });
    res.render('login', { message: "Username and password does not match!" });
  });
  
  app.get('/logout', function (req, res) {
    req.logout(function (err) {
        if (err) {
            console.log(err);
        }
    });
    res.redirect('/');
  });
  
  app.get('/verify/:token', async function (req, res) {
    const token = req.params.token;
    const email = req.query.email;
    const user = await User.findOne({ email: email });
    const truth = user.verificationToken === token;
    if (!user) {
        res.send('<h1>Invalid User!</h1>');
    } else if (truth) {
        await User.updateOne({ email: email }, { verificationtToken: '0', verified: true });
        const customerEmail = email;
        const emailText = `Your email has been verified!\n\nWith regards,\nMovie Mania team`;
        const emailSubject = `Email Verified`;
        sendOrderConfirmationEmail(customerEmail, emailText, emailSubject);
        res.render('emailVerified');
    } else {
        res.send('<h1>Invalid Token!</h1>');
    }
  });
  
  app.get('/resendEmailVerify/:email', async function (req, res) {
    const verificationtToken = crypto.randomBytes(32).toString('hex');
    const email = req.params.email;
    await User.updateOne({ email: email }, { verificationtToken: verificationtToken });
    const verificationLink = `${req.protocol}://${req.headers.host}/verify/${verificationtToken}?email=${email}`;
    const customerEmail = email;
    const emailSubject = `Resent Verification Mail`;
    const emailText = `Dear ${req.body.name},\nPlease follow the link to verify your email: ${verificationLink}\n\nWith regards,\nMovie Mania team`;
    sendOrderConfirmationEmail(customerEmail, emailText, emailSubject);
    res.render('verificationMailSent');
  });
  
  app.get('/forgotpassword', function (req, res) {
    res.render('forgotpassword', { message: ""});
  });
  
  app.get('/resetpassword', async function (req, res) {
    const token = req.query.token;
    if (token) {
      const email = req.query.email;
      const user = await User.findOne({username: email});
      if (!user) {
        res.render('forgotpassword', { message: 'Invalid Token!'});
      }
      else if (Number(user.resetPasswordExpires) < Date.now()) {
        res.render('forgotpassword', { message: 'Token has expired'});
      } else {
        res.render('resetpassword', { email: user.email, token: token, message: ""});
      }
    } else {
        res.redirect("/login")
    }
  });
  
  app.get('/emailverified', function(req, res){
    res.render('emailverified');
  });

  app.get('/update', async function(req, res){
    if(req.isAuthenticated()){
      res.render('update', {user: req.user, message: ""});
    }else{
      res.redirect('/login');
    }
  });

  app.get('/movies', async function(req, res){
      const movies = await Movie.find();
      let movieids = "";
      for(let i=0; i<movies.length; i++){
        movieids = movieids + movies[i]._id + ' ';
      }
      res.render('movies', {auth: req.isAuthenticated(), movies: movies, genre: "", movieids: movieids});
  });

  app.get('/movies/:genre', async function(req, res){
      const movies = await Movie.find({genre: req.params.genre});
      let movieids = "";
      for(let i=0; i<movies.length; i++){
        movieids = movieids + movies[i]._id + ' ';
      }
      res.render('movies', {auth: req.isAuthenticated(), movies: movies, genre: req.params.genre, movieids: movieids});
  });

  app.get('/movie/:id', async function(req, res){
    const movie = await Movie.findOne({_id: req.params.id});
    console.log(movie);
    res.render('movie', {auth: req.isAuthenticated(), movie: movie});
  });

  app.get('/profile', async function(req, res){
    if(req.isAuthenticated()){
      const tickets = await Ticket.find({userid: req.user._id, bought: true});
      const movies = [];
      for(let i=0; i<tickets.length; i++){
        const movie = await Movie.findOne({_id: tickets[i].movieid});
        movies.push(movie);
      }
      res.render('profile', {tickets: tickets, user: req.user, movies: movies});
    }else{
      res.redirect('/login');
    }
  });

  app.get('/ticket/:ticketid', async function(req, res){
    if(req.isAuthenticated()){
      const ticket = await Ticket.findOne({_id: req.params.ticketid});
      const movie = await Movie.findOne({_id: ticket.movieid});
      res.render('ticket', {user: req.user, ticket: ticket, movie: movie});
    }else{
      res.redirect('/login');
    }
  });

  app.get('/deleteticket/:ticketid', async function(req, res){
    if(req.isAuthenticated()){
      await Ticket.deleteOne({_id: req.params.ticketid, bought: false});
      res.redirect('/cart');
    }else{
      res.redirect('/login');
    }
  });

  app.get('/cart', async function(req, res){
    if(req.isAuthenticated()){
      const tickets = await Ticket.find({userid: req.user._id, bought: false});
      const movies = [];
      let totprice = 0;
      for(let i=0; i<tickets.length; i++){
        const movie = await Movie.findOne({_id: tickets[i].movieid});
        movies.push(movie);
        totprice+=Number(tickets[i].price)
      }
      res.render('cart', {tickets: tickets, user: req.user, movies: movies, totprice: totprice});
    }else{
      res.redirect('/login');
    }
  });

  app.get('/buy', async function(req, res){
    if(req.isAuthenticated()){
      await Ticket.updateMany({userid: req.user._id, bought: false}, {bought: true});
      res.redirect('/cart');
    }else{
      res.redirect('/login');
    }
  });

  app.get('/adminlogin', async function(req, res){
    res.render('adminlogin', {message: ""});
  });

  app.get('/admin', async function(req, res){
    if(req.isAuthenticated() && req.user.type===1){
      const users = await User.find();
      res.render('admin', {users: users});
    }else{
      res.redirect('/adminlogin');
    }
  });
  
  app.get('/adminloginFail', function (req, res) {
    req.logout(function (err) {
        if (err) {
            console.log(err);
        }
    });
    res.render('adminlogin', { message: "Username and password does not match!" });
  });

  app.get('/adminmovies', async function(req, res){
    if(req.isAuthenticated()){
      const movies = await Movie.find();
      res.render('adminmovies', {movies: movies});
    }else{
      res.redirect('/adminlogin');
    }
  });

  app.get('/admindeletemovie/:id', async function(req, res){
    if(req.isAuthenticated() && Number(req.user.type)===1){
      await Movie.deleteOne({_id: req.params.id});
      res.redirect('/adminmovies');
    }else{
      res.redirect('/adminlogin');
    }
  });

  app.get('/admineditmovie/:id', async function(req, res){
    if(req.isAuthenticated() && Number(req.user.type)===1){
      const movie = await Movie.findOne({_id: req.params.id});
      res.render('admineditmovie', {movie: movie});
    }
  });

  app.get('/addmovie', async function(req, res){
    if(req.isAuthenticated() && Number(req.user.type)===1){
      res.render('adminaddmovie');
    }
  });

  app.get('/adminlogout', async function(req, res){
    req.logout(function (err) {
        if (err) {
            console.log(err);
        }
    });
    res.render('adminlogin', {message: ""});
  });



































  app.post('/signup', async function(req, res){
    const verificationToken = crypto.randomBytes(32).toString('hex');
    User.register({name: req.body.name, email:req.body.username, username: req.body.username, phone: req.body.phone, ticketIds: [], type: 0, resetPasswordToken: "", resetPasswordExpires: 0, verificationToken: verificationToken, verified: true}, req.body.password, async function(err, user){
      if(err){
        console.log(err);
          res.render('signup', {message: "Email already exists!"});
      }else{
        const verificationLink = `${req.protocol}://${req.headers.host}/verify/${verificationToken}?email=${req.body.username}`;
        const customerEmail = req.body.username;
        const emailSubject = `User Registered`;
        const emailText = `Dear ${req.body.name},\nYou have successfully registered on Movie Mania.\nPlease follow the link to verify your email: ${verificationLink}\n\nWith regards,\nMovie Mania team`;
        sendOrderConfirmationEmail(customerEmail, emailText, emailSubject);
        res.render('login', {message: "Sign up successful!/nVerification mail sent!"});
      }
    });
  });
  
  app.post('/login', async function(req, res){
    const temp = await User.findOne({username: req.body.username});
    const user = new User({
      username: req.body.username,
      password: req.body.password
    });
    if(temp){
      if(temp.verified){
        req.login(user, function(err){
          if(err){
            console.log(err);
          }else{
            passport.authenticate('local', {failureRedirect: '/loginFail'})(req, res, function(){
              res.redirect('/');
            });
          }
        });
      }else{
        res.render('emailunverified', {email: req.body.username});
      }
    }else{
      res.redirect('/loginFail');
    }
  });

  app.post('/update', async function(req,res){
    await User.updateOne({email: req.user.email}, {name: req.body.name, phone: Number(req.body.phone)});
    const customerEmail = req.user.email;
    const emailSubject = `Account Details Updated`;
    const emailText = `Dear ${req.user.name}\nYour account details have been updated.\nIf not done by you, please contact with our customer support.\n\nWith regards,\nMovie Mania team`;
    sendOrderConfirmationEmail(customerEmail, emailText, emailSubject);
    res.redirect('/');
  });

  app.post('/forgotpassword', async function(req, res){
    const email = req.body.email;
    const user = await User.findOne({email: email});
    if (!user) {
      res.render('forgotPassword', {message: 'User not found!'});
    }
    const token = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();
    const customerEmail = email;
    const emailSubject = `Reset password`;
    const resetUrl = `${req.protocol}://${req.headers.host}/resetpassword?token=${token}&email=${user.email}`;
    const emailText = `Please click the link to reset the password:\n${resetUrl}`;
    sendOrderConfirmationEmail(customerEmail, emailText, emailSubject);
    res.render('forgotpassword', {message: 'Email sent with instructions!'});
  });
  
  app.post('/resetpassword', async (req, res) => {
    const email = req.body.email;
    const password = req.body.password;
    const user = await User.findOne({email: email});
    if (!user) {
      return res.status(400).json({ message: 'Invalid token' });
    }
    if (user.resetPasswordExpires < Date.now()) {
      return res.status(400).json({ message: 'Token has expired' });
    }
    await user.setPassword(password);
    user.resetPasswordToken = 1;
    user.resetPasswordExpires = '1';
    await user.save();
    const customerEmail = email;
    const emailSubject = `Reset password`;
    const emailText = `Your password has been reset.\nIf not done by you, contact our support as soon as possible.\n\nWith regards,\nMovie Mania team`;
    sendOrderConfirmationEmail(customerEmail, emailText, emailSubject);
    res.render('login', {message: 'Password reset successful!'});
  });

  app.post('/addtocart/:id', async function(req, res){
    if(req.isAuthenticated()){
      const movie = await Movie.findOne({_id: req.params.id});
      const totalp = Number(movie.price)*Number(req.body.number);
      const ticket = new Ticket({
        userid: req.user._id,
        movieid: req.params.id,
        timing: movie.starttime,
        screen: req.body.screen,
        language: req.body.language,
        date: new Date(req.body.date).getTime(),
        people: Number(req.body.number),
        price: Number(req.body.number)*Number(movie.price),
        bought: false
      });
      await ticket.save();
      const user = req.user;
      user.cart.push(ticket._id);
      res.redirect('/cart');
    }else{
      res.redirect('/login');
    }
  });

  app.post('/search', async function(req, res){
    const movies = await Movie.find();
    let movieids = "";
    for(let i=0; i<movies.length; i++){
      movieids = movieids + movies[i]._id + ' ';
    }
    const keywords = req.body.search.split(' ');
    // const extra = ['a', 'an', 'the', 'of', 'from'];
    const sortedmovies = [];
    const sortednumber = [];
    for(let i=0; i<movies.length; i++){
      const key2 = movies[i].name.split(' ');
      let ctr=0;
      for(let j=0; j<keywords.length; j++){
        const result = key2.findIndex(item => keywords[j].toUpperCase() === item.toUpperCase());
        if(result!=-1){
          ctr++;
        }
      }
      if(ctr>0){
        sortedmovies.push(movies[i]);
        sortednumber.push(ctr);
      }
    }
    for(let i=sortednumber.length-1; i>=0; i--){
      for(let j=0; j<i; j++){
        if(sortednumber[j]<sortednumber[j+1]){
          let temp = sortednumber[j];
          let temp2 = sortedmovies[j];
          sortednumber[j] = sortednumber[j+1];
          sortedmovies[j] = sortedmovies[j+1];
          sortednumber[j+1]=temp;
          sortedmovies[j+1]=temp2;
        }
      }
    }
    res.render('movies', {auth: req.isAuthenticated(), movies: sortedmovies, genre: `Searching for '${req.body.search}'`, movieids: movieids});
  });

  app.post('/filter', async function(req, res){
    const movieids = req.body.movieids.trim().split(' ');
    const lang = req.body.language;
    const genre = req.body.genre;
    const price = Number(req.body.price);
    let movies = [];
    for(let i=0; i<movieids.length; i++){
      const movie = await Movie.findOne({_id: movieids[i]});
      movies.push(movie);
    }
    if(lang!='all'){
      movies = movies.filter((temp)=> temp.languages.includes(lang));
    }
    if(genre!='all'){
      movies = movies.filter((temp)=> temp.genre === genre);
    }
    if(price <10000){
      movies = movies.filter((temp)=> Number(temp.price)<= price);
    }
    let movieids2 = "";
    for(let i=0; i<movies.length; i++){
      movieids2 = movieids2 + movies[i]._id + ' ';
    }
    res.render('movies', {auth: req.isAuthenticated(), genre: "", movies: movies, movieids: movieids2});
  });
  
  app.post('/adminlogin', async function(req, res){
    const temp = await User.findOne({username: req.body.username});
    const user = new User({
      username: req.body.username,
      password: req.body.password
    });
    if(temp){
      if(temp.verified && Number(temp.type)===1){
        req.login(user, function(err){
          if(err){
            console.log(err);
          }else{
            passport.authenticate('local', {failureRedirect: '/adminloginFail'})(req, res, function(){
              res.redirect('/admin');
            });
          }
        });
      }else{
        res.render('emailunverified', {email: req.body.username});
      }
    }else{
      res.redirect('/adminloginFail');
    }
  });

  app.post('/adminaddmovie', async function(req, res){
    const languages = [];
    if(req.body.English){
      languages.push('English');
    }
    if(req.body.Portugese){
      languages.push('Portugese');
    }
    let is3d = false;
    if(req.body.is3d){
      is3d=true;
    }
    const movie = new Movie({
      name: req.body.name,
      startdate: new Date(req.body.startdate).getTime(),
      enddate: new Date(req.body.enddate).getTime(),
      languages: languages,
      price: Number(req.body.price),
      genre: req.body.genre,
      duration: req.body.duration,
      is2D: true,
      is3d: is3d,
      ticketsold: 0,
      starttime: req.body.starttime,
      image: req.body.image,
      video: req.body.video
    });
    await movie.save();
    res.redirect('/adminmovies');
  });

  app.post('/admineditmovie/:id', async function(req, res){
    const languages = [];
    if(req.body.English){
      languages.push('English');
    }
    if(req.body.Portugese){
      languages.push('Portugese');
    }
    let is3d = false;
    if(req.body.is3d){
      is3d=true;
    }
    await Movie.updateOne({_id: req.params.id}, {
      name: req.body.name,
      startdate: new Date(req.body.startdate).getTime(),
      enddate: new Date(req.body.enddate).getTime(),
      languages: languages,
      price: Number(req.body.price),
      genre: req.body.genre,
      duration: req.body.duration,
      is2D: true,
      is3d: is3d,
      ticketsold: 0,
      starttime: req.body.starttime,
      image: req.body.image,
      video: req.body.video
    });
    res.redirect('/adminmovies');
  });
}

app.listen(3000, function(req, res){
    console.log('Server tunning on port = 3000');
});

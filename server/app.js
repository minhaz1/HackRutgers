var express = require('express')
, passport = require('passport')
, LocalStrategy = require('passport-local').Strategy
, mongodb = require('mongodb')
, mongoose = require('mongoose')
, scrypt = require('scrypt');

mongoose.connect('localhost', 'test');
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function callback() {
  console.log('Connected to DB');
});

// User Schema
var userSchema = mongoose.Schema({
  firstname: {type: String, required: true},
  lastname: {type: String, required: true},
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true},
  confirmed: { type: Boolean, default: false},
  accessToken: { type: String } // Used for Remember Me
});

    var sendgrid  = require('sendgrid')('minhaz3', 'hackrutgers');


// Scrypt middleware
userSchema.pre('save', function(next) {
	var user = this;

	if(!user.isModified('password')) return next();

  scrypt.passwordHash(user.password, 0.5, function(err, hash) {
    if(err) return next(err);
    user.password = hash;
    next();
  });
});

// Password verification
userSchema.methods.comparePassword = function(candidatePassword, cb) {
	scrypt.verifyHash(this.password, candidatePassword, function(err, isMatch) {
		if(err) return cb(err);
		cb(null, isMatch);
	});
};

// Remember Me implementation helper method
userSchema.methods.generateRandomToken = function () {
  var user = this,
  chars = "_!abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
  token = new Date().getTime() + '_';
  for ( var x = 0; x < 16; x++ ) {
    var i = Math.floor( Math.random() * 62 );
    token += chars.charAt( i );
  }
  return token;
};

// Seed a user
var User = mongoose.model('User', userSchema);

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.
//
//   Both serializer and deserializer edited for Remember Me functionality
passport.serializeUser(function(user, done) {
  var createAccessToken = function () {
    var token = user.generateRandomToken();
    User.findOne( { accessToken: token }, function (err, existingUser) {
      if (err) { return done( err ); }
      if (existingUser) {
        createAccessToken(); // Run the function again - the token has to be unique!
      } else {
        user.set('accessToken', token);
        user.save( function (err) {
          if (err) return done(err);
          return done(null, user.get('accessToken'));
        })
      }
    });
  };

  if ( user._id ) {
    createAccessToken();
  }
});

passport.deserializeUser(function(token, done) {
  User.findOne( {accessToken: token } , function (err, user) {
    done(err, user);
  });
});


// Use the LocalStrategy within Passport.
//   Strategies in passport require a `verify` function, which accept
//   credentials (in this case, a username and password), and invoke a callback
//   with a user object.  In the real world, this would query a database;
//   however, in this example we are using a baked-in set of users.
passport.use(new LocalStrategy(function(username, password, done) {
  User.findOne({ username: username }, function(err, user) {
    if (err) { return done(err); }
    if (!user) { return done(null, false, { message: 'Unknown user ' + username }); }
    user.comparePassword(password, function(err, isMatch) {
      if (err) return done(err);
      if(isMatch) {
        return done(null, user);
      } else {
        return done(null, false, { message: 'Invalid password' });
      }
    });
  });
}));


var app = express();

// configure Express
app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.engine('ejs', require('ejs-locals'));
  app.use(express.logger());
  app.use(express.cookieParser());
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.session({ secret: 'keyboard cat' })); // CHANGE THIS SECRET!
  // Remember Me middleware
  app.use( function (req, res, next) {
    if ( req.method == 'POST' && req.url == '/login' ) {
      if ( req.body.rememberme ) {
        req.session.cookie.maxAge = 2592000000; // 30*24*60*60*1000 Rememeber 'me' for 30 days
      } else {
        req.session.cookie.expires = false;
      }
    }
    next();
  });
  // Initialize Passport!  Also use passport.session() middleware, to support
  // persistent login sessions (recommended).
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(app.router);
  app.use(express.static(__dirname + '/../../public'));
});


app.get('/', function(req, res){
  res.render('index', { user: req.user });
});

app.get('/account', ensureAuthenticated, function(req, res){
  res.render('account', { user: req.user });
});

app.get('/login', function(req, res){
  res.render('login', { user: req.user, message: req.session.messages });
});

app.get('/register', function(req, res){
  res.render('register', { user: req.user, message: req.session.messages });
});

app.get('/dashboard', function(req, res){
  res.render('dashboard', { user: req.user, message: req.session.messages });
});


app.get('/test', function(req, res){
  var email = req.param('email');
  var confirmed = req.param('confirmed');
  var user = User.find({'email': email});

  if(user){
    user.update({'confirmed': true});

    sendgrid.send({
      to:       email,
      from:     'windows@sucks.com',
      subject:  'Thank you for confirming!',
      text:     'Hello ' + user.firstname + ' thank you for confirming your email, ' + email
    }, function(err, json) {
      if (err) { return console.error(err); }
      console.log(json);
    });

    return res.redirect('/');

  }




  console.log(req.body);
});

// POST /login
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
//
//   curl -v -d "username=bob&password=secret" http://127.0.0.1:3000/login
//   
/***** This version has a problem with flash messages
app.post('/login', 
  passport.authenticate('local', { failureRedirect: '/login', failureFlash: true }),
  function(req, res) {
    res.redirect('/');
  });
*/

// POST /login
//   This is an alternative implementation that uses a custom callback to
//   acheive the same functionality.
var usr = new User({firstname: 'gaurang', lastname: 'bhatt', username: 'gaurang', email: 'gb4@umbc.edu', password: 'yesha' });


app.post('/login', function(req, res, next) {
  passport.authenticate('local', function(err, user, info) {
    if (err) { return next(err) }
      if (!user) {
        console.log("user: " + req.param('username'));
        req.session.messages =  [info.message];
        return res.redirect('/')
      }
      req.logIn(user, function(err) {
        if (err) { return next(err); }
        return res.redirect('/dashboard');
      });
    })(req, res, next);
  });

app.post('/register', function(req, res, next) {
  var fname = req.param('firstname');
  //var hash = scrypt.passwordHashSync(fname, 0.1);
  var lname = req.param('lastname');
  var email = req.param('email');
  var userName = req.param('username');
  var userPass = req.param('password');
  var secPass = req.param('secondPassword');
  var canAdd = true;

  if(email.indexOf(".edu") < 3) {
    console.log(email);
    canAdd = false;
    req.session.messages = "Invalid e-mail address. Requires a .edu account.";
  }
  else if(userPass == ""){
    canAdd = false;
    req.session.messages = "No password entered";
  } else if(userPass != secPass){
    canAdd = false;
    req.session.messages = "Passwords do not match.";
  }

  if(canAdd) {
    var user = new User({firstname: fname, lastname: lname, username: userName, email: email, password: userPass });
    user.save(function(err) {
      if(err) {
        console.log(err);
      } else {
        console.log('user: ' + user.username + " saved.");
      }
    });

    sendgrid.send({
      to:       email,
      from:     'windows@sucks.com',
      subject:  'Good job on registering!',
      text:     'Hello ' + fname + ',\nhttp://3fbbaf1f.ngrok.com/test?email=' + email
    }, function(err, json) {
      if (err) { return console.error(err); }
      console.log(json);
    });


    req.logIn(user, function(err) {
      if (err) { return next(err); }
      req.session.message = "";
      return res.redirect('/dashboard');
    });
  } else {
    return res.redirect('/register')
  }
});

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

app.listen(3002, function() {
  console.log('Express server listening on port 3002');
});


// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login')
}

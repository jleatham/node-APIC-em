/**
initial APIC-EM project by Josh Leatham
v0.5

From the hackathon starter project the following modules have been added:
  request - to make API calls asynchronosly with APIC-EM
  EventEmitter - so that the resulting JSON from API calls can be stored in a
        variable when completed...as opposed to just console.log'd
  http and socket.io - socket is used to send API requests from the browser,
        to the server (for the server to communnicate with APIC-EM), and send
        the response back to the browser to dynamically place on website.  http
        is used with socket.io , i just placed the code recommended on the
        hackathon started github page regarding socket.io


Other changes to the hackathon starter project:
  I added the test page where I am doing all the API related calls.
  I added a route for it on app.js, a controller for it in test.js (unused so far)
    other than to point to the test.jade html template I created for it.
  Most of the dynamic content is actually loaded in the layout.jade file.  I don't
    think this is best practice but the jquery was messing up when the scripts were
    in multiple locations.
  app.js has a bunch of functions added.

**/





/**
 * Module dependencies.
 */



var express = require('express');
var compress = require('compression');
var session = require('express-session');
var bodyParser = require('body-parser');
var logger = require('morgan');
var errorHandler = require('errorhandler');
var lusca = require('lusca');
var dotenv = require('dotenv');
var MongoStore = require('connect-mongo/es5')(session);
var flash = require('express-flash');
var path = require('path');
var mongoose = require('mongoose');
var passport = require('passport');
var expressValidator = require('express-validator');
var sass = require('node-sass-middleware');
var multer = require('multer');
var upload = multer({ dest: path.join(__dirname, 'uploads') });
var request = require('request');
var EventEmitter = require("events").EventEmitter;
/**
 * Load environment variables from .env file, where API keys and passwords are configured.
 *
 * Default path: .env (You can remove the path argument entirely, after renaming `.env.example` to `.env`)
 */
dotenv.load({ path: '.env.example' });

/**
 * Controllers (route handlers).
 */
var homeController = require('./controllers/home');
var userController = require('./controllers/user');
var apiController = require('./controllers/api');
var contactController = require('./controllers/contact');
var apicController = require('./controllers/apic');


/**
 * API keys and Passport configuration.
 */
var passportConfig = require('./config/passport');

/**
 * Create Express server.
 */
var app = express();

//***********************APIC stuff********************************//
//I added the below two lines for socket.io based on github recommendations
//also changed the app.listen statement
var server = require('http').Server(app);
var io = require('socket.io')(server);
//***********************end********************************//


/**
 * Connect to MongoDB.
 */
mongoose.connect(process.env.MONGODB || process.env.MONGOLAB_URI);
mongoose.connection.on('error', function() {
  console.log('MongoDB Connection Error. Please make sure that MongoDB is running.');
  process.exit(1);
});

/**
 * Express configuration.
 */
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(compress());
app.use(sass({
  src: path.join(__dirname, 'public'),
  dest: path.join(__dirname, 'public'),
  sourceMap: true
}));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(expressValidator());
app.use(session({
  resave: true,
  saveUninitialized: true,
  secret: process.env.SESSION_SECRET,
  store: new MongoStore({
    url: process.env.MONGODB || process.env.MONGOLAB_URI,
    autoReconnect: true
  })
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.use(function(req, res, next) {
  if (req.path === '/api/upload') {
    next();
  } else {
    lusca.csrf()(req, res, next);
  }
});
app.use(lusca.xframe('SAMEORIGIN'));
app.use(lusca.xssProtection(true));
app.use(function(req, res, next) {
  res.locals.user = req.user;
  next();
});
app.use(function(req, res, next) {
  // After successful login, redirect back to /api, /contact or /
  if (/(api)|(contact)|(^\/$)/i.test(req.path)) {
    req.session.returnTo = req.path;
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 31557600000 }));

/**
 * Primary app routes.
 */
app.get('/', homeController.index);
app.get('/login', userController.getLogin);
app.post('/login', userController.postLogin);
app.get('/logout', userController.logout);
app.get('/forgot', userController.getForgot);
app.post('/forgot', userController.postForgot);
app.get('/reset/:token', userController.getReset);
app.post('/reset/:token', userController.postReset);
app.get('/signup', userController.getSignup);
app.post('/signup', userController.postSignup);
app.get('/contact', contactController.getContact);
app.post('/contact', contactController.postContact);
app.get('/account', passportConfig.isAuthenticated, userController.getAccount);
app.post('/account/profile', passportConfig.isAuthenticated, userController.postUpdateProfile);
app.post('/account/password', passportConfig.isAuthenticated, userController.postUpdatePassword);
app.post('/account/delete', passportConfig.isAuthenticated, userController.postDeleteAccount);
app.get('/account/unlink/:provider', passportConfig.isAuthenticated, userController.getOauthUnlink);


//***********************APIC stuff********************************//

app.get('/apic', apicController.apic);  //on browser url at localhost:3000/apic - use apic.js controller
app.locals.apic = require('./apic.json'); //for testing purposed with a static JSON, not used
var e_ticket = new EventEmitter();  //used to put auth ticket data into variable , upon async completion
var e_devices = new EventEmitter(); //used to put device-network data into variable , upon async completion
var apicem_ip = "sandboxapic.cisco.com:9443"; //static apic URL, to be changed to dynamic IP later
var api_ticket_url = 'https://'+apicem_ip+'/api/v1/ticket';
var api_device_url = 'https://'+apicem_ip+'/api/v1/network-device';
app.locals.serviceTicket = '';  //global nodejs variable for auth ticket
app.locals.device_info = '';    //global nodejs variable for anetwork device JSON


//eventEmitter data for auth ticket that is finalized when asyncronous API calls are completed
e_ticket.on('update', function () {
    //console.log(body1.info.response.serviceTicket); // HOORAY! THIS WORKS!
    serviceTicket = e_ticket.info.response.serviceTicket;
    console.log("Service Ticket: ");
    console.log(serviceTicket);
});

//eventEmitter data for network device that is finalized when asyncronous API calls are completed
e_devices.on('update', function () {
    //console.log(body1.info.response.serviceTicket); // HOORAY! THIS WORKS!
    device_info = e_devices.info;
    console.log(device_info);
});

//async function to get auth ticket - this is currently ran upon startup, but should be
//changedto a dynamic call from browser along with APIC URL
//The most importing part of this is the request(option,callback) function, which is
//the async call to the APIC controller.
//api_url is self explanatory
//m = 'GET' or 'POST'
//output is the emitter variable that you want passsed out of the request function and
//into the emitter function, which stores it globally...not sure if there is an wasier
//way to do this .  I've seen else where that the request callback has a .on completed
//funciton, but I could not get it to work
var postTicket = function(api_url,m,output){
  //console.log("In getJSON");
  var options = {
    url: api_url,
    method: m,
    headers: {
      'Content-type': 'application/json'
    },
    body: '{ "username": "admin", "password": "C!sc0123"}'
  };
  //request.post(options, callback);
  request.post(options, function(error, response, body){
    if (!error && response.statusCode == 200) {
      output.info = (JSON.parse(body));
      output.emit('update');
      //console.log("inside success");
    }
    else {
      console.log("inside callback error");
      //console.log(error);
      //console.log(response);
      //console.log(body);
      //console.log(JSON.parse(body));

    }
  });

}
//see postTicket function comments as this does the samething.
var getJSON = function(api_url,m,output){
  //console.log("In getJSON");
  var options = {
    url: api_url,
    method: m,
    headers: {
      "X-Auth-Token": serviceTicket
    }
  };
  request.get(options, function(error, response, body){
    if (!error && response.statusCode == 200) {
      output.info = (JSON.parse(body));
      output.emit('update');
      console.log("inside success");
    }
    else {
      console.log("inside callback error");
      //console.log(error);
      //console.log(response);
      //console.log(body);
      //console.log(JSON.parse(body));

    }
  });

}



app.post('/apic', function(req, res) { //this is called whenever you send a form POST from browser
  console.log(req.body);               //in apic page.  I depricated this method because socket.io
  res.send(200);                       //is much much better
  //getJSON(api_device_url,"GET",e_devices);
});

//this is ran on startup, but should eventually be moved to a socket.io call from browser
postTicket(api_ticket_url,"POST",e_ticket);

//*******************************end APIC code*****************************************//

/**
 * API examples routes.
 */
app.get('/api', apiController.getApi);
app.get('/api/lastfm', apiController.getLastfm);
app.get('/api/nyt', apiController.getNewYorkTimes);
app.get('/api/aviary', apiController.getAviary);
app.get('/api/steam', passportConfig.isAuthenticated, passportConfig.isAuthorized, apiController.getSteam);
app.get('/api/stripe', apiController.getStripe);
app.post('/api/stripe', apiController.postStripe);
app.get('/api/scraping', apiController.getScraping);
app.get('/api/twilio', apiController.getTwilio);
app.post('/api/twilio', apiController.postTwilio);
app.get('/api/clockwork', apiController.getClockwork);
app.post('/api/clockwork', apiController.postClockwork);
app.get('/api/foursquare', passportConfig.isAuthenticated, passportConfig.isAuthorized, apiController.getFoursquare);
app.get('/api/tumblr', passportConfig.isAuthenticated, passportConfig.isAuthorized, apiController.getTumblr);
app.get('/api/facebook', passportConfig.isAuthenticated, passportConfig.isAuthorized, apiController.getFacebook);
app.get('/api/github', passportConfig.isAuthenticated, passportConfig.isAuthorized, apiController.getGithub);
app.get('/api/twitter', passportConfig.isAuthenticated, passportConfig.isAuthorized, apiController.getTwitter);
app.post('/api/twitter', passportConfig.isAuthenticated, passportConfig.isAuthorized, apiController.postTwitter);
app.get('/api/venmo', passportConfig.isAuthenticated, passportConfig.isAuthorized, apiController.getVenmo);
app.post('/api/venmo', passportConfig.isAuthenticated, passportConfig.isAuthorized, apiController.postVenmo);
app.get('/api/linkedin', passportConfig.isAuthenticated, passportConfig.isAuthorized, apiController.getLinkedin);
app.get('/api/instagram', passportConfig.isAuthenticated, passportConfig.isAuthorized, apiController.getInstagram);
app.get('/api/yahoo', apiController.getYahoo);
app.get('/api/paypal', apiController.getPayPal);
app.get('/api/paypal/success', apiController.getPayPalSuccess);
app.get('/api/paypal/cancel', apiController.getPayPalCancel);
app.get('/api/lob', apiController.getLob);
app.get('/api/bitgo', apiController.getBitGo);
app.post('/api/bitgo', apiController.postBitGo);
app.get('/api/upload', apiController.getFileUpload);
app.post('/api/upload', upload.single('myFile'), apiController.postFileUpload);
app.get('/api/pinterest', passportConfig.isAuthenticated, passportConfig.isAuthorized, apiController.getPinterest);
app.post('/api/pinterest', passportConfig.isAuthenticated, passportConfig.isAuthorized, apiController.postPinterest);

/**
 * OAuth authentication routes. (Sign in)
 */
app.get('/auth/instagram', passport.authenticate('instagram'));
app.get('/auth/instagram/callback', passport.authenticate('instagram', { failureRedirect: '/login' }), function(req, res) {
  res.redirect(req.session.returnTo || '/');
});
app.get('/auth/facebook', passport.authenticate('facebook', { scope: ['email', 'user_location'] }));
app.get('/auth/facebook/callback', passport.authenticate('facebook', { failureRedirect: '/login' }), function(req, res) {
  res.redirect(req.session.returnTo || '/');
});
app.get('/auth/github', passport.authenticate('github'));
app.get('/auth/github/callback', passport.authenticate('github', { failureRedirect: '/login' }), function(req, res) {
  res.redirect(req.session.returnTo || '/');
});
app.get('/auth/google', passport.authenticate('google', { scope: 'profile email' }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), function(req, res) {
  res.redirect(req.session.returnTo || '/');
});
app.get('/auth/twitter', passport.authenticate('twitter'));
app.get('/auth/twitter/callback', passport.authenticate('twitter', { failureRedirect: '/login' }), function(req, res) {
  res.redirect(req.session.returnTo || '/');
});
app.get('/auth/linkedin', passport.authenticate('linkedin', { state: 'SOME STATE' }));
app.get('/auth/linkedin/callback', passport.authenticate('linkedin', { failureRedirect: '/login' }), function(req, res) {
  res.redirect(req.session.returnTo || '/');
});

/**
 * OAuth authorization routes. (API examples)
 */
app.get('/auth/foursquare', passport.authorize('foursquare'));
app.get('/auth/foursquare/callback', passport.authorize('foursquare', { failureRedirect: '/api' }), function(req, res) {
  res.redirect('/api/foursquare');
});
app.get('/auth/tumblr', passport.authorize('tumblr'));
app.get('/auth/tumblr/callback', passport.authorize('tumblr', { failureRedirect: '/api' }), function(req, res) {
  res.redirect('/api/tumblr');
});
app.get('/auth/venmo', passport.authorize('venmo', { scope: 'make_payments access_profile access_balance access_email access_phone' }));
app.get('/auth/venmo/callback', passport.authorize('venmo', { failureRedirect: '/api' }), function(req, res) {
  res.redirect('/api/venmo');
});
app.get('/auth/steam', passport.authorize('openid', { state: 'SOME STATE' }));
app.get('/auth/steam/callback', passport.authorize('openid', { failureRedirect: '/login' }), function(req, res) {
  res.redirect(req.session.returnTo || '/');
});
app.get('/auth/pinterest', passport.authorize('pinterest', { scope: 'read_public write_public' }));
app.get('/auth/pinterest/callback', passport.authorize('pinterest', { failureRedirect: '/login' }), function(req, res) {
  res.redirect('/api/pinterest');
});

/**
 * Error Handler.
 */
app.use(errorHandler());

/**
 * Start Express server.
 */
 //I changed this for socket.io based upon the github details...used to be app.listen
server.listen(app.get('port'), function() {
  console.log('Express server listening on port %d in %s mode', app.get('port'), app.get('env'));
});




module.exports = app;


//Socket.io code - APIC calls made here
//basically, on either side, browser or server, you can do:
//socket.emit - which will send to the corresponding
//socket.on - which accepts the emit and does something.
io.on('connection', function(socket) {
  //temp example i tried that will post date data every X milliseconds
  socket.on('setInterval', function(data){
    var intMS = parseInt(data);
    if (typeof intMS == 'number' ){
      setInterval(function(){
            socket.emit('date', {'date': new Date()});
        }, intMS);
      console.log(intMS);
    }else{
      console.log("Not an Integer");
      console.log(data);
    }

  });


  //temp example that takes user input from field, and then sends it back
  socket.on('messages', function(data) {
       socket.emit('broad', data);
       socket.broadcast.emit('broad',data);
       console.log(data);
     });

    //if browser button is pressed, run getJSON function
    //can be modified with if statement to run different functions based upon
    //data passed.  not implemented yet.  Notice it also doesn't return any
    //meaningful data back... thats because the getJSON is async and the data won't
    //be ready in time... see apitest2
   socket.on('apitest', function(data) {
        if (data == 'go'){
          getJSON(api_device_url,"GET",e_devices);
          socket.emit('apireturn', 'Success');
          console.log(data);
        }

      });

      //this will take a browser click, and return the device info obtained from
      //the apitest socket.io call to getJSON.  This gives the API time to complete
      //in the background before the data is requested.  I am sure there is a better
      //way to do this... also, the funciton needs to be modified to work with any
      //data, not just the device_info data.
    socket.on('apitest2', function(data) {
         if (data == 'go' && typeof device_info !== 'undefined'){
           socket.emit('apireturn2', device_info );
           //console.log(data);
          }else{
            console.log('variable not defined');
         }

       });

  //This will just test that socketio is working on each page.
  socket.emit('greet', { hello: 'Hey there browser!' });
  socket.on('respond', function(data) {
    console.log(data);
  });
  socket.on('disconnect', function() {
    console.log('Socket disconnected');
  });
});

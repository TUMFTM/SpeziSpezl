//(function() {
    'use strict';
    var path = require('./config');
    var express = require('express');
    var path = require('path');
    var logger = require('morgan');
    var cookieParser = require('cookie-parser');
    var bodyParser = require('body-parser');
    var user_routes = require('./routes/api2');
    var routes = require('./routes/api');
    var session = require('express-session');
    var cors=require('cors');
    var app = express();
    let user_app = express();


// view engine setup

    app.options('*', cors());
    app.set('views', path.join(__dirname, 'views'));
    app.engine('html', require('ejs').renderFile);
    app.set('view engine', 'html');
    app.use(logger('dev'));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({
        extended: true
    }));
    app.use(cookieParser());
    app.use('/', routes);
    app.use(session({
        secret: 'logincookie',
        proxy: undefined,
        resave: false,
        saveUninitialized: true
    })); // session has to be handled when Authentication is setted up, 503530648 is used as a static id



    user_app.options('*', cors());
    user_app.set('views', path.join(__dirname, 'views'));
    user_app.engine('html', require('ejs').renderFile);
    user_app.set('view engine', 'html');
    user_app.use(logger('dev'));
    user_app.use(bodyParser.json());
    user_app.use(bodyParser.urlencoded({
        extended: true
    }));
    user_app.use(cookieParser());
    user_app.use('/', user_routes);
    user_app.use(session({
        secret: 'logincookie',
        proxy: undefined,
        resave: false,
        saveUninitialized: true
    })); // session has to be handled when Authentication is setted up, 503530648 is used as a static id

    app.set('port', 8080);
    var server = app.listen(app.get('port'), function() {
        console.log('Express server listening on port ' + server.address().port);
    });

    user_app.set('port', 8081);
    var user_server = user_app.listen(user_app.get('port'), function() {
        console.log('Express user_server listening on port ' + user_server.address().port);
    });

    module.exports = app, user_app;

//}());

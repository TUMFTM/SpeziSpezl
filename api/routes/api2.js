
const bcrypt = require('bcrypt');

(function () {

    var main_app = require('../app');
    var config = require('../config');

    const nodemailer = require("nodemailer");
    let transporter = nodemailer.createTransport(config.mail);

    // 'use strict';

    var express = require('express');
    var url = require("url");
    var app = express();
    var router = express.Router();
    const pg = require('pg');
    const http = require('https');
    var cors = require('cors');
    app.use(cors());
    cors({credentials: true, origin: true})


    var uid = require('rand-token').uid;

    var pool = new pg.Pool(config.pg_config);
    pool.on('error', function(err, client) {
        console.error('idle client error', err.mesae, err.stack);
    });


    router.use(function (req, res, next){
        res.header("Access-Control-Allow-Origin", "*");
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
        next();
    });

    // 192.168.101.71:8080/list_transactions?token=1
    router.post('/list_transactions', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.token){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                    var query_string =  "select t.id, t.source, t.slot, t.price, t.sender, t.fee ,(select display_name from spezispezl.products where name= t.product), t.time, t.balance_new, t.transaction_id, t.sender from spezispezl.transactions t, spezispezl.user u where u.user_id = (select user_id from spezispezl.token where token = $1) and t.user_id = u.user_id and t.committed order by t.time desc";
                    var query = {
                        name: "list_transcations",
                        text: query_string,
                        values: [req.body.token],}
                    client.query(query, function (err, result) {
                        done();
                        if (err) {
                            console.log(err);
                            return next(err);
                        } else {
                            if(result && result.rows.length > 0){
                                res.send(result.rows);
                            } else {
                                res.json({ state: "no transactions"});
                            }
                            
                        }
                    });
                }
            });
        } else {
            res.json({ state: "unauthorized"});
        }
    });

        // 192.168.101.71:8080/get_balance?token=1
    router.post('/get_balance', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.token){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                    var query_string =  "select u.balance, u.mail , u.balance_alert, u.user_level, u.is_filler from spezispezl.user u where u.user_id = (select user_id from spezispezl.token where token = $1)";
                    var query = {
                        name: "get_balance",
                        text: query_string,
                        values: [req.body.token],}
                    client.query(query, function (err, result) {
                        done();
                        if (err) {
                            return next(err);
                        } else {
                            if(result && result.rows.length > 0){
                                res.send(result.rows[0]);
                            } else {
                                res.json({ state: "error"});
                            }
                            
                        }
                    });
                }
            });
        } else {
            res.json({ state: "unauthorized"});
        }
    });

    // 192.168.101.71:8080/get_products
    router.get('/get_products', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(true){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {

                    var query_string =  "select name from spezispezl.products where visible = true;";
                    var query = {
                        name: "get_all_products",
                        text: query_string,
                        values: [],}
                    client.query(query, function (err, result) {
                        done();
                        if(result && result.rows.length > 0){
                            res.send(result.rows);
                        } else {
                            res.json({ state: "no products"});
                        }
                    });
                }
            });
        }
        else {
            res.json({ state: "unauthorized"});
        }
    });


    router.post('/get_all_products', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.token && req.body.device){
            console.log(req.body.token);
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                    var query_string =  "select * from spezispezl.get_price_from_token($1, $2) order by slot;";
                    var query = {
                        name: "get_products",
                        text: query_string,
                        values: [req.body.token, req.body.device],}
                    client.query(query, function (err, result) {
                        done();
                        if (err) {
                            return next(err);
                        } else {
                            res.send(result.rows);
                        }
                    });
                }
            });
        } else {
            res.json({ state: "unauthorized"});
        }
    });


    router.get('/get_devices', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(true){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {

                    var query_string =  "select distinct(device) as device, min(max_slots) as slots from spezispezl.config group by device;";
                    var query = {
                        name: "get_all_devices",
                        text: query_string,
                        values: [],}
                    client.query(query, function (err, result) {
                        done();
                        if(result.rows.length > 0){
                            res.send(result.rows);
                        } else {
                            res.json({ state: "no devices"});
                        }
                    });
                }
            });
        } else {
            res.json({ state: "unauthorized"});
        }
    });

    router.get('/wifibutton', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.query.id){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                    console.log(`Button ${req.query.id} pressed`);
                    var query_string =  "insert into spezispezl.sensors (sensor_id, value) values (8,$1)";
                    var query = {
                        name: "insert_wifibutton",
                        text: query_string,
                        values: [req.query.id],}
                    client.query(query, function (err, result) {
                        done();
                        res.json({ state: "insert_ok"});
                        
                    });
                }
            });
        }
    });

    
    router.post('/get_device_config', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.device){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {

                    var query_string =  "select c.slot, c.product, c.items, c.max_items, (select visible from spezispezl.products p where p.name = c.product), (select property from spezispezl.products p where p.name = c.product) from spezispezl.config c where c.device = $1 order by slot;";
                    var query = {
                        name: "get_device_config",
                        text: query_string,
                        values: [req.body.device],}
                    client.query(query, function (err, result) {
                        done();
                        if(result && result.rows.length > 0){
                            res.send(result.rows);
                        } else {
                            res.json({ state: "no config"});
                        }
                    });
                }
            });
        } else {
            res.json({ state: "device missing"});
        }
    });

    // 192.168.101.71:8080/register_user
    router.post('/register_user', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        //console.log(req.body);

        if(req.body.card_id && req.body.name && req.body.surname && req.body.mail && req.body.passwd){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                } else {

                    var query_string =  "select c.user_id from spezispezl.cards c where c.card_id = $1";
                    var query = {
                        name: "check_card_exists",
                        text: query_string,
                        values: [req.body.card_id],}
                    client.query(query, async function (err, result) {
                        if (err || result.rows.length != 0) {
                            done();
                            res.json({ state: "card already registered"});
                            return;
                        } else {
                            var query_string =  "insert into spezispezl.user (name, surname, mail, password) values ($1, $2, $3, $4) returning user_id;";
                            var token = generate_token();
                            var query = {
                                name: "create_user",
                                text: query_string,
                                values: [req.body.name, req.body.surname,  req.body.mail, await hash_pw(req.body.passwd)],}
                            client.query(query, function (err, result) {
                                if (result && result.rows.length) {
                                    //console.log(result.rows[0].user_id)
                                    var user_id = result.rows[0].user_id;
                                    var query_string =  " insert into spezispezl.cards (card_id, user_id) values ($1, $2);";
                                    var query = {
                                        name: "create_card",
                                        text: query_string,
                                        values: [req.body.card_id, user_id],}
                                    client.query(query, function (err, result) {
                                        if(err){
                                            console.log(err);
                                        } else {
                                            var query_string =  " insert into spezispezl.token (user_id, token) values ($1, $2);";
                                            var query = {
                                                name: "insert_token_reg",
                                                text: query_string,
                                                values: [user_id, token],}

                                            client.query(query, function (err, result) {
                                                done();
                                                if (err) {
                                                    console.log(err)
                                                     res.json({ state: "fail"});
                                                } else {
                                                    let info = transporter.sendMail({
                                                        from: 'Spezispezl <spezispezl@mail.de>', // sender address
                                                        to: req.body.mail, // list of receivers
                                                        subject: "Spezispezl Registrierung", // Subject line
                                                        text: "HTML erforderich",
                                                        html: 
                                                            `<p><strong>Deine Registrierung bei SpeziSpezl war erfolgreich</strong></p> \
                                                            <p>Um deinen Account benutzen zu können, musst du deine <a href="https://spezispezl.de?token=${token}">E-mail Addresse betätigen</a></p> \
                                                            <p>&nbsp;</p> \
                                                            <p>Dein SpeziSpezl</p>`
                                                      });
                                                    res.json({ state: "success"});
                                                }
                                            });
                                        }
                                    });
                                } else {
                                    console.log(err)
                                    done();
                                    if(err.code == 23505){
                                        res.json({ state: "user already exists"});
                                    } else {
                                        res.json({ state: "fail"});
                                    }
                                }
                            });
                        }
                    });
                }
            });
        } else {
            res.json({ state: "provide all data"});
        }
    });

    // 192.168.101.71:8080/verify
    router.post('/verify', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.token){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                    console.log(req.body.token)
                    var query_string =  "select user_id from spezispezl.token where token = $1;";
                    var query = {
                        name: "find_validation",
                        text: query_string,
                        values: [req.body.token],}
                    client.query(query, function (err, result) {
                        if(result && result.rows.length == 1){
                            console.log("Verification ok");
                            var query_string ='update spezispezl.user set mail_verified = true where user_id = $1';
                            var query = {
                                name: "verify_user",
                                text: query_string,
                                values: [result.rows[0].user_id],}
                            client.query(query, function (err, result) {
                                done();
                                if (err) {
                                    return next(err);
                                } else {
                                    res.json({ state: "success"});
                                }
                            });
                        } else {
                            done();
                            res.json({ state: "token invalid"});
                        }
                    });
                }
            });
        } else {
            res.json({ state: "unauthorized"});
        }
    });


    // 192.168.101.71:8080/login
    router.post('/login', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        
        if(req.body.mail && req.body.passwd){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                    var query_string =  "select * from spezispezl.user where mail = $1";
                    var query = {
                        name: "find_user",
                        text: query_string,
                        values: [req.body.mail],}
                    client.query(query, function (err, result) {
                        if(result && result.rows.length == 1){
                            bcrypt.compare(req.body.passwd, result.rows[0].password, function (err, pw_ok) {
                                if(pw_ok){
                                    console.log("Password ok");
                                    if(result.rows[0].mail_verified){
                                        var token = generate_token();
                                        var query_string ='insert into spezispezl.token (user_id, token) values ($2,$1);';
                                        var query = {
                                            name: "insert_usertoken",
                                            text: query_string,
                                            values: [token, result.rows[0].user_id],}
                                        client.query(query, function (err, result) {
                                            if (err) {
                                                done();
                                                return next(err);
                                            } else {
                                                res.json({ token: token});
                                                var query_string ="delete from spezispezl.token where current_timestamp - time_created > '4 weeks'::interval";
                                                var query = {
                                                    name: "purge_old_token",
                                                    text: query_string,
                                                    values: [],}
                                                client.query(query, function (err, result) {
                                                    done();
                                                    if (err) {
                                                        return next(err);
                                                    } else {
                                                        // ok
                                                    }
                                                });
                                            }
                                        });
                                    } else {
                                        done();
                                        res.json({ state: "account not verified"});
                                    }
                                } else {
                                    done();
                                    res.json({ state: "wrong password"});
                                }
                            });
                        } else {
                            done();
                            res.json({ state: "user not found"});
                        }
                    });
                }
            });
        } else {
            res.json({ state: "mail or passwor missing"});
        }
    });

    // 192.168.101.71:8080/logout?token=1
    router.post('/logout', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.token){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                    var query_string =  'delete from spezispezl.token where token = $1;';
                    var query = {
                        name: "logout",
                        text: query_string,
                        values: [req.body.token],}
                    client.query(query, function (err, result) {
                        done();
                        if (err) {
                            return next(err);
                        } else {
                            res.json({ state: "success"});
                        }
                    });
                }
            });
        } else {
            res.json({ state: "unauthorized"});
        }
    });

    router.post('/contact', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.token){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                    var query_string =  'select * from spezispezl.user where user_id = (select user_id from spezispezl.token where token = $1);';
                    var query = {
                        name: "get_user_all",
                        text: query_string,
                        values: [req.body.token],}
                    client.query(query, function (err, result) {
                        done();
                        if (err) {
                            return next(err);
                            res.json({ state: "fail"});
                        } else {
                            if(result && result.rows.length > 0){
                            let info = transporter.sendMail({
                            from: 'Spezispezl <spezispezl@mail.de>', // sender address
                            to: config.support_mail, // list of receivers
                            subject: "Spezispezl Supportanfrage", // Subject line
                            text: `${JSON.stringify(result.rows[0])}\n\nNachricht:\n${req.body.msg}`
                          });
                            res.json({ state: "success"});
                        }

                            
                        }
                    });
                }
            });
        } else {
            res.json({ state: "unauthorized"});
        }
    });

    router.post('/reset_passwd_mail', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.mail){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                    var query_string =  'select user_id, name, surname from spezispezl.user where lower(mail) = $1;';
                    var query = {
                        name: "reset_passwd_mail",
                        text: query_string,
                        values: [req.body.mail.toLowerCase()],}
                    client.query(query, function (err, result) {
                        if (err) {
                            done();
                            return next(err);
                            res.json({ state: "fail"});
                        } else {
                            if(result && result.rows.length > 0){
                                var name = result.rows[0].name;
                                var surname = result.rows[0].surname;
                                var query_string =  " insert into spezispezl.token (user_id, token) values ($1, $2) returning token;";
                                var query = {
                                    name: "insert_token_pw",
                                    text: query_string,
                                    values: [result.rows[0].user_id, generate_token()],}

                                client.query(query, function (err, result) {
                                    done();
                                    if (err) {
                                        console.log(err)
                                         res.json({ state: "fail"});
                                    } else {
                                        if(result && result.rows.length > 0){
                                            let info = transporter.sendMail({
                                            from: 'Spezispezl <spezispezl@mail.de>', // sender address
                                            to: req.body.mail.toLowerCase(), // list of receivers
                                            subject: "Spezispezl Passwort vergessen", // Subject line
                                            text: "HTML erforderich",
                                            html: 
                                                `<p><strong>Passwort zurücksetzen</strong></p> \
                                                <p>Klicke <a href="https://spezispezl.de?reset_passwd_token=${result.rows[0].token}">hier</a> um dein Passwort zurückzusetzen.<br>Falls du dein passwort noch kennst, kannst du diese Mail einfach ignorieren.</p> \
                                                <p>&nbsp;</p> \
                                                <p>Dein SpeziSpezl</p>`
                                          });
                                          res.json({ state: "success"});
                                        } else {
                                            res.json({ state: "failed to set token"});
                                        }
                                    }
                                });
                            } else {
                                done();
                                res.json({ state: "user not found"});
                            }
                        }
                    });
                }
            });
        } else {
            res.json({ state: "unauthorized"});
        }
    });


    // /set_password?token=1 #post: pw, (optional) pw_old
    router.post('/set_password', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.token){
            pool.connect(async function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                    if(req.body.pw_old){
                        var query_string =  'select password from spezispezl.user where user_id = (select user_id from spezispezl.token where token = $1);';
                        var query = {
                            name: "get_user_pw",
                            text: query_string,
                            values: [req.body.token],}
                        client.query(query, async function (err, result) {
                            if (err) {
                                return next(err);
                                res.json({ state: "token abgelaufen"});
                            } else {
                                if(result && result.rows.length > 0){
                                    bcrypt.compare(req.body.pw_old, result.rows[0].password, async function (err, pw_ok) {
                                        if(pw_ok){
                                            var query_string =  'update spezispezl.user set password = $2 where user_id = (select user_id from spezispezl.token where token = $1) returning user_id;';
                                            var nquery = {
                                                name: "set_passwd",
                                                text: query_string,
                                                values: [req.body.token, await hash_pw(req.body.pw)],}
                                            client.query(nquery, function (err, result) {
                                                if (err) {
                                                    return next(err);
                                                    res.json({ state: "fail"});
                                                } else {
                                                    if(result && result.rows.length > 0){
                                                        var query_string =  'delete from spezispezl.token where token = $1;';
                                                        var query = {
                                                            name: "del_token",
                                                            text: query_string,
                                                            values: [req.body.token],}
                                                        client.query(query, function (err, result) {
                                                            done();
                                                            if (err) {
                                                                return next(err);
                                                            } else {
                                                                res.json({ state: "success"});
                                                            }
                                                        });
                                                    }else{
                                                        res.json({ state: "token abgelaufen"});
                                                    }
                                                }
                                            });
                                        } else {
                                            done();
                                            res.json({ state: "current password wrong"});
                                            return;
                                        }
                                    });
                                } else {
                                    res.json({ state: "token abgelaufen"});
                                    return;
                                }
                            }
                        });
                    } else {
                        var query_string =  'update spezispezl.user set password = $2 where user_id = (select user_id from spezispezl.token where token = $1) returning user_id;';
                        var nquery = {
                            name: "set_passwd",
                            text: query_string,
                            values: [req.body.token, await hash_pw(req.body.pw)],}

                        client.query(nquery, function (err, result) {
                            if (err) {
                                return next(err);
                                res.json({ state: "fail"});
                            } else {
                                if(result && result.rows.length > 0){
                                    var query_string =  'delete from spezispezl.token where token = $1;';
                                    var query = {
                                        name: "del_token",
                                        text: query_string,
                                        values: [req.body.token],}
                                    client.query(query, function (err, result) {
                                        done();
                                        if (err) {
                                            return next(err);
                                        } else {
                                            res.json({ state: "success"});
                                        }
                                    });
                                }else{
                                    res.json({ state: "token abgelaufen"});
                                }
                            }
                        });
                    }
                }
            });
        } else {
            res.json({ state: "unauthorized"});
        }
    });

    


        // 192.168.101.71:8080/set_balance_alert?token=1&alert=4.55
    router.post('/set_balance_alert', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.token && req.body.alert){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                    var query_string =  'update spezispezl.user set balance_alert = $1 where user_id = (select user_id from spezispezl.token where token = $2);';
                    var query = {
                        name: "set_balance_alert",
                        text: query_string,
                        values: [req.body.alert, req.body.token],}
                    client.query(query, function (err, result) {
                        done();
                        if (err) {
                            return next(err);
                        } else {
                            res.json({ state: "success"});
                        }
                    });
                }
            });
        } else {
            res.json({ state: "unauthorized"});
        }
    });


    router.post('/fillup', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.token && req.body.device && req.body.data){
            var device = req.body.device;
            var token = req.body.token;
            var data = JSON.parse(req.body.data);
            //console.log(data);
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                     // todo acheck auth
                    for(const [i, s] of data.entries()){
                        var query_string =`update spezispezl.config set product = $1, items = $2 where device = $3 and slot = $4 and $5 in (select token from spezispezl.token where user_id in (select user_id from spezispezl.user where is_filler));`;
                        var query = {
                            name: "update_config_row2",
                            text: query_string,
                            values: [s.product, parseInt(s.items), device, parseInt(s.slot), token],}
                        //console.log(query);
                        client.query(query, function (err, result) {
                            if (err) {
                                console.log(err);
                                done();
                                res.json({ state: "fail"});
                                return;
                            } else {
                                //console.log("ok");
                            }
                        });
                    }
                    done();
                    res.json({ state: "success"});
                }
                    
                
             });
        } else {
            res.json({ state: "unauthorized"});
        }
    });


    router.post('/list_cards', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.token){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {

                    var query_string =  "select card_id, time_added as added from spezispezl.cards where user_id = (select user_id from spezispezl.token where token = $1) and active = true;";
                    var query = {
                        name: "list_cards",
                        text: query_string,
                        values: [req.body.token],}
                    client.query(query, function (err, result) {
                        done();
                        if(result && result.rows.length > 0){
                            res.send(result.rows);
                        } else {
                            console.log(err);
                            res.json({ state: "fail"});
                        }
                    });
                }
            });
        } else {
            res.json({ state: "unauthorized"});
        }
    });


    // 192.168.101.71:8080/add_card?token=1&card_id=AAA
    router.post('/add_card', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.token && req.body.card_id){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    res.json({ state: "db connection error"});
                } else {
                    var query_string =  "insert into spezispezl.cards (card_id, user_id) values ($2, (select user_id from spezispezl.token where token = $1));";
                    var query = {
                        name: "add_card",
                        text: query_string,
                        values: [req.body.token, req.body.card_id],}
                    client.query(query, function (err, result) {
                        done();
                        if (err) {
                            console.log(err);
                            res.json({ state: "error"});
                        } else {
                            res.json({ state: "success"});
                        }
                    });
                }
            });
        } else { res.json({ state: "values missing"});}
    });

    router.post('/supply', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.token && req.body.device && req.body.price && req.body.comment){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                    var query_string =  "select token from spezispezl.token where user_id in (select user_id from spezispezl.user where is_filler) and token = $1;";
                    var query = {
                        name: "check_filler_rights",
                        text: query_string,
                        values: [req.body.token],}
                    client.query(query, function (err, result) {
                        if (err) {
                            done();
                            console.log(err);
                            res.json({ state: "error"});
                        } else {
                            if(result && result.rows.length > 0){
                                var query_string =`insert into spezispezl.transactions (user_id, source, product, price, sender, verified, committed ) values ( $1, $2, 'supply', $3, $4, true, true)`;
                                var query = {
                                    name: "insert_supply",
                                    text: query_string,
                                    values: [2, req.body.device, req.body.price, req.body.comment],}
                                //console.log(query);
                                client.query(query, function (err, result) {
                                    done();
                                    if (err) {
                                        console.log(err);
                                        res.json({ state: "fail"});
                                        return;
                                    } else {
                                       res.json({ state: "success"});
                                    }
                                });
                            } else {
                                done();
                                res.json({ state: "unauthorized"});
                            }
                        }
                    });
                }
             });
        } else {
            res.json({ state: "unauthorized"});
        }
    });

        router.post('/storno', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.token && req.body.id){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                    var query_string = 'select u.surname, u.name, t.* from spezispezl.transactions t, spezispezl.user u where u.user_id = t.user_id and t.user_id = (select user_id from spezispezl.token where token = $1) and t.id = $2;';
                    var query = {
                        name: "get_transaction_storno",
                        text: query_string,
                        values: [req.body.token, req.body.id],}
                    client.query(query, function (err, result) {
                        done();
                        if (err) {
                            return next(err);
                            res.json({ state: "fail"});
                        } else {
                            if(result && result.rows.length > 0){
                                let info = transporter.sendMail({
                                from: 'Spezispezl <spezispezl@mail.de>', // sender address
                                to: config.support_mail, // list of receivers
                                subject: "Spezispezl Stornoanfrage", // Subject line
                                html: 
                                    `<p><strong>Stornoanfrage für ${req.body.id}</strong></p><br> \
                                    ${JSON.stringify(result.rows[0])}<br><br>Nachricht:<br>${req.body.msg}<br><br>\
                                    <p><a href="https://spezispezl.de?id=${req.body.id}#confirm_storno">Bestätigen</a></p> \
                                    <p>&nbsp;</p> \
                                    <p>Dein SpeziSpezl</p>`,
                                text: `need html`
                              });
                                res.json({ state: "success"});
                            }
                        }
                    });
                }
            });
        } else {
            res.json({ state: "unauthorized"});
        }
    });

    router.post('/confirm_storno', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.token && req.body.id){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                    var query_string = 'update spezispezl.transactions set committed = false where committed = true and id = $2 and (select is_filler from spezispezl.user where user_id = (select user_id from spezispezl.token where token = $1)) returning price, user_id;';
                    var query = {
                        name: "do_transaction_storno",
                        text: query_string,
                        values: [req.body.token, req.body.id],}
                    client.query(query, function (err, result) {
                        if (err) {
                            return next(err);
                            res.json({ state: "fail"});
                        } else {
                            if(result && result.rows.length == 1){
                                var price = result.rows[0].price;
                                var user_id = result.rows[0].user_id
                                var query_string = "insert into spezispezl.transactions (user_id, source, product, transaction_id, price, balance_new, verified, committed) values ($1,'chargeback','chargeback', $3, $2, (select balance from spezispezl.user where user_id= $1) +$2, true, true)";
                                var query = {
                                    name: "insert_transaction_storno",
                                    text: query_string,
                                    values: [user_id, -price, `${req.body.id} Rückbuchung`],}
                                client.query(query, function (err, result) {
                                    if (err) {
                                        return next(err);
                                        res.json({ state: "fail"});
                                    } else {
                                        var query_string =  'update spezispezl.user set balance = balance-$2 where user_id = $3 and (select is_filler from spezispezl.user where user_id = (select user_id from spezispezl.token where token = $1)) returning balance;';
                                        var query = {
                                            name: "do_balance_storno",
                                            text: query_string,
                                            values: [req.body.token, price, user_id],}
                                        client.query(query, function (err, result) {
                                            done();
                                            if (err) {
                                                return next(err);
                                                res.json({ state: "fail"});
                                            } else {
                                                if(result && result.rows.length == 1){
                                                    //console.log(result.rows[0].balance);
                                                    res.json({ state: "success"});
                                                } else {
                                                    res.json({ state: "fail2"});
                                                }
                                            }
                                        });
                                    }
                                });
                            } else {
                                res.json({ state: "no result"});
                            }
                        }
                    });
                }
            });
        } else {
            res.json({ state: "unauthorized"});
        }
    });


// Statistics
// ##############################################################################################################################
    router.post('/stat_weekly_personal', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.token){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                    var query_string =  "SELECT product, count (*), date_trunc('week', time) as time FROM spezispezl.transactions WHERE source = 'sielaff' and user_id = (select user_id from spezispezl.token where token = $1) \
                                        group by  product, date_trunc('week', time) order by date_trunc('week', time)";
                    var query = {
                        name: "get_weekly_personal",
                        text: query_string,
                        values: [req.body.token],}
                    client.query(query, function (err, result) {
                        done();
                        if(result && result.rows.length > 0){
                            res.send(result.rows);
                        } else {
                            console.log(err);
                            res.json({ state: "fail"});
                        }
                    });
                }
            });
        } else {
            res.json({ state: "unauthorized"});
        }
    });

    router.post('/stat_weekly_all', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.token){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                    var query_string =  "SELECT product, count (*), date_trunc('week', time) as time FROM spezispezl.transactions WHERE source = 'sielaff' \
                                        group by  product, date_trunc('week', time) order by date_trunc('week', time)";
                    var query = {
                        name: "get_weekly_all",
                        text: query_string,
                        values: [],}
                    client.query(query, function (err, result) {
                        done();
                        if(result && result.rows.length > 0){
                            res.send(result.rows);
                        } else {
                            console.log(err);
                            res.json({ state: "fail"});
                        }
                    });
                }
            });
        } else {
            res.json({ state: "unauthorized"});
        }
    });


    router.post('/stat_streak_current', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.token){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                    var query_string =      "with stuff as ( \
                                            select user_id, time from spezispezl.transactions union (select user_id, time from spezispezl.user cross join (select * from  (select '2022-03-01'::date + s*'1day'::interval as time from \
                                            generate_series(0,current_timestamp::date - '2022-03-01'::date) s)foo \
                                            where extract(dow from time)=0 or extract(dow from time)=6) t) \
                                            ) , cte as ( \
                                            select user_id, time, date(time) as date_, date(time) - dense_rank() over ( partition by user_id order by date(time)) * interval '1 day' as filter from stuff ) \
                                            select (select name || ' ' || surname from spezispezl.user where user_id = t.user_id) as name, count from (select \
                                            user_id, count(distinct date_) -1 as count , date(max(time)) as cdate from cte group by user_id, filter \
                                            having count(distinct date_) -1 >0) t where date(t.cdate) = date(current_timestamp);"
                    var query = {
                        name: "stat_streak_current",
                        text: query_string,
                        values: [],}
                    client.query(query, function (err, result) {
                        done();
                        if(result && result.rows.length > 0){
                            res.send(result.rows);
                        } else {
                            console.log(err);
                            res.json({ state: "fail"});
                        }
                    });
                }
            });
        } else {
            res.json({ state: "unauthorized"});
        }
    });


    router.post('/stat_streak_max', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.token){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                    var query_string = "with stuff as ( select user_id, time from spezispezl.transactions union (select user_id, time from spezispezl.user cross join (select * from  (select '2022-03-01'::date + s*'1day'::interval as time from \
                                        generate_series(0,current_timestamp::date - '2022-03-01'::date) s)foo \
                                        where extract(dow from time)=0 or extract(dow from time)=6) t)), cte as (select user_id, time, date(time) date_,date(time) - dense_rank() over ( partition by user_id order by date(time)) * interval '1 day' as filter \
                                        from stuff ) select user_id, (select name || ' ' || surname from spezispezl.user where user_id = t.user_id) as name, max(count) from (select \
                                        user_id, count(distinct date_) -1 as count , date(max(time)) as cdate from cte group by user_id, filter having count(distinct date_) -1 >0) t group by user_id, name;"
                    var query = {
                        name: "stat_streak_max",
                        text: query_string,
                        values: [],}
                    client.query(query, function (err, result) {
                        done();
                        if(result && result.rows.length > 0){
                            res.send(result.rows);
                        } else {
                            console.log(err);
                            res.json({ state: "fail"});
                        }
                    });
                }
            });
        } else {
            res.json({ state: "unauthorized"});
        }
    });








    module.exports = router;

}

());

var rand = function() {
    return Math.random().toString(36).substr(2); // remove `0.`
    };

var generate_token = function() {
    return rand() + rand(); // to make it longer
};

async function hash_pw (pw) {
  const hashedPassword = await new Promise((resolve, reject) => {
    bcrypt.hash(pw, 10, function(err, hash) {
      if (err) reject(err)
      resolve(hash)
    });
  })

  return hashedPassword
}



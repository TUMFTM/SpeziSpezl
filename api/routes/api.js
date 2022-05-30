(function () {

    var main_app = require('../app');
    var fs = require('fs');
    var util = require('util');
    var config = require('../config');

    // 'use strict';

    const nodemailer = require("nodemailer");
    let transporter = nodemailer.createTransport(config.mail);

    var express = require('express');
    var url = require("url");
    var app = express();
    var router = express.Router();
    const pg = require('pg');
    const http = require('https');
    var cors = require('cors');
    app.use(cors());
    cors({credentials: true, origin: true})

    const bcrypt = require('bcrypt');
    var uid = require('rand-token').uid;
    last_send = 0;

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


    // 192.168.101.71:8080/get_balance?card_id=AABBCCDDEE
    router.post('/get_balance', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.card_id){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                    var query_string =  "select u.balance, u.surname, u.trusted from spezispezl.user u, spezispezl.cards c where u.user_id = c.user_id and c.card_id = $1";
                    var query = {
                        name: "get_balance2",
                        text: query_string,
                        values: [req.body.card_id],}
                    client.query(query, function (err, result) {
                        done();
                        if (err) {
                            return next(err);
                        } else {
                            if(result && result.rows.length > 0){
                                res.send(result.rows[0]);
                                console.log(`Balance: ${result.rows[0].balance}`);
                            } else {
                                res.json({ state: "user not exists"});
                            }
                        }
                    });
                }
            });
        }
    });

    // 192.168.101.71:8080/get_products?device=sielaff&card_id=AABBCCDDEE

    router.post('/get_products', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.card_id && req.body.device){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {

                    var query_string =  "select * from (select (select price_group from spezispezl.user where user_id = (select user_id from spezispezl.cards where card_id = $1)) as price_group, c.slot, p.*, c.items from spezispezl.config c, spezispezl.products p where c.device = $2 and p.name = c.product) z where  price_group is not NULL";
                    var query = {
                        name: "get_products_price_group",
                        text: query_string,
                        values: [req.body.card_id, req.body.device],}
                    client.query(query, function (err, result) {
                        done();
                        if (err) {
                            return next(err);
                        } else {
                            //console.log(result.rows);
                            if(result.rows.length > 0){
                                var pg = result.rows[0].price_group;
                                var data = result.rows.map(x => {return {
                                    slot: x.slot,
                                    product_id: x.product_id,
                                    items: x.items,
                                    price: x[pg],
                                    price_fix: x.price_fix,
                                    name: x.name,
                                    display_name: x.display_name,
                                    property: x.property
                                }});
                                res.send(data);

                            } else {
                                res.json({ state: "user not exists"});
                            }
                        } 
                    });
                }
            });
        }
    });
    
    // https://spezispezl.de/api/do_transaction?card_id=AABBCCDDEE&device=sielaff&slot=1
    // https://spezispezl.de/api/do_transaction?card_id=AABBCCDDEE&device=astoria&slot=1&single=true
    router.post('/do_transaction', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if( req.body.slot && req.body.device && req.body.card_id){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                    if(req.body.single){ // finish transaction in a single request

                        var query_string =  "select * from (select u.price_group, u.balance, u.trusted,  \
                         c.slot, p.*, c.items from spezispezl.config c, spezispezl.products p, (select price_group, balance, trusted from spezispezl.user where user_id = (select user_id from spezispezl.cards where card_id = $1)) u where c.device = $3 and p.name = c.product) z where  price_group is not NULL and slot = $2";
                        var query = {
                            name: "get_products_price_group_slot",
                            text: query_string,
                            values: [req.body.card_id, req.body.slot, req.body.device],}
                        client.query(query, function (err, result) {
                            //console.log(result.rows);
                            if (err) {
                                done();
                                return next(err);
                            } else if(result.rows.length > 0){
                                var price = parseFloat(result.rows[0][result.rows[0].price_group]);
                                var price_fix = parseFloat(result.rows[0].price_fix);
                                if( (parseFloat(result.rows[0].balance) >= price) || result.rows[0].trusted){
                                    if(req.body.parameter){ // price per parameter unit + price_fix
                                        price = price*parseFloat(req.body.parameter) + price_fix;
                                    }
                                    var query_string =  " insert into spezispezl.transactions (user_id, source, slot, product, price, balance_new, verified, items, committed, parameter) values ( (select user_id from spezispezl.cards where card_id = $1), $2, $3, \
                                    (select c.product from spezispezl.config c where c.slot = $3 and c.device = $2), 0.0- $4, \
                                    (select u.balance from spezispezl.user u where u.user_id =  (select user_id from spezispezl.cards where card_id = $1)) -$4 , true, (select c.items from spezispezl.config c where c.slot = $3 and c.device = $2)-1, true, $5) returning id;";
                                    var query = {
                                        name: "do_transaction_single",
                                        text: query_string,
                                        values: [req.body.card_id, req.body.device, req.body.slot, price, req.body.parameter],}

                                    client.query(query, function (err, result) {
                                        if (err) {
                                            done();
                                            console.log(err);
                                            return next(err);
                                        } else if(result && result.rows.length){
                                            //console.log(result.rows[0].id);
                                            var query_string = "update spezispezl.user set balance = balance + (select price from spezispezl.transactions where id = $1) where user_id = (select user_id from spezispezl.cards where card_id = $2) returning (select user_id from spezispezl.cards where card_id = $2), balance, balance_alert, mail;";
                                            var query = {
                                                name: "update_balance_single",
                                                text: query_string,
                                                values: [result.rows[0].id, req.body.card_id],}
                                            client.query(query, function (err, result) {
                                                if (err) {
                                                    done();
                                                    console.log(err);
                                                    return next(err);
                                                }
                                                if(result && result.rows.length){
                                                    var balance_alert = parseFloat(result.rows[0].balance_alert);
                                                    if( balance_alert !=-1 && parseFloat(result.rows[0].balance) < balance_alert){
                                                        send_balance_alert(transporter, result.rows[0]);
                                                    }
                                                    var query_string =  "update spezispezl.config set items = items - 1, last_request = CURRENT_TIMESTAMP where device = $1 and slot = $2 returning device, slot, product, items;";
                                                    var query = {
                                                        name: "sub_item",
                                                        text: query_string,
                                                        values: [req.body.device, req.body.slot],}
                                                    client.query(query, function (err, result) {
                                                        if(err){
                                                            done();
                                                            res.json({ state: "fail"});
                                                        } else {
                                                            if( (result && result.rows[0][3] > 0 && result.rows[0][3] < config.alert_limit)){
                                                                var missing = result.rows[0];
                                                                var query_string =  "SELECT distinct(t.product), sum(t.items) FROM spezispezl.config t group by t.product;";
                                                                var query = {
                                                                    name: "get_all_items",
                                                                    text: query_string,
                                                                    values: [],}
                                                                client.query(query, function (err, result) {
                                                                    done();
                                                                    if (err) {
                                                                        return next(err);
                                                                    } else {
                                                                        if(result && result.rows.length > 0){
                                                                            var all="";
                                                                            for (r of result.rows){
                                                                                all = all + `${r.product}: ${r.sum}\n`
                                                                            }
                                                                        }
                                                                        send_items_alert(transporter, config, missing, all);
                                                                    }
                                                                });
                                                            } else {
                                                                done();
                                                            }
                                                            res.json({ state: "success"}); 
                                                        }
                                                    });
                                                } else {
                                                   done();
                                                   res.json({ state: "fail"});
                                                }
                                            });
                                        }
                                    });
                                } else {
                                    res.json({ state: "balance not sufficient"});
                                }
                            } else {res.json({ state: "user not exists"});}
                        });
                    } 
                    //else{ // need to verify transaction --> currently no supportet and outdated
                    //    var query_string =  " insert into spezispezl.transactions (user_id, source, slot, product, price, balance_new, verified, items, committed) values ( (select user_id from spezispezl.cards where card_id = $1), $2, $3, \
                    //    (select c.product from spezispezl.config c where c.slot = $3 and c.device = $2), (select -price from spezispezl.get_price($1, $2) where slot = $3), \
                    //    (select u.balance from spezispezl.user u where u.user_id =  (select user_id from spezispezl.cards where card_id = $1)) - (select price from spezispezl.get_price($1, $2) where slot = $3), false, (select c.items from spezispezl.config c where c.slot = $3 and c.device=$2)-1, false ) returning balance_new;";
                    //    var query = {
                    //        name: "transaction",
                    //        text: query_string,
                    //        values: [req.body.card_id, req.body.device, req.body.slot],}
                    //    client.query(query, function (err, result) {
                    //        done();
                    //        if (err) {
                    //            return next(err);
                    //        } else {
                    //            res.json({ state: "success"});
                    //        }
                    //    });
                    //}
                }
            });
        }
    });



    // 192.168.101.71:8080/log_sensor?id=1&value=3.5
    router.post('/log_sensor', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        if(req.body.id && req.body.value){
            pool.connect(function (err, client, done) {
                if (err) {
                    done();
                    console.log(err);
                    return next(err);
                } else {
                    var query_string =  "insert into spezispezl.sensors (sensor_id, value) values ($1, $2);";
                    var query = {
                        name: "log_sensor",
                        text: query_string,
                        values: [req.body.id, req.body.value],}
                    client.query(query, function (err, result) {
                        done();
                        if (err) {
                            return next(err);
                        } else {
                            res.json({ sensor: "success"});
                        }
                    });
                }
            });
        }
    });

    router.post('/log', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        //console.log(req.body.message);
        if(req.body.message){
            var log_file = fs.createWriteStream(__dirname + '/all.log', {flags : 'a'});
            log_file.write(util.format(req.body.message) + '\n');
            res.json({ state: "success"});
            
        }
    });


    router.post('/send_alert', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        //console.log(req.body.message);
        if(req.body.type && req.body.slot ){
            if(Date.now() - last_send > 3600000){
                last_send = Date.now();
                send_alert(transporter, config, req.body.type, req.body.slot);
                console.log("sending alert mail");
            } else {console.log("alert already sent");}
            res.json({ state: "success"});
        }
    });


        //192.168.101.71:8080/verify_transaction?card_id=AABBCCDDEE&device=sielaff&slot=1
    //router.post('/verify_transaction', function (req, res, next) {
    //    res.setHeader('Access-Control-Allow-Origin', '*');
    //    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
    //    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
    //    res.setHeader('Access-Control-Allow-Credentials', true); // If needed
//
    //    if(req.body.slot && req.body.device && req.body.card_id){
    //        //console.log(req.body);
    //        pool.connect(function (err, client, done) {
    //            if (err) {
    //                done();
    //                console.log(err);
    //                return next(err);
    //            } else {
    //                var query_string =  "update spezispezl.transactions set verified = true, committed= true where source = $2 and slot = $3 and time > current_timestamp - interval '12 seconds' and user_id = (select user_id from spezispezl.cards where card_id = $1) returning balance_new;";
    //                var query = {
    //                    name: "verify_transaction",
    //                    text: query_string,
    //                    values: [req.body.card_id, req.body.device,  req.body.slot],}
    //                client.query(query, function (err, result) {
    //                    if (err) {
    //                        console.log(err);
    //                        return next(err);
    //                    } else {
    //                        if(result && result.rows.length){
    //                            console.log(result.rows[0]);
    //                            var query_string =  "update spezispezl.user set balance = balance - (select price from spezispezl.get_price($1, $2) where slot = $3) where user_id = (select user_id from spezispezl.cards where card_id = $1) returning (select user_id from spezispezl.cards where card_id = $1), balance, balance_alert, mail;";
    //                            var query = {
    //                                name: "update_balance",
    //                                text: query_string,
    //                                values: [req.body.card_id, req.body.device,  req.body.slot],}
    //                            client.query(query, function (err, result) {
    //                                if(result && result.rows.length){
    //                                    console.log(result.rows[0].balance);
    //                                    var balance_alert = parseFloat(result.rows[0].balance_alert);
    //                                    if( balance_alert !=-1 && parseFloat(result.rows[0].balance) < balance_alert){
    //                                        send_balance_alert(transporter, result.rows[0]);
    //                                    }
//
    //                                    var query_string =  "update spezispezl.config set items = items - 1, last_request = CURRENT_TIMESTAMP where device = $1 and slot = $2 returning device, slot, product, items;";
    //                                    var query = {
    //                                        name: "sub_item",
    //                                        text: query_string,
    //                                        values: [req.body.device, req.body.slot],}
    //                                    client.query(query, function (err, result) {
    //                                        if (err) {
    //                                            return next(err);
    //                                        } else {
    //                                            // send alert to filler
    //                                            if( (result && result.rows[0][0] < config.alert_limit)){
    //                                                var missing = result.rows[0];
    //                                                var query_string =  "SELECT distinct(t.product), sum(t.items) FROM spezispezl.config t group by t.product;";
    //                                                var query = {
    //                                                    name: "get_all_items",
    //                                                    text: query_string,
    //                                                    values: [],}
    //                                                client.query(query, function (err, result) {
    //                                                    if (err) {
    //                                                        return next(err);
    //                                                    } else {
    //                                                        if(result && result.rows.length > 0){
    //                                                            var all="";
    //                                                            for (r of result.rows){
    //                                                                all = all + `${r.product}: ${r.sum}\n`
    //                                                            }
    //                                                        }
    //                                                        send_items_alert(transporter, missing, all);
    //                                                    }
    //                                                });
    //                                            }
    //                                            done();
    //                                            res.json({ state: "success"});
    //                                        }
    //                                    });
    //                                } else {
    //                                    done();
    //                                    res.json({ state: "card not registered"});}
    //                            });
    //                        } else {
    //                            done();
    //                            res.json({ state: "error"});
    //                        }
    //                    }
    //                });
    //            }
    //        });
    //    }
    //});

    module.exports = router;

}

());

function send_balance_alert(transporter, d){
    let info = transporter.sendMail({
        from: 'Spezispezl <spezispezl@mail.de>', // sender address
        to: d.mail, // list of receivers
        subject: `Dein Guthaben beträgt nur noch ${d.balance}€`, // Subject line
        text: "HTML erforderich",
        html: `<p>Dein aktuelles Guthaben beträgt noch ${d.balance}€.<br> \
               Du kannst es über diesen <a href="https://www.paypal.com/paypalme/spezispezl">PayPal Link</a> oder einer PayPal zahlung an <a href="mailto:spezispezl@mail.de">spezispezl@mail.de</a> wieder aufladen</p><br> \
               <br>Den Grenzwert für diese Benachichtigung kannst du in <a href="https://spezispezl.de">deinem Konto</a> anpassen. \
               <p>&nbsp;</p> \
               <p>Dein SpeziSpezl</p>`
        });
}

function send_items_alert(transporter, config, d, all){
    let info = transporter.sendMail({
        from: 'Spezispezl <spezispezl@mail.de>', // sender address
        to: config.alert_mail, // list of receivers
        subject: `${d.device}: ${d.product} in Slot ${d.slot} fast leer: ${d.items}`, // Subject line
        text: `${d.device} Slot ${d.slot} ${d.product} Stückzahl: ${d.items}\n\nInsgesamt verfübar:\n${all}`
     });
}

function send_alert(transporter, config, type, slot){
    let info = transporter.sendMail({
        from: 'Spezispezl <spezispezl@mail.de>', // sender address
        to: config.alert_mail, // list of receivers
        subject: `Alert: ${type} Slot: ${slot}`, // Subject line
        text: `Alert: ${type} Slot: ${slot}`
     });
}

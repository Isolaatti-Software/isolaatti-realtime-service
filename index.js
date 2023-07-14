

const ISOLAATTI_BACKEND_SERVER = process.env.backend ? process.env.backend : "http://localhost:5000";
const isProduction = process.env.env === "production" ?? false;
const postgresPwd = process.env.postgrespwd;
console.log("Backend: " + ISOLAATTI_BACKEND_SERVER);
console.log("Is Production: " + isProduction);

const SECRET_HASH = process.env.secret_hash !== undefined 
    ? process.env.hash 
    // This is the hash for "password", that`s the secret that should be used during development. If
    // another secret is going to be used, then define an environment variable called "secret_hash" or
    // change the line below.
    // To generate a new hash, use bcrypt library with saltRounds = 10
    : "$2b$10$VDxk.r70kAN6pHjtDRVOOOJKm950QtaEZ9.ss9g6cTrF8U6S5rYIS";


const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const bodyParser = require("express");
const axios = require("axios").default;
const bcrypt = require('bcrypt');
const { createAdapter, PostgresAdapter } = require("@socket.io/postgres-adapter");
const { Pool } = require("pg");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
const httpServer = createServer(app);
const io = new Server(httpServer, {
        cors: {
            origin: ["http://localhost:5000", "http://127.0.0.1:5000", "https://isolaatti.com", "http://10.0.0.17:5000"],
            credentials: true
        }
    }
);

io.use((socket, next) => {
    const token = socket.handshake.auth.authorization;
    const clientId = socket.handshake.auth.clientId;
    // console.log(token);
    // Make authentication against Isolaatti backend
    axios.request({
        url:`${ISOLAATTI_BACKEND_SERVER}/api/LogIn/Verify`,
        method: "post",
        headers: {
            'Content-Type': 'application/json',
            'sessionToken': token
        }
    }).then(response => {
        const authResult = response.data;
        if(authResult.isValid) {
            socket.join(`user-${authResult.userId}`);
            socket.on("subscribe-scope", (scopeData) => {
                console.log(scopeData);
                socket.join(`${scopeData.type}-${scopeData.id}`);
            });
            next();
            // console.log("Successful authentication");
        } else {
            next({message: "Authentication failed, invalid token", data: authResult});
        }

    }).catch(error => {
        console.error(error);
    })

});

async function validateSecret(key){
    return bcrypt.compare(key, SECRET_HASH)
}

app.post("/send_notification", async (req, res) => {
   const payload = req.body;
   if(!await validateSecret(payload.secret)){
       res.send({status: "invalid"});
   }

   const userId = payload.userId;
   io.to(`user-${userId}`).emit("notification", payload.data);
   res.send();
});

app.post("/event", async (req, res) => {
    const payload = req.body;
    if(!await validateSecret(payload.secret)){
        res.send({status: "invalid"});
    }
    const eventData = payload.eventData;
    const roomName = `${eventData.type}-${eventData.relatedId}`;
    io.to(roomName).emit(eventData.type, eventData.clientId, eventData.relatedId, eventData.payload);
    if(process.env.backend === undefined){
        console.log(eventData);
    }
    res.send();
});

if(isProduction) {
    const pool = new Pool({
        user: "app",
        host: "10.116.0.3",
        database: "socketio",
        password: postgresPwd,
        port: 5432,
      });

    pool.query(`
      CREATE TABLE IF NOT EXISTS socket_io_attachments (
          id          bigserial UNIQUE,
          created_at  timestamptz DEFAULT NOW(),
          payload     bytea
      );`);
    
    io.adapter(createAdapter(pool));
}



httpServer.listen(3000);
console.log("Listening on port 3000");

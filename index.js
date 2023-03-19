

const ISOLAATTI_BACKEND_SERVER = process.env.backend ? "https://isolaatti.com" : "http://localhost:5000";
console.log("Backend production: " + process.env.backend);

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

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
const httpServer = createServer(app);
const io = new Server(httpServer, {
        cors: {
            origin: ["http://localhost:5000", "https://isolaatti.com", "http://10.0.0.17:5000"],
            credentials: true
        }
    }
);

io.use((socket, next) => {
    const token = socket.handshake.auth.sessionToken;
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

httpServer.listen(3000);
console.log("Listening on port 3000");
